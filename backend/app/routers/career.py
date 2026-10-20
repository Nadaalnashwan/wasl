from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.workflows.career import run_career
from app.deps import achievement_dict, get_current_user, get_db, master_cv, owned, track_task
from app.models import CV, Achievement, JobAnalysis, User
from app.monitoring.recorder import record_quality

router = APIRouter(prefix="/api/career", tags=["career"])


class JobIn(BaseModel):
    job_text: str = Field(min_length=80, max_length=15000)
    cv_id: str | None = None  # defaults to Master CV


def _cv_for(db: Session, user: User, cv_id: str | None) -> CV:
    cv = owned(db, CV, cv_id, user) if cv_id else master_cv(db, user)
    if cv is None or not cv.data:
        raise HTTPException(412, "Create or upload your Master CV first.")
    return cv


def _confirmed(db: Session, user: User) -> list[dict]:
    return [achievement_dict(a) for a in db.scalars(select(Achievement).where(Achievement.user_id == user.id, Achievement.status == "confirmed"))]


def analysis_out(j: JobAnalysis) -> dict:
    return {"id": j.id, "kind": j.kind, "job_title": j.job_title, "company": j.company, "match_score": j.match_score,
            "requirements": j.requirements, "result": j.result, "created_at": j.created_at.isoformat()}


@router.post("/tailor")
async def tailor(body: JobIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cv = _cv_for(db, user, body.cv_id)
    with track_task("cv_tailor", user):
        st = await run_career(user, "tailor", body.job_text, cv.data, _confirmed(db, user))
    req = st["requirements"]
    enf = st["enforcement"]
    record_quality("claim_check", user_id=user.id, task="cv_tailor",
                   details={"claims_checked": enf["claims_checked"], "unsupported_count": enf["unsupported_found"]})
    j = JobAnalysis(user_id=user.id, kind="tailor", job_title=req.job_title[:300], company=req.company[:300],
                    requirements=req.model_dump(), match_score=st["score"]["score"],
                    result={"must": st["must"], "nice": st["nice"], "score": st["score"], "enforcement": enf,
                            "notes": st["tailored_raw"].notes, "highlighted_item_ids": st["tailored_raw"].highlighted_item_ids,
                            "injection_flags": st.get("injection_flags", [])})
    db.add(j)
    db.flush()
    title = f"{req.job_title or 'Tailored CV'}" + (f" — {req.company}" if req.company else "")
    t = CV(user_id=user.id, kind="tailored", title=title[:300], data=st["tailored_cv"], version=1, parent_cv_id=cv.id,
           job_analysis_id=j.id)
    db.add(t)
    db.commit()
    return {"analysis": analysis_out(j), "original": cv.data, "tailored": {"id": t.id, "title": t.title, "data": t.data}}


@router.post("/gap")
async def gap(body: JobIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cv = _cv_for(db, user, body.cv_id)
    with track_task("gap_analysis", user):
        st = await run_career(user, "gap", body.job_text, cv.data, _confirmed(db, user))
    req = st["requirements"]
    j = JobAnalysis(user_id=user.id, kind="gap", job_title=req.job_title[:300], company=req.company[:300],
                    requirements=req.model_dump(), match_score=st["score"]["score"],
                    result={"must": st["must"], "nice": st["nice"], "score": st["score"], "roadmap": st["roadmap"].model_dump(),
                            "injection_flags": st.get("injection_flags", [])})
    db.add(j)
    db.commit()
    return analysis_out(j)


@router.get("/analyses")
def analyses(kind: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(JobAnalysis).where(JobAnalysis.user_id == user.id)
    if kind:
        stmt = stmt.where(JobAnalysis.kind == kind)
    return [analysis_out(j) for j in db.scalars(stmt.order_by(JobAnalysis.created_at.desc()).limit(30))]


@router.get("/analyses/{analysis_id}")
def analysis(analysis_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    j = owned(db, JobAnalysis, analysis_id, user)
    out = analysis_out(j)
    if j.kind == "tailor":
        t = db.scalar(select(CV).where(CV.job_analysis_id == j.id, CV.user_id == user.id))
        if t:
            parent = db.get(CV, t.parent_cv_id) if t.parent_cv_id else None
            out["tailored"] = {"id": t.id, "title": t.title, "data": t.data}
            out["original"] = parent.data if parent else None
    return out
