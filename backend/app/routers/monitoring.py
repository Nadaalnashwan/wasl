"""DEPRECATED v1 monitoring API, kept only so old clients get a clear answer.

v1 let any signed-in user read deployment-wide metrics (`scope=all`). Every route now requires the admin role
and simply forwards to the v2 admin API (app/routers/admin.py). No route here is reachable by normal users.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.deps import get_db
from app.routers import admin
from app.security.authz import require_admin

router = APIRouter(prefix="/api/monitoring", tags=["monitoring (deprecated)"], dependencies=[Depends(require_admin)],
                   deprecated=True)


@router.get("/metrics")
def metrics(days: int = Query(7, ge=1, le=90), db: Session = Depends(get_db)):
    return admin.metrics(days=days, provider=None, model=None, task=None, db=db)


@router.get("/evals")
def evals(db: Session = Depends(get_db)):
    return admin.evals(kind=None, db=db)


@router.get("/evals/{run_id}")
def eval_run(run_id: str, db: Session = Depends(get_db)):
    return admin.eval_run(run_id, db)
