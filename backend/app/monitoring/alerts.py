"""Alerting, independent of anyone opening the dashboard.

    scheduler (in-process loop, or `python -m scripts.run_alerts` from cron)
        └─► run_cycle(): compute metrics for the alert window ─► evaluate_rules()
              ├─ rule firing, no open incident  → open incident, notify (Slack / webhook, with retries)
              ├─ rule firing, incident open     → update last_seen; re-notify only after the cooldown
              └─ rule clear,  incident open     → resolve incident, send a recovery notification

Rules only fire with enough data (ALERT_MIN_SAMPLE) so a handful of requests cannot page anyone. The single
exception is an unsupported claim ESCAPING enforcement: one is already a quality incident.

Payload privacy: alert messages contain rule keys, numbers, thresholds and sample sizes only — never user ids,
emails, CV text, prompts, tokens or error messages.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AIEvent, AlertIncident, EvalRun, HTTPEvent

log = logging.getLogger("wasl.alerts")


def _rule(level, key, title, value, threshold, sample, hint) -> dict:
    return {"level": level, "key": key, "title": title, "value": value, "threshold": threshold, "sample_size": sample,
            "investigate": hint}


def evaluate_rules(m: dict) -> list[dict]:
    """Pure function: metrics dict -> firing alerts."""
    out: list[dict] = []
    n_min = settings.alert_min_sample
    ai = m["ai"]
    q = m["quality"]

    if ai["total_requests"] >= n_min and ai["failure_rate"] > settings.alert_failure_rate:
        out.append(_rule("critical", "ai_failure_rate", "AI request failure rate is high", ai["failure_rate"], settings.alert_failure_rate,
                         ai["total_requests"], "Admin → Providers: check error types. rate_limit = quota; auth = key; validation = schema drift."))

    for p in ai.get("providers", []):
        if p["attempts"] >= n_min and p["success_rate"] is not None and p["success_rate"] < 0.5:
            out.append(_rule("critical", f"provider_outage:{p['provider']}", f"Provider {p['provider']} is failing most attempts",
                             p["success_rate"], 0.5, p["attempts"], "Lower it in AI_PROVIDER_PRIORITY until it recovers; fallback is absorbing traffic."))

    p95 = ai["latency_ms"]["p95"]
    if ai["successful_requests"] >= n_min and p95 is not None and p95 > settings.alert_p95_latency_ms:
        out.append(_rule("warning", "p95_latency", "AI p95 latency above target", p95, settings.alert_p95_latency_ms,
                         ai["successful_requests"], "Compare per-model p95; move slow tasks to the fast tier or another provider."))

    if ai["successful_requests"] >= n_min and ai["fallback_rate"] > settings.alert_fallback_rate:
        out.append(_rule("warning", "fallback_rate", "Frequent provider fallback", ai["fallback_rate"], settings.alert_fallback_rate,
                         ai["successful_requests"], "The primary provider fails often — inspect recent AI failures."))

    if ai.get("rate_limit_errors", 0) >= settings.alert_rate_limit_count:
        out.append(_rule("warning", "rate_limits", "Repeated provider rate limits", ai["rate_limit_errors"], settings.alert_rate_limit_count,
                         ai["attempts"], "Free-tier quota is likely exhausted; add capacity or spread load across providers."))

    raw = q["claims_by_stage"]["raw"]
    if raw["claims_checked"] >= n_min and raw["unsupported_rate"] is not None and raw["unsupported_rate"] > settings.alert_unsupported_claim_rate:
        out.append(_rule("warning", "raw_unsupported_claims", "Models are writing more unsupported claims", raw["unsupported_rate"],
                         settings.alert_unsupported_claim_rate, raw["claims_checked"],
                         "Raw = before enforcement (users are protected). Check which task in Admin → AI quality and tighten its prompt."))

    if q.get("unsupported_escaped", 0) > 0:
        out.append(_rule("critical", "claims_escaped", "Unsupported claims reached approved output", q["unsupported_escaped"], 0,
                         q["claims_by_stage"]["approved"]["claims_checked"] + q["claims_by_stage"]["final"]["claims_checked"],
                         "Serious quality incident: an unacknowledged unsupported claim passed enforcement. Reproduce with the evaluation suite."))

    unavailable = q["claims_by_stage"]["final"]["unavailable"]
    if unavailable >= 3:
        out.append(_rule("warning", "verifier_failures", "Claim verification failed to run", unavailable, 3,
                         q["claims_by_stage"]["final"]["outputs"], "Outputs were marked unverified (safe), but the verifier is erroring — check error logs."))

    if m["http"]["requests"] >= n_min and m["http"]["error_rate_5xx"] > 0.05:
        out.append(_rule("critical", "http_5xx", "Server errors above 5%", m["http"]["error_rate_5xx"], 0.05, m["http"]["requests"],
                         "See Recent errors; each has an id that users also see."))

    daily = m.get("cost", {}).get("daily") or []
    if daily and daily[-1]["est_cost_usd"] > settings.alert_daily_cost_usd:
        out.append(_rule("warning", "cost_spike", "Estimated daily AI cost above budget", round(daily[-1]["est_cost_usd"], 4),
                         settings.alert_daily_cost_usd, m["ai"]["attempts"], "Estimate from list prices; inspect cost by task/model."))
    return out


def _extra_rules(db: Session, now: datetime) -> list[dict]:
    """Rules that need history rather than one metrics window."""
    out: list[dict] = []
    # missing monitoring data: traffic in the last week but no HTTP events for 6 hours
    recent = db.scalar(select(HTTPEvent.created_at).order_by(HTTPEvent.created_at.desc()).limit(1))
    week = db.scalar(select(HTTPEvent.id).where(HTTPEvent.created_at >= now - timedelta(days=7)).limit(1))
    if week and recent is not None:
        recent = recent if recent.tzinfo else recent.replace(tzinfo=UTC)
        if now - recent > timedelta(hours=6):
            out.append(_rule("warning", "monitoring_silent", "No monitoring events for 6 hours",
                             round((now - recent).total_seconds() / 3600, 1), 6, 0, "Is the backend up and recording? Check /api/admin/health."))
    # evaluation regression: latest deterministic run vs the previous one
    runs = db.scalars(select(EvalRun).where(EvalRun.kind == "deterministic").order_by(EvalRun.created_at.desc()).limit(2)).all()
    if len(runs) == 2:
        cur, prev = runs[0].summary or {}, runs[1].summary or {}
        for k in ("claim_detection_recall", "claim_detection_precision", "case_pass_rate", "pii_recall"):
            a, b = cur.get(k), prev.get(k)
            if isinstance(a, (int, float)) and isinstance(b, (int, float)) and a < b - 0.02:
                out.append(_rule("warning", f"eval_regression:{k}", f"Evaluation regression: {k}", a, b, int(cur.get("cases", 0)),
                                 "Compare the two eval runs in Admin → Evaluation; a code change lowered this metric."))
    # privacy policy blocking everything: personal tasks have no eligible provider
    blocked = db.scalar(select(AIEvent.id).where(AIEvent.error_type == "privacy_policy", AIEvent.created_at >= now - timedelta(hours=1)).limit(1))
    if blocked:
        out.append(_rule("critical", "privacy_no_provider", "Personal-data AI tasks have no privacy-eligible provider", 1, 0, 0,
                         "Enable a provider meeting AI_PERSONAL_MIN_PRIVACY (see docs/PRIVACY.md). Users currently get a safe error."))
    return out


def channel() -> str:
    if settings.alert_slack_webhook_url:
        return "slack"
    if settings.alert_webhook_url:
        return "webhook"
    return "disabled"


def _message(inc: AlertIncident, recovered: bool) -> dict:
    verb = "RESOLVED" if recovered else inc.severity.upper()
    text = (f"[Wasl {settings.app_env}] {verb}: {inc.title} — value {inc.value} vs threshold {inc.threshold} "
            f"(sample {inc.sample_size}). Key: {inc.key}.")
    if not recovered and inc.investigate:
        text += f" Investigate: {inc.investigate}"
    return {"text": text, "key": inc.key, "severity": inc.severity, "status": "resolved" if recovered else "open",
            "value": inc.value, "threshold": inc.threshold, "sample_size": inc.sample_size, "environment": settings.app_env}


async def deliver(payload: dict, *, attempts: int = 3) -> tuple[bool, str]:
    url = settings.alert_slack_webhook_url or settings.alert_webhook_url
    if not url:
        return False, "disabled"
    body = {"text": payload["text"]} if settings.alert_slack_webhook_url else payload
    last = ""
    for i in range(attempts):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(url, json=body)
            if r.status_code < 300:
                return True, ""
            last = f"HTTP {r.status_code}"
            if r.status_code < 500 and r.status_code != 429:
                break  # misconfigured webhook: do not hammer it
        except httpx.HTTPError as exc:
            last = type(exc).__name__
        await asyncio.sleep(min(8.0, 1.0 * 2**i))
    return False, last[:300]


async def run_cycle(db: Session, *, window_hours: int = 24) -> dict:
    """Evaluate every rule once, persist incidents and deliver notifications. Safe to run concurrently-ish:
    there is at most one OPEN incident per key."""
    from app.monitoring.metrics import compute

    now = datetime.now(UTC)
    m = compute(db, days=max(1, window_hours // 24), since=now - timedelta(hours=window_hours))
    firing = {a["key"]: a for a in [*evaluate_rules(m), *_extra_rules(db, now)]}
    open_incidents = {i.key: i for i in db.scalars(select(AlertIncident).where(AlertIncident.status == "open")).all()}
    cooldown = timedelta(minutes=settings.alert_cooldown_minutes)
    opened, resolved, notified = [], [], 0

    for key, a in firing.items():
        inc = open_incidents.get(key)
        if inc is None:
            inc = AlertIncident(key=key, severity=a["level"], title=a["title"], value=a["value"], threshold=a["threshold"],
                                sample_size=a["sample_size"], investigate=a["investigate"], last_seen_at=now)
            db.add(inc)
            opened.append(key)
        else:
            inc.value, inc.sample_size, inc.last_seen_at, inc.severity = a["value"], a["sample_size"], now, a["level"]
        last = inc.notified_at.replace(tzinfo=inc.notified_at.tzinfo or UTC) if inc.notified_at else None
        # first notification, retry after a failed delivery (bounded), or a reminder once the cooldown passed
        due = (inc.notify_status in ("pending", "disabled") or (inc.notify_status == "failed" and inc.notify_attempts < 10)
               or (inc.notify_status == "sent" and last is not None and now - last >= cooldown))
        if channel() == "disabled":
            inc.notify_status = "disabled"
        elif due:
            ok, err = await deliver(_message(inc, False))
            inc.notify_attempts += 1
            inc.notify_status, inc.last_error = ("sent", "") if ok else ("failed", err)
            if ok:
                inc.notified_at = now
                notified += 1

    for key, inc in open_incidents.items():
        if key in firing:
            continue
        inc.status, inc.resolved_at = "resolved", now
        resolved.append(key)
        if channel() != "disabled" and inc.notify_status == "sent":
            ok, _err = await deliver(_message(inc, True))
            inc.recovery_notified = ok
    db.commit()
    return {"evaluated_at": now.isoformat(), "firing": sorted(firing), "opened": opened, "resolved": resolved,
            "notified": notified, "channel": channel()}


_scheduler_state = {"running": False, "last_run": None, "last_error": None}


def scheduler_status() -> dict:
    return {**_scheduler_state, "interval_minutes": settings.alert_eval_interval_minutes, "channel": channel()}


async def scheduler_loop() -> None:  # pragma: no cover - exercised in deployment
    from app.db import SessionLocal

    if settings.alert_eval_interval_minutes <= 0:
        return
    _scheduler_state["running"] = True
    while True:
        await asyncio.sleep(settings.alert_eval_interval_minutes * 60)
        db = SessionLocal()
        try:
            await run_cycle(db)
            _scheduler_state["last_run"], _scheduler_state["last_error"] = datetime.now(UTC).isoformat(), None
        except Exception as exc:  # noqa: BLE001 - keep the loop alive
            log.exception("alert cycle failed")
            _scheduler_state["last_error"] = type(exc).__name__
        finally:
            db.close()
