from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.models import EvalRun, User
from app.monitoring.metrics import compute

router = APIRouter(prefix="/api/monitoring", tags=["monitoring"])


@router.get("/metrics")
def metrics(days: int = Query(7, ge=1, le=90), scope: str = Query("all", pattern="^(all|mine)$"),
            user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Aggregated operational metrics. 'all' = whole deployment (aggregates only, no user content)."""
    return compute(db, days, user.id if scope == "mine" else None)


@router.get("/evals")
def evals(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(EvalRun).order_by(EvalRun.created_at.desc()).limit(20)).all()
    return [{"id": r.id, "at": r.created_at.isoformat(), "dataset_version": r.dataset_version, "provider": r.provider,
             "model": r.model, "summary": r.summary} for r in rows]


@router.get("/evals/{run_id}")
def eval_run(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.get(EvalRun, run_id)
    if not r:
        return None
    return {"id": r.id, "at": r.created_at.isoformat(), "dataset_version": r.dataset_version, "provider": r.provider,
            "model": r.model, "summary": r.summary, "cases": r.cases}
