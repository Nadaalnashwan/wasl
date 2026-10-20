"""Metric computation from stored events (ai_events, http_events, quality_events, error_logs, eval_runs).

Everything shown on the Monitoring dashboard is calculated here from real rows — there is no
synthetic data. Alerts are threshold rules evaluated on each request to /api/monitoring/metrics.
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


def compute(db: Session, days: int = 7, user_id: str | None = None) -> dict:
    since = datetime.now(UTC) - timedelta(days=days)

    def scoped(stmt, model):
        stmt = stmt.where(model.created_at >= since)
        if user_id and hasattr(model, "user_id"):
            stmt = stmt.where(model.user_id == user_id)
        return stmt

    ai = db.scalars(scoped(select(AIEvent), AIEvent)).all()
    http = db.scalars(scoped(select(HTTPEvent), HTTPEvent)).all()
    q = db.scalars(scoped(select(QualityEvent), QualityEvent)).all()

    # ---------------- AI requests (logical request = all attempts sharing request_id)
    by_req: dict[str, list[AIEvent]] = defaultdict(list)
    for e in ai:
        by_req[e.request_id].append(e)
    ok_reqs = {r for r, evs in by_req.items() if any(e.status == "success" for e in evs)}
    failed_reqs = set(by_req) - ok_reqs
    fallback_reqs = {r for r in ok_reqs if any(e.status == "success" and e.is_fallback for e in by_req[r])}
    retried_reqs = {r for r, evs in by_req.items() if len(evs) > 1}
    succ_lat = [e.latency_ms for e in ai if e.status == "success"]
    # end-to-end latency of a logical request = sum of its attempts
    e2e = [sum(x.latency_ms for x in evs) for r, evs in by_req.items() if r in ok_reqs]

    tokens_by_provider: dict[str, dict] = defaultdict(lambda: {"prompt": 0, "completion": 0})
    tokens_by_task: dict[str, dict] = defaultdict(lambda: {"prompt": 0, "completion": 0})
    prov: dict[str, dict] = defaultdict(lambda: {"attempts": 0, "success": 0, "errors": 0, "latencies": []})
    task_stats: dict[str, dict] = defaultdict(lambda: {"requests": set(), "ok": set()})
    for e in ai:
        tokens_by_provider[e.provider]["prompt"] += e.prompt_tokens
        tokens_by_provider[e.provider]["completion"] += e.completion_tokens
        tokens_by_task[e.task]["prompt"] += e.prompt_tokens
        tokens_by_task[e.task]["completion"] += e.completion_tokens
        p = prov[e.provider]
        p["attempts"] += 1
        if e.status == "success":
            p["success"] += 1
            p["latencies"].append(e.latency_ms)
        else:
            p["errors"] += 1
        task_stats[e.task]["requests"].add(e.request_id)
        if e.request_id in ok_reqs:
            task_stats[e.task]["ok"].add(e.request_id)

    providers = [
        {"provider": k, "attempts": v["attempts"], "success_rate": round(v["success"] / v["attempts"], 3) if v["attempts"] else 0,
         "avg_latency_ms": round(sum(v["latencies"]) / len(v["latencies"])) if v["latencies"] else 0,
         "p95_latency_ms": percentile(v["latencies"], 95)}
        for k, v in prov.items()
    ]
    total_reqs = len(by_req)
    failure_rate = round(len(failed_reqs) / total_reqs, 3) if total_reqs else 0.0
    attempt_error_rate = round(sum(1 for e in ai if e.status != "success") / len(ai), 3) if ai else 0.0
    fallback_rate = round(len(fallback_reqs) / len(ok_reqs), 3) if ok_reqs else 0.0

    # ---------------- timeseries (daily buckets, or hourly when window <= 2 days)
    hourly = days <= 2
    def bucket(dt: datetime) -> str:
        dt = _aware(dt)
        return dt.strftime("%Y-%m-%d %H:00") if hourly else dt.strftime("%Y-%m-%d")
    series: dict[str, dict] = defaultdict(lambda: {"requests": 0, "failed": 0, "lat": [], "tokens": 0})
    for r, evs in by_req.items():
        b = bucket(min(e.created_at for e in evs))
        series[b]["requests"] += 1
        series[b]["failed"] += r in failed_reqs
        series[b]["tokens"] += sum(e.prompt_tokens + e.completion_tokens for e in evs)
        if r in ok_reqs:
            series[b]["lat"].append(sum(e.latency_ms for e in evs))
    timeseries = [
        {"bucket": k, "requests": v["requests"], "failed": v["failed"], "p95_ms": percentile(v["lat"], 95), "tokens": v["tokens"]}
        for k, v in sorted(series.items())
    ]

    # ---------------- HTTP
    http_lat = [h.latency_ms for h in http]
    routes: dict[str, list[HTTPEvent]] = defaultdict(list)
    for h in http:
        routes[h.route].append(h)
    route_stats = sorted(
        [{"route": k, "count": len(v), "errors_5xx": sum(1 for h in v if h.status_code >= 500),
          "p95_ms": percentile([h.latency_ms for h in v], 95)} for k, v in routes.items()],
        key=lambda r: -r["count"])[:10]

    # ---------------- quality
    claim_events = [e for e in q if e.kind == "claim_check"]
    checked = sum(int(e.details.get("claims_checked", 0)) for e in claim_events)
    unsupported = sum(int(e.details.get("unsupported_count", 0)) for e in claim_events)
    outputs_with_unsupported = sum(1 for e in claim_events if int(e.details.get("unsupported_count", 0)) > 0)
    decisions = Counter(e.outcome for e in q if e.kind == "cv_suggestion_decision")
    feedback = Counter(e.outcome for e in q if e.kind == "achievement_feedback")
    tasks_done = Counter((e.task, e.outcome) for e in q if e.kind in ("task_completed", "task_failed"))
    task_names = sorted({t for t, _ in tasks_done})
    task_completion = [
        {"task": t, "completed": tasks_done[(t, "success")], "failed": tasks_done[(t, "failure")],
         "rate": round(tasks_done[(t, "success")] / (tasks_done[(t, "success")] + tasks_done[(t, "failure")]), 3)
         if (tasks_done[(t, "success")] + tasks_done[(t, "failure")]) else 0}
        for t in task_names
    ]
    total_done = sum(tasks_done[(t, "success")] for t in task_names)
    total_fail = sum(tasks_done[(t, "failure")] for t in task_names)
    publish = Counter(e.outcome for e in q if e.kind == "publish_result")
    injections = sum(int(e.details.get("flags", 0)) for e in q if e.kind == "injection_detected")
    decided = decisions["accepted"] + decisions["edited"] + decisions["rejected"]
    reviewed = feedback["confirmed"] + feedback["rejected"]

    quality = {
        "unsupported_claim_rate": round(unsupported / checked, 3) if checked else 0.0,
        "claims_checked": checked,
        "unsupported_claims": unsupported,
        "outputs_checked": len(claim_events),
        "outputs_with_unsupported": outputs_with_unsupported,
        "cv_decisions": {"accepted": decisions["accepted"], "edited": decisions["edited"], "rejected": decisions["rejected"]},
        "cv_acceptance_rate": round((decisions["accepted"] + decisions["edited"]) / decided, 3) if decided else None,
        "achievement_feedback": {"confirmed": feedback["confirmed"], "rejected": feedback["rejected"]},
        "extraction_precision": round(feedback["confirmed"] / reviewed, 3) if reviewed else None,
        "task_completion": task_completion,
        "task_success_rate": round(total_done / (total_done + total_fail), 3) if (total_done + total_fail) else None,
        "publish": dict(publish),
        "injection_flags": injections,
    }

    errors = db.scalars(select(ErrorLog).where(ErrorLog.created_at >= since).order_by(ErrorLog.created_at.desc()).limit(15)).all()
    recent_failures = sorted([e for e in ai if e.status != "success"], key=lambda e: e.created_at, reverse=True)[:15]
    latest_eval = db.scalars(select(EvalRun).order_by(EvalRun.created_at.desc()).limit(1)).first()

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
            "latency_ms": {"avg": round(sum(succ_lat) / len(succ_lat)) if succ_lat else 0, "p50": percentile(succ_lat, 50),
                           "p95": percentile(succ_lat, 95), "p99": percentile(succ_lat, 99)},
            "e2e_latency_ms": {"p50": percentile(e2e, 50), "p95": percentile(e2e, 95)},
            "error_types": dict(Counter(e.error_type or "unknown" for e in ai if e.status != "success")),
            "tokens_by_provider": [{"provider": k, **v} for k, v in tokens_by_provider.items()],
            "tokens_by_task": [{"task": k, **v} for k, v in tokens_by_task.items()],
            "total_tokens": sum(e.prompt_tokens + e.completion_tokens for e in ai),
            "providers": providers,
            "tasks": [{"task": k, "requests": len(v["requests"]), "success_rate": round(len(v["ok"]) / len(v["requests"]), 3)}
                      for k, v in task_stats.items()],
            "timeseries": timeseries,
        },
        "http": {
            "requests": len(http),
            "error_rate_5xx": round(sum(1 for h in http if h.status_code >= 500) / len(http), 3) if http else 0.0,
            "client_errors_4xx": sum(1 for h in http if 400 <= h.status_code < 500),
            "p50_ms": percentile(http_lat, 50),
            "p95_ms": percentile(http_lat, 95),
            "routes": route_stats,
        },
        "quality": quality,
        "recent_errors": [{"id": e.id, "at": e.created_at.isoformat(), "route": e.route, "type": e.error_type, "message": e.message} for e in errors],
        "recent_ai_failures": [{"at": e.created_at.isoformat(), "task": e.task, "provider": e.provider, "model": e.model,
                                "error_type": e.error_type, "http_status": e.http_status, "attempt": e.attempt,
                                "latency_ms": e.latency_ms} for e in recent_failures],
        "latest_eval": {"id": latest_eval.id, "at": latest_eval.created_at.isoformat(), "provider": latest_eval.provider,
                        "model": latest_eval.model, "summary": latest_eval.summary} if latest_eval else None,
    }
    metrics["alerts"] = evaluate_alerts(metrics)
    return metrics


def evaluate_alerts(m: dict) -> list[dict]:
    alerts = []
    ai = m["ai"]
    min_n = 5  # avoid alerting on tiny samples

    def add(level, key, title, value, threshold, hint):
        alerts.append({"level": level, "key": key, "title": title, "value": value, "threshold": threshold, "investigate": hint})

    if ai["total_requests"] >= min_n and ai["failure_rate"] > settings.alert_failure_rate:
        add("critical", "ai_failure_rate", "AI request failure rate is high", ai["failure_rate"], settings.alert_failure_rate,
            "Check 'Error types' — rate_limit means free-tier quota; auth means an invalid/expired key; validation means the "
            "model's JSON no longer matches the schema (prompt or model change).")
    if ai["successful_requests"] >= min_n and ai["latency_ms"]["p95"] > settings.alert_p95_latency_ms:
        add("warning", "p95_latency", "AI p95 latency above target", ai["latency_ms"]["p95"], settings.alert_p95_latency_ms,
            "Compare per-provider p95. If one provider is slow, lower it in AI_PROVIDER_PRIORITY or switch the task to the fast tier.")
    if ai["successful_requests"] >= min_n and ai["fallback_rate"] > settings.alert_fallback_rate:
        add("warning", "fallback_rate", "Frequent provider fallback", ai["fallback_rate"], settings.alert_fallback_rate,
            "The primary provider is failing often. Inspect recent AI failures for its error_type and HTTP status.")
    qual = m["quality"]
    if qual["claims_checked"] >= 10 and qual["unsupported_claim_rate"] > settings.alert_unsupported_claim_rate:
        add("warning", "unsupported_claims", "AI outputs contain unsupported claims", qual["unsupported_claim_rate"],
            settings.alert_unsupported_claim_rate,
            "Open the evaluation report: which task produces them? Tighten the prompt or force the revise step.")
    if m["http"]["requests"] >= 20 and m["http"]["error_rate_5xx"] > 0.05:
        add("critical", "http_5xx", "Server errors above 5%", m["http"]["error_rate_5xx"], 0.05,
            "See 'Recent errors' — each has an error id that is also returned to the user in the error message.")
    return alerts
