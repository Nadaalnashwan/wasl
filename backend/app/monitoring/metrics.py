
"""Metric computation from stored events (ai_events, http_events, quality_events,
error_logs, eval_runs).

Everything shown on the Monitoring dashboard is calculated from real rows.
Alerts are threshold rules evaluated on each request to /api/monitoring/metrics.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AIEvent, ErrorLog, EvalRun, HTTPEvent, QualityEvent


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0

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
) -> dict:
    since = datetime.now(UTC) - timedelta(days=days)

    def scoped(stmt, model):
        stmt = stmt.where(model.created_at >= since)
        if user_id and hasattr(model, "user_id"):
            stmt = stmt.where(model.user_id == user_id)
        return stmt

    ai = db.scalars(scoped(select(AIEvent), AIEvent)).all()
    http = db.scalars(scoped(select(HTTPEvent), HTTPEvent)).all()
    q = db.scalars(scoped(select(QualityEvent), QualityEvent)).all()

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
                else 0
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

    # Quality metrics.
    claim_events = [event for event in q if event.kind == "claim_check"]
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
        "unsupported_claim_rate": (
            round(unsupported / checked, 3) if checked else 0.0
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

    metrics = {
        "window_days": days,
        "scope": "mine" if user_id else "all",
        "generated_at": datetime.now(UTC).isoformat(),
        "ai": {
            "total_requests": total_reqs,
            "successful_requests": len(ok_reqs),
            "failed_requests": len(failed_reqs),
            "failure_rate": failure_rate,
            "attempts": len(ai),
            "attempt_error_rate": attempt_error_rate,
            "retried_requests": len(retried_reqs),
            "fallback_requests": len(fallback_reqs),
            "fallback_rate": fallback_rate,
            "latency_ms": {
                "avg": round(sum(succ_lat) / len(succ_lat)) if succ_lat else 0,
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
        # EvalRun has no model column, so do not access latest_eval.model.
        "latest_eval": (
            {
                "id": latest_eval.id,
                "at": latest_eval.created_at.isoformat(),
                "provider": latest_eval.provider,
                "model": "",
                "summary": latest_eval.summary,
            }
            if latest_eval
            else None
        ),
    }

    metrics["alerts"] = evaluate_alerts(metrics)
    return metrics


def evaluate_alerts(m: dict) -> list[dict]:
    alerts = []
    ai = m["ai"]
    min_n = 5  # Avoid alerting on tiny samples.

    def add(level, key, title, value, threshold, hint):
        alerts.append(
            {
                "level": level,
                "key": key,
                "title": title,
                "value": value,
                "threshold": threshold,
                "investigate": hint,
            }
        )

    if (
        ai["total_requests"] >= min_n
        and ai["failure_rate"] > settings.alert_failure_rate
    ):
        add(
            "critical",
            "ai_failure_rate",
            "AI request failure rate is high",
            ai["failure_rate"],
            settings.alert_failure_rate,
            "Check 'Error types' — rate_limit means free-tier quota; "
            "auth means an invalid/expired key; validation means the "
            "model's JSON no longer matches the schema.",
        )

    if (
        ai["successful_requests"] >= min_n
        and ai["latency_ms"]["p95"] > settings.alert_p95_latency_ms
    ):
        add(
            "warning",
            "p95_latency",
            "AI p95 latency above target",
            ai["latency_ms"]["p95"],
            settings.alert_p95_latency_ms,
            "Compare per-provider p95. If one provider is slow, lower it "
            "in AI_PROVIDER_PRIORITY or switch the task to the fast tier.",
        )

    if (
        ai["successful_requests"] >= min_n
        and ai["fallback_rate"] > settings.alert_fallback_rate
    ):
        add(
            "warning",
            "fallback_rate",
            "Frequent provider fallback",
            ai["fallback_rate"],
            settings.alert_fallback_rate,
            "The primary provider is failing often. Inspect recent AI "
            "failures for its error_type and HTTP status.",
        )

    quality = m["quality"]
    if (
        quality["claims_checked"] >= 10
        and quality["unsupported_claim_rate"]
        > settings.alert_unsupported_claim_rate
    ):
        add(
            "warning",
            "unsupported_claims",
            "AI outputs contain unsupported claims",
            quality["unsupported_claim_rate"],
            settings.alert_unsupported_claim_rate,
            "Open the evaluation report: which task produces them? "
            "Tighten the prompt or force the revise step.",
        )

    if (
        m["http"]["requests"] >= 20
        and m["http"]["error_rate_5xx"] > 0.05
    ):
        add(
            "critical",
            "http_5xx",
            "Server errors above 5%",
            m["http"]["error_rate_5xx"],
            0.05,
            "See 'Recent errors' — each has an error id that is also "
            "returned to the user in the error message.",
        )

    return alerts
