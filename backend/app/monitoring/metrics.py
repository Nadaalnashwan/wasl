
"""Metric computation from stored events (ai_events, http_events, quality_events,
error_logs, eval_runs).

Everything shown on the Monitoring dashboard is calculated from real rows.
Alert rules live in app/monitoring/alerts.py and are evaluated by an independent scheduler.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AIEvent, ErrorLog, EvalRun, HTTPEvent, QualityEvent


def percentile(values: list[float], p: float) -> float | None:
    """None when there is no data (shown as N/A — never as a healthy 0 ms)."""
    if not values:
        return None

    s = sorted(values)
    k = (len(s) - 1) * p / 100
    f, c = int(k), min(int(k) + 1, len(s) - 1)
    return round(s[f] + (s[c] - s[f]) * (k - f), 1)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def compute(
    db: Session,
    days: int = 7,
    user_id: str | None = None,
    *,
    provider: str | None = None,
    model: str | None = None,
    task: str | None = None,
    since: datetime | None = None,
) -> dict:
    since = since or datetime.now(UTC) - timedelta(days=days)

    def scoped(stmt, model_cls):
        stmt = stmt.where(model_cls.created_at >= since)
        if user_id and hasattr(model_cls, "user_id"):
            stmt = stmt.where(model_cls.user_id == user_id)
        return stmt

    ai_stmt = scoped(select(AIEvent), AIEvent)
    if provider:
        ai_stmt = ai_stmt.where(AIEvent.provider == provider)
    if model:
        ai_stmt = ai_stmt.where(AIEvent.model == model)
    if task:
        ai_stmt = ai_stmt.where(AIEvent.task == task)
    ai = db.scalars(ai_stmt).all()
    http = db.scalars(scoped(select(HTTPEvent), HTTPEvent)).all()
    q_stmt = scoped(select(QualityEvent), QualityEvent)
    if task:
        q_stmt = q_stmt.where(QualityEvent.task == task)
    q = db.scalars(q_stmt).all()

    # AI requests: all attempts sharing a request_id form one logical request.
    by_req: dict[str, list[AIEvent]] = defaultdict(list)
    for event in ai:
        by_req[event.request_id].append(event)

    ok_reqs = {
        request_id
        for request_id, events in by_req.items()
        if any(event.status == "success" for event in events)
    }
    failed_reqs = set(by_req) - ok_reqs

    fallback_reqs = {
        request_id
        for request_id in ok_reqs
        if any(
            event.status == "success" and event.is_fallback
            for event in by_req[request_id]
        )
    }
    retried_reqs = {
        request_id
        for request_id, events in by_req.items()
        if len(events) > 1
    }

    succ_lat = [event.latency_ms for event in ai if event.status == "success"]

    # End-to-end latency includes all attempts in a logical request.
    e2e = [
        sum(event.latency_ms for event in events)
        for request_id, events in by_req.items()
        if request_id in ok_reqs
    ]

    tokens_by_provider: dict[str, dict] = defaultdict(
        lambda: {"prompt": 0, "completion": 0}
    )
    tokens_by_task: dict[str, dict] = defaultdict(
        lambda: {"prompt": 0, "completion": 0}
    )
    prov: dict[str, dict] = defaultdict(
        lambda: {
            "attempts": 0,
            "success": 0,
            "errors": 0,
            "latencies": [],
        }
    )
    task_stats: dict[str, dict] = defaultdict(
        lambda: {"requests": set(), "ok": set()}
    )

    for event in ai:
        tokens_by_provider[event.provider]["prompt"] += event.prompt_tokens
        tokens_by_provider[event.provider]["completion"] += event.completion_tokens
        tokens_by_task[event.task]["prompt"] += event.prompt_tokens
        tokens_by_task[event.task]["completion"] += event.completion_tokens

        provider_stats = prov[event.provider]
        provider_stats["attempts"] += 1

        if event.status == "success":
            provider_stats["success"] += 1
            provider_stats["latencies"].append(event.latency_ms)
        else:
            provider_stats["errors"] += 1

        task_stats[event.task]["requests"].add(event.request_id)
        if event.request_id in ok_reqs:
            task_stats[event.task]["ok"].add(event.request_id)

    providers = [
        {
            "provider": name,
            "attempts": values["attempts"],
            "success_rate": (
                round(values["success"] / values["attempts"], 3)
                if values["attempts"]
                else 0
            ),
            "avg_latency_ms": (
                round(sum(values["latencies"]) / len(values["latencies"]))
                if values["latencies"]
                else None
            ),
            "p95_latency_ms": percentile(values["latencies"], 95),
        }
        for name, values in prov.items()
    ]

    total_reqs = len(by_req)
    failure_rate = (
        round(len(failed_reqs) / total_reqs, 3) if total_reqs else 0.0
    )
    attempt_error_rate = (
        round(
            sum(1 for event in ai if event.status != "success") / len(ai),
            3,
        )
        if ai
        else 0.0
    )
    fallback_rate = (
        round(len(fallback_reqs) / len(ok_reqs), 3) if ok_reqs else 0.0
    )

    # Time series: hourly for windows of two days or less; daily otherwise.
    hourly = days <= 2

    def bucket(dt: datetime) -> str:
        dt = _aware(dt)
        return (
            dt.strftime("%Y-%m-%d %H:00")
            if hourly
            else dt.strftime("%Y-%m-%d")
        )

    series: dict[str, dict] = defaultdict(
        lambda: {"requests": 0, "failed": 0, "lat": [], "tokens": 0}
    )

    for request_id, events in by_req.items():
        time_bucket = bucket(min(event.created_at for event in events))
        series[time_bucket]["requests"] += 1
        series[time_bucket]["failed"] += request_id in failed_reqs
        series[time_bucket]["tokens"] += sum(
            event.prompt_tokens + event.completion_tokens
            for event in events
        )

        if request_id in ok_reqs:
            series[time_bucket]["lat"].append(
                sum(event.latency_ms for event in events)
            )

    timeseries = [
        {
            "bucket": name,
            "requests": values["requests"],
            "failed": values["failed"],
            "p95_ms": percentile(values["lat"], 95),
            "tokens": values["tokens"],
        }
        for name, values in sorted(series.items())
    ]

    # HTTP metrics.
    http_lat = [event.latency_ms for event in http]
    routes: dict[str, list[HTTPEvent]] = defaultdict(list)

    for event in http:
        routes[event.route].append(event)

    route_stats = sorted(
        [
            {
                "route": name,
                "count": len(events),
                "errors_5xx": sum(
                    1 for event in events if event.status_code >= 500
                ),
                "p95_ms": percentile(
                    [event.latency_ms for event in events], 95
                ),
            }
            for name, events in routes.items()
        ],
        key=lambda route: -route["count"],
    )[:10]

    # Quality metrics. Claim checks are recorded per stage: raw (model output before enforcement), final (what the
    # user receives after revise/enforcement) and approved (published / accepted). v1 rows had no stage -> "final".
    def _stage(event: QualityEvent) -> str:
        return (event.details or {}).get("stage") or "final"

    claim_stages = {}
    for stage_name in ("raw", "final", "approved"):
        evs = [e for e in q if e.kind == "claim_check" and _stage(e) == stage_name]
        n_checked = sum(int(e.details.get("claims_checked", 0)) for e in evs)
        n_unsup = sum(int(e.details.get("unsupported_count", 0)) for e in evs)
        claim_stages[stage_name] = {
            "outputs": len(evs),
            "claims_checked": n_checked,
            "unsupported": n_unsup,
            "contradicted": sum(int(e.details.get("contradicted", 0)) for e in evs),
            "ambiguous": sum(int(e.details.get("ambiguous", 0)) for e in evs),
            "needs_confirmation": sum(int(e.details.get("needs_confirmation", 0)) for e in evs),
            "unavailable": sum(int(e.details.get("unavailable", 0)) for e in evs),
            "outputs_with_unsupported": sum(1 for e in evs if int(e.details.get("unsupported_count", 0)) > 0),
            # None (not 0.0) when nothing was checked: zero claims is "no data", not "perfect"
            "unsupported_rate": round(n_unsup / n_checked, 4) if n_checked else None,
            "acknowledged": sum(1 for e in evs if e.details.get("acknowledged")),
            "by_task": {},
        }
        for e in evs:
            bt = claim_stages[stage_name]["by_task"].setdefault(e.task or "unknown", {"claims_checked": 0, "unsupported": 0})
            bt["claims_checked"] += int(e.details.get("claims_checked", 0))
            bt["unsupported"] += int(e.details.get("unsupported_count", 0))
    approved = [e for e in q if e.kind == "claim_check" and _stage(e) == "approved"]
    escaped = sum(int(e.details.get("unsupported_count", 0)) for e in approved if not e.details.get("acknowledged"))
    escaped += sum(int(e.details.get("unsupported_count", 0)) for e in q if e.kind == "claim_check" and _stage(e) == "final"
                   and e.task == "cv_tailor")  # tailored CV final re-check: anything flagged bypassed enforcement
    verifier_versions = sorted({(e.details or {}).get("verifier_version", "claims-v1") for e in q if e.kind == "claim_check"})

    claim_events = [event for event in q if event.kind == "claim_check" and _stage(event) == "final"]
    checked = sum(
        int(event.details.get("claims_checked", 0))
        for event in claim_events
    )
    unsupported = sum(
        int(event.details.get("unsupported_count", 0))
        for event in claim_events
    )
    outputs_with_unsupported = sum(
        1
        for event in claim_events
        if int(event.details.get("unsupported_count", 0)) > 0
    )

    decisions = Counter(
        event.outcome
        for event in q
        if event.kind == "cv_suggestion_decision"
    )
    feedback = Counter(
        event.outcome
        for event in q
        if event.kind == "achievement_feedback"
    )
    tasks_done = Counter(
        (event.task, event.outcome)
        for event in q
        if event.kind in ("task_completed", "task_failed")
    )

    task_names = sorted({task for task, _ in tasks_done})
    task_completion = [
        {
            "task": task,
            "completed": tasks_done[(task, "success")],
            "failed": tasks_done[(task, "failure")],
            "rate": (
                round(
                    tasks_done[(task, "success")]
                    / (
                        tasks_done[(task, "success")]
                        + tasks_done[(task, "failure")]
                    ),
                    3,
                )
                if (
                    tasks_done[(task, "success")]
                    + tasks_done[(task, "failure")]
                )
                else 0
            ),
        }
        for task in task_names
    ]

    total_done = sum(
        tasks_done[(task, "success")] for task in task_names
    )
    total_fail = sum(
        tasks_done[(task, "failure")] for task in task_names
    )
    publish = Counter(
        event.outcome for event in q if event.kind == "publish_result"
    )
    injections = sum(
        int(event.details.get("flags", 0))
        for event in q
        if event.kind == "injection_detected"
    )

    decided = (
        decisions["accepted"] + decisions["edited"] + decisions["rejected"]
    )
    reviewed = feedback["confirmed"] + feedback["rejected"]

    quality = {
        "claims_by_stage": claim_stages,
        "unsupported_blocked": max(0, claim_stages["raw"]["unsupported"] - claim_stages["final"]["unsupported"]),
        "unsupported_escaped": escaped,
        "verifier_versions": verifier_versions,
        "unsupported_claim_rate": (
            round(unsupported / checked, 3) if checked else None
        ),
        "claims_checked": checked,
        "unsupported_claims": unsupported,
        "outputs_checked": len(claim_events),
        "outputs_with_unsupported": outputs_with_unsupported,
        "cv_decisions": {
            "accepted": decisions["accepted"],
            "edited": decisions["edited"],
            "rejected": decisions["rejected"],
        },
        "cv_acceptance_rate": (
            round(
                (decisions["accepted"] + decisions["edited"]) / decided,
                3,
            )
            if decided
            else None
        ),
        "achievement_feedback": {
            "confirmed": feedback["confirmed"],
            "rejected": feedback["rejected"],
        },
        "extraction_precision": (
            round(feedback["confirmed"] / reviewed, 3)
            if reviewed
            else None
        ),
        "task_completion": task_completion,
        "task_success_rate": (
            round(total_done / (total_done + total_fail), 3)
            if total_done + total_fail
            else None
        ),
        "publish": dict(publish),
        "injection_flags": injections,
    }

    errors = db.scalars(
        select(ErrorLog)
        .where(ErrorLog.created_at >= since)
        .order_by(ErrorLog.created_at.desc())
        .limit(15)
    ).all()

    recent_failures = sorted(
        [event for event in ai if event.status != "success"],
        key=lambda event: event.created_at,
        reverse=True,
    )[:15]

    latest_eval = db.scalars(
        select(EvalRun)
        .order_by(EvalRun.created_at.desc())
        .limit(1)
    ).first()

    # ---- models: requested model vs identifier the provider actually returned
    mstats: dict[tuple[str, str], dict] = defaultdict(lambda: {"attempts": 0, "success": 0, "lat": [], "prompt": 0, "completion": 0,
                                                               "cost": 0.0, "cost_known": 0, "fallback_success": 0, "returned": Counter()})
    for e in ai:
        if e.provider == "none":
            continue
        st = mstats[(e.provider, e.model)]
        st["attempts"] += 1
        st["prompt"] += e.prompt_tokens
        st["completion"] += e.completion_tokens
        if e.est_cost_usd is not None:
            st["cost"] += e.est_cost_usd
            st["cost_known"] += 1
        if e.status == "success":
            st["success"] += 1
            st["lat"].append(e.latency_ms)
            st["fallback_success"] += bool(e.is_fallback)
            if e.returned_model:
                st["returned"][e.returned_model] += 1
    models = [
        {"provider": p_, "model": m_, "returned_models": dict(v["returned"]), "attempts": v["attempts"],
         "success_rate": round(v["success"] / v["attempts"], 3) if v["attempts"] else None,
         "p50_ms": percentile(v["lat"], 50) if v["lat"] else None, "p95_ms": percentile(v["lat"], 95) if v["lat"] else None,
         "prompt_tokens": v["prompt"], "completion_tokens": v["completion"],
         "est_cost_usd": round(v["cost"], 6) if v["cost_known"] else None, "fallback_successes": v["fallback_success"]}
        for (p_, m_), v in sorted(mstats.items())
    ]

    # ---- cost estimates (list price x tokens, every attempt incl. retries/fallbacks; NOT invoices)
    def _cost_group(key) -> list[dict]:
        groups: dict[str, dict] = defaultdict(lambda: {"est_cost_usd": 0.0, "known": 0, "unknown": 0, "tokens": 0})
        for e in ai:
            if e.provider == "none":
                continue
            g = groups[key(e)]
            g["tokens"] += e.prompt_tokens + e.completion_tokens
            if e.est_cost_usd is None:
                g["unknown"] += 1 if (e.prompt_tokens or e.completion_tokens) else 0
            else:
                g["est_cost_usd"] += e.est_cost_usd
                g["known"] += 1
        return [{"key": k, "est_cost_usd": round(v["est_cost_usd"], 6) if v["known"] else None, "priced_attempts": v["known"],
                 "unpriced_attempts": v["unknown"], "tokens": v["tokens"]} for k, v in sorted(groups.items())]

    daily_cost: dict[str, float] = defaultdict(float)
    for e in ai:
        if e.est_cost_usd is not None:
            daily_cost[_aware(e.created_at).strftime("%Y-%m-%d")] += e.est_cost_usd
    priced = [e for e in ai if e.est_cost_usd is not None]
    cost = {
        "basis": "estimate: list price x tokens for every attempt (retries and fallbacks included); not billed cost",
        "total_est_usd": round(sum(e.est_cost_usd for e in priced), 6) if priced else None,
        "priced_attempts": len(priced),
        "unpriced_attempts": sum(1 for e in ai if e.est_cost_usd is None and (e.prompt_tokens or e.completion_tokens)),
        "retry_and_fallback_share_usd": round(sum(e.est_cost_usd for e in priced if e.attempt > 1 or e.is_fallback), 6) if priced else None,
        "by_task": _cost_group(lambda e: e.task),
        "by_model": _cost_group(lambda e: f"{e.provider}/{e.model}"),
        "by_provider": _cost_group(lambda e: e.provider),
        "by_key_source": _cost_group(lambda e: "byok" if e.key_source == "user" else "platform"),
        "daily": [{"day": d, "est_cost_usd": round(v, 6)} for d, v in sorted(daily_cost.items())],
        "pricing_versions": sorted({e.pricing_version for e in ai if e.pricing_version}),
    }

    # ---- latency by task (provider-attempt latency vs end-to-end logical request latency)
    task_lat: dict[str, dict] = defaultdict(lambda: {"attempt": [], "e2e": []})
    for rid, events in by_req.items():
        t_name = events[0].task
        task_lat[t_name]["attempt"] += [e.latency_ms for e in events if e.status == "success"]
        if rid in ok_reqs:
            task_lat[t_name]["e2e"].append(sum(e.latency_ms for e in events))
    latency_by_task = [{"task": k, "attempt_p50_ms": percentile(v["attempt"], 50), "attempt_p95_ms": percentile(v["attempt"], 95),
                        "e2e_p95_ms": percentile(v["e2e"], 95), "requests": len(v["e2e"])} for k, v in sorted(task_lat.items())]
    workflow = defaultdict(list)
    for e in q:
        if e.kind == "task_completed" and (e.details or {}).get("duration_ms") is not None:
            workflow[e.task].append(int(e.details["duration_ms"]))
    workflow_duration = [{"task": k, "count": len(v), "p50_ms": percentile(v, 50), "p95_ms": percentile(v, 95)} for k, v in sorted(workflow.items())]

    status_distribution = dict(sorted(Counter(f"{e.status_code // 100}xx" for e in http).items()))
    slowest = sorted(route_stats_all(http), key=lambda r: -(r["p95_ms"] or 0))[:8]

    metrics = {
        "window_days": days,
        "filters": {"provider": provider, "model": model, "task": task},
        "models": models,
        "cost": cost,
        "latency_by_task": latency_by_task,
        "workflow_duration": workflow_duration,
        "scope": "mine" if user_id else "all",
        "generated_at": datetime.now(UTC).isoformat(),
        "ai": {
            "total_requests": total_reqs,
            "successful_requests": len(ok_reqs),
            "failed_requests": len(failed_reqs),
            "failure_rate": failure_rate,
            "attempts": len(ai),
            "attempt_error_rate": attempt_error_rate,
            "rate_limit_errors": sum(1 for e in ai if e.error_type == "rate_limit"),
            "timeout_errors": sum(1 for e in ai if e.error_type in ("timeout", "deadline")),
            "privacy_blocked_requests": sum(1 for e in ai if e.error_type == "privacy_policy"),
            "redacted_requests": len({e.request_id for e in ai if e.redactions}),
            "retried_requests": len(retried_reqs),
            "fallback_requests": len(fallback_reqs),
            "fallback_rate": fallback_rate,
            "latency_ms": {
                "avg": round(sum(succ_lat) / len(succ_lat)) if succ_lat else None,
                "p50": percentile(succ_lat, 50),
                "p95": percentile(succ_lat, 95),
                "p99": percentile(succ_lat, 99),
            },
            "e2e_latency_ms": {
                "p50": percentile(e2e, 50),
                "p95": percentile(e2e, 95),
            },
            "error_types": dict(
                Counter(
                    event.error_type or "unknown"
                    for event in ai
                    if event.status != "success"
                )
            ),
            "tokens_by_provider": [
                {"provider": name, **values}
                for name, values in tokens_by_provider.items()
            ],
            "tokens_by_task": [
                {"task": name, **values}
                for name, values in tokens_by_task.items()
            ],
            "total_tokens": sum(
                event.prompt_tokens + event.completion_tokens
                for event in ai
            ),
            "providers": providers,
            "tasks": [
                {
                    "task": name,
                    "requests": len(values["requests"]),
                    "success_rate": round(
                        len(values["ok"]) / len(values["requests"]), 3
                    ),
                }
                for name, values in task_stats.items()
            ],
            "timeseries": timeseries,
        },
        "http": {
            "requests": len(http),
            "error_rate_5xx": (
                round(
                    sum(1 for event in http if event.status_code >= 500)
                    / len(http),
                    3,
                )
                if http
                else 0.0
            ),
            "client_errors_4xx": sum(
                1 for event in http if 400 <= event.status_code < 500
            ),
            "p50_ms": percentile(http_lat, 50),
            "p95_ms": percentile(http_lat, 95),
            "routes": route_stats,
            "status_distribution": status_distribution,
            "slowest_routes": slowest,
        },
        "quality": quality,
        "recent_errors": [
            {
                "id": event.id,
                "at": event.created_at.isoformat(),
                "route": event.route,
                "type": event.error_type,
                "message": event.message,
            }
            for event in errors
        ],
        "recent_ai_failures": [
            {
                "at": event.created_at.isoformat(),
                "task": event.task,
                "provider": event.provider,
                "model": event.model,
                "error_type": event.error_type,
                "http_status": event.http_status,
                "attempt": event.attempt,
                "latency_ms": event.latency_ms,
            }
            for event in recent_failures
        ],
        "latest_eval": (
            {
                "id": latest_eval.id,
                "at": latest_eval.created_at.isoformat(),
                "provider": latest_eval.provider,
                "model": latest_eval.model or None,
                "kind": latest_eval.kind,
                "dataset_version": latest_eval.dataset_version,
                "summary": latest_eval.summary,
            }
            if latest_eval
            else None
        ),
    }

    from app.monitoring.alerts import evaluate_rules

    metrics["alerts"] = evaluate_rules(metrics)
    return metrics


def route_stats_all(http: list[HTTPEvent]) -> list[dict]:
    routes: dict[str, list[HTTPEvent]] = defaultdict(list)
    for e in http:
        routes[e.route].append(e)
    return [{"route": r, "count": len(evs), "errors_5xx": sum(1 for e in evs if e.status_code >= 500),
             "p95_ms": percentile([e.latency_ms for e in evs], 95)} for r, evs in routes.items()]


