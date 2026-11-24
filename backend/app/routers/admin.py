"""Administrative API. EVERY route depends on require_admin (401 anonymous, 403 non-admin).

Only aggregated operational metadata is returned: no prompts, CV text, user content, emails or keys.
"""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.ai import model_registry
from app.ai.providers.registry import platform_providers
from app.config import settings
from app.deps import get_db
from app.models import AdminAuditLog, AIEvent, AlertIncident, EvalRun, HTTPEvent, QualityEvent, User
from app.monitoring import alerts
from app.monitoring.metrics import compute
from app.security.authz import audit, require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


@router.get("/whoami")
def whoami(user: User = Depends(require_admin)):
    """Used by the frontend proxy to verify admin access server-side on every /admin navigation."""
    return {"id": user.id, "role": user.role}


@router.get("/health")
def health(db: Session = Depends(get_db)):
    db_ok, db_error = True, None
    try:
        db.execute(text("select 1"))
    except Exception as exc:  # noqa: BLE001
        db_ok, db_error = False, type(exc).__name__
    last_http = db.scalar(select(func.max(HTTPEvent.created_at))) if db_ok else None
    last_ai = db.scalar(select(func.max(AIEvent.created_at))) if db_ok else None
    providers = [p for p in platform_providers() if p != "fake"]
    return {
        "checked_at": datetime.now(UTC).isoformat(),
        "environment": settings.app_env,
        "backend": "ok",
        "database": {"ok": db_ok, "engine": "sqlite" if settings.is_sqlite else "postgres", "error": db_error},
        "monitoring": {"last_http_event": _iso(last_http), "last_ai_event": _iso(last_ai),
                       "has_data": bool(last_http or last_ai)},
        "auth_mode": settings.auth_mode,
        "ai_providers_configured": providers,
        "privacy": {"personal_min_privacy": settings.ai_personal_min_privacy, "pii_redaction": settings.ai_redact_pii,
                    "groq_zdr_attested": settings.groq_zdr_enabled, "gemini_paid_tier_attested": settings.gemini_paid_tier},
        "alerts": alerts.scheduler_status(db) if db_ok else alerts.scheduler_status(),
        "registry_version": model_registry.REGISTRY_VERSION,
    }


@router.get("/monitoring/metrics")
def metrics(
    days: int = Query(7, ge=1, le=90),
    provider: str | None = Query(None, max_length=40),
    model: str | None = Query(None, max_length=200),
    task: str | None = Query(None, max_length=40),
    db: Session = Depends(get_db),
):
    """Deployment-wide aggregates (never per-user content)."""
    out = compute(db, days, None, provider=provider, model=model, task=task)
    out["scope"] = "all"
    out.pop("recent_errors", None)  # errors are served separately with scrubbed messages
    out["options"] = {
        "providers": sorted({r[0] for r in db.execute(select(AIEvent.provider).distinct()) if r[0] != "none"}),
        "models": sorted({r[0] for r in db.execute(select(AIEvent.model).distinct()) if r[0] and r[0] != "-"}),
        "tasks": sorted(model_registry.TASKS),
    }
    return out


@router.get("/monitoring/errors")
def errors(days: int = Query(7, ge=1, le=90), db: Session = Depends(get_db)):
    m = compute(db, days)
    return {"recent_errors": m["recent_errors"], "recent_ai_failures": m["recent_ai_failures"]}


def _eval_out(r: EvalRun, cases: bool = False) -> dict:
    out = {"id": r.id, "at": r.created_at.isoformat(), "dataset_version": r.dataset_version, "kind": r.kind,
           "provider": r.provider or None, "model": r.model or None, "verifier_version": r.verifier_version or None,
           "git_sha": r.git_sha or None, "summary": r.summary}
    if cases:
        out["cases"] = r.cases
    return out


