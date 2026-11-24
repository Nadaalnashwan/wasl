"""Writes monitoring events. Uses its own short-lived DB session so telemetry never breaks a request.

Privacy rule: only metadata (task names, providers, counts, latencies, error classes) is stored.
Never prompts, completions, CV text, API keys or OAuth tokens.
"""
from __future__ import annotations

import logging
import re
import uuid
from typing import Any

from app.db import SessionLocal
from app.models import AIEvent, ErrorLog, HTTPEvent, QualityEvent
from app.security.pii import redact_for_logs

log = logging.getLogger("wasl.monitoring")

_SECRET_PATTERNS = [
    re.compile(r"(sk|gsk|AIza|ghp|gho|github_pat)[-_A-Za-z0-9]{10,}"),
    re.compile(r"Bearer\s+[A-Za-z0-9._-]+", re.I),
    re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"),
]


def scrub(text: str, limit: int = 300) -> str:
    """Remove secrets AND personal data (emails, phones, IDs…) before anything reaches logs."""
    for pat in _SECRET_PATTERNS:
        text = pat.sub("[redacted]", text)
    return redact_for_logs(text, limit)


def _write(obj: Any) -> None:
    db = SessionLocal()
    try:
        db.add(obj)
        db.commit()
    except Exception:  # pragma: no cover - telemetry must never crash the app
        db.rollback()
        log.exception("failed to write monitoring event")
    finally:
        db.close()


def record_ai_event(**kwargs: Any) -> None:
    _write(AIEvent(**kwargs))


def record_http_event(**kwargs: Any) -> None:
    _write(HTTPEvent(**kwargs))


def record_quality(kind: str, *, user_id: str | None = None, task: str = "", outcome: str = "",
                   value: float | None = None, details: dict[str, Any] | None = None) -> None:
    _write(QualityEvent(kind=kind, user_id=user_id, task=task, outcome=outcome, value=value, details=details or {}))


def record_claim_check(task: str, report: dict, *, stage: str, user_id: str | None = None, **extra: Any) -> None:
    """stage: raw (model output before any enforcement) | final (what the user receives / what is saved) |
    approved (content the user accepted, exported or published)."""
    summary = report.get("summary") or {}
    record_quality("claim_check", user_id=user_id, task=task, outcome=stage, details={
        "stage": stage,
        "claims_checked": int(report.get("claims_checked", 0)),
        "unsupported_count": int(report.get("unsupported_count", 0)),
        "blocking_count": int(report.get("blocking_count", report.get("unsupported_count", 0))),
        "contradicted": int(summary.get("contradicted", 0)),
        "ambiguous": int(summary.get("ambiguous", 0)),
        "needs_confirmation": int(summary.get("needs_confirmation", 0)),
        "unavailable": int(summary.get("unavailable", 0)),
        "verifier_version": report.get("verifier_version", "claims-v1"),
        **extra,
    })


def record_error(route: str, exc: BaseException, user_id: str | None = None) -> str:
    err = ErrorLog(id=str(uuid.uuid4()), route=route, error_type=type(exc).__name__, message=scrub(str(exc)), user_id=user_id)
    _write(err)
    return err.id
