"""Shared FastAPI dependencies + small helpers used across routers."""
from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.router import AIUnavailableError
from app.db import get_db  # re-export
from app.models import CV, Achievement, User
from app.monitoring.recorder import record_quality
from app.security.auth import get_current_user  # re-export

__all__ = ["get_db", "get_current_user", "track_task", "owned", "master_cv", "achievement_dict"]


@contextmanager
def track_task(task: str, user: User | None) -> Iterator[None]:
    """Record task_completed / task_failed quality events around a user-facing AI task."""
    try:
        yield
    except AIUnavailableError:
        record_quality("task_failed", user_id=user.id if user else None, task=task, outcome="failure",
                       details={"reason": "ai_unavailable"})
        raise
    except HTTPException as exc:
        if exc.status_code >= 500:
            record_quality("task_failed", user_id=user.id if user else None, task=task, outcome="failure",
                           details={"reason": f"http_{exc.status_code}"})
        raise
    except Exception:
        record_quality("task_failed", user_id=user.id if user else None, task=task, outcome="failure",
                       details={"reason": "exception"})
        raise
    else:
        record_quality("task_completed", user_id=user.id if user else None, task=task, outcome="success")


def owned(db: Session, model, obj_id: str, user: User):
    """Fetch a row by id that belongs to the user, or 404 (never 403 — do not leak existence)."""
    obj = db.get(model, obj_id)
    if obj is None or getattr(obj, "user_id", None) != user.id:
        raise HTTPException(404, "Not found")
    return obj


def master_cv(db: Session, user: User) -> CV | None:
    return db.scalar(select(CV).where(CV.user_id == user.id, CV.kind == "master"))


def achievement_dict(a: Achievement) -> dict:
    return {
        "id": a.id, "title": a.title, "description": a.description, "category": a.category, "source": a.source,
        "source_ref": a.source_ref, "technologies": a.technologies or [], "skills": a.skills or [], "impact": a.impact,
        "evidence": a.evidence or [], "status": a.status, "contribution_note": a.contribution_note,
        "needs_contribution_confirmation": a.needs_contribution_confirmation, "fingerprint": a.fingerprint,
        "confidence": a.confidence, "occurred_on": a.occurred_on, "created_at": a.created_at.isoformat(),
    }