@router.get("/monitoring/evals")
def evals(kind: str | None = Query(None, pattern="^(deterministic|live|benchmark)$"), db: Session = Depends(get_db)):
    stmt = select(EvalRun).order_by(EvalRun.created_at.desc()).limit(30)
    if kind:
        stmt = stmt.where(EvalRun.kind == kind)
    return [_eval_out(r) for r in db.scalars(stmt).all()]


@router.get("/monitoring/evals/{run_id}")
def eval_run(run_id: str, db: Session = Depends(get_db)):
    r = db.get(EvalRun, run_id)
    if not r:
        raise HTTPException(404, "Evaluation run not found")
    return _eval_out(r, cases=True)


@router.get("/monitoring/models")
def models():
    return model_registry.describe()


@router.get("/monitoring/alerts")
def list_alerts(status: str | None = Query(None, pattern="^(open|resolved)$"), db: Session = Depends(get_db)):
    stmt = select(AlertIncident).order_by(AlertIncident.created_at.desc()).limit(100)
    if status:
        stmt = stmt.where(AlertIncident.status == status)
    rows = db.scalars(stmt).all()
    return {
        "channel": alerts.channel(),
        "scheduler": alerts.scheduler_status(db),
        "thresholds": {
            "failure_rate": settings.alert_failure_rate, "p95_latency_ms": settings.alert_p95_latency_ms,
            "raw_unsupported_claim_rate": settings.alert_unsupported_claim_rate, "fallback_rate": settings.alert_fallback_rate,
            "rate_limit_count": settings.alert_rate_limit_count, "daily_cost_usd": settings.alert_daily_cost_usd,
            "min_sample": settings.alert_min_sample, "cooldown_minutes": settings.alert_cooldown_minutes,
            "claims_escaped": 0,
        },
        "incidents": [{
            "id": i.id, "key": i.key, "severity": i.severity, "title": i.title, "status": i.status, "value": i.value,
            "threshold": i.threshold, "sample_size": i.sample_size, "investigate": i.investigate, "opened_at": _iso(i.created_at),
            "last_seen_at": _iso(i.last_seen_at), "resolved_at": _iso(i.resolved_at), "notify_status": i.notify_status,
            "notify_attempts": i.notify_attempts, "notified_at": _iso(i.notified_at), "recovery_notified": i.recovery_notified,
            "last_error": i.last_error,
        } for i in rows],
    }


@router.post("/monitoring/alerts/evaluate")
async def evaluate_now(db: Session = Depends(get_db)):
    return await alerts.run_cycle(db)


@router.post("/monitoring/alerts/test")
async def test_alert(user: User = Depends(require_admin)):
    """Send a clearly-labelled test message to the configured channel."""
    if alerts.channel() == "disabled":
        raise HTTPException(412, "No external alert channel is configured (ALERT_SLACK_WEBHOOK_URL or ALERT_WEBHOOK_URL).")
    ok, err = await alerts.deliver({"text": f"[Wasl {settings.app_env}] TEST alert from the admin console — no action needed.",
                                    "key": "test", "severity": "info", "status": "test", "environment": settings.app_env})
    audit("alert_test", actor=user, details={"ok": ok})
    return {"delivered": ok, "error": err or None, "channel": alerts.channel()}


@router.get("/audit")
def audit_log(limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)):
    rows = db.scalars(select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(limit)).all()
    return [{"at": r.created_at.isoformat(), "action": r.action, "actor": r.actor_label, "target_user_id": r.target_user_id,
             "details": r.details} for r in rows]


@router.get("/monitoring/quality-events")
def quality_breakdown(days: int = Query(7, ge=1, le=90), db: Session = Depends(get_db)):
    """Counts of quality event kinds (sample sizes for the AI-quality tab)."""
    m = compute(db, days)
    kinds = dict(db.execute(select(QualityEvent.kind, func.count()).group_by(QualityEvent.kind)).all())
    return {"kinds": kinds, "quality": m["quality"]}
