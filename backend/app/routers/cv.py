"""Master CV, version history, upload/parse, suggestion review (Accept / Edit / Reject) and export.

Invariant: the Master CV (kind=master) only changes through PUT /master (explicit user save),
POST /suggestions/{id}/accept|edit (explicit review) or version restore. Every change bumps the
version and snapshots it into cv_versions.
"""
from __future__ import annotations

from datetime import UTC, datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.schemas import CVData
from app.ai.workflows.career import parse_cv
from app.deps import get_current_user, get_db, master_cv, owned, track_task
from app.models import CV, CVSuggestion, CVVersion, Upload, User
from app.monitoring.recorder import record_quality
from app.services import export
from app.services.cv_updates import suggestion_out
from app.services.documents import UploadRejected, store, validate_and_extract

router = APIRouter(prefix="/api/cv", tags=["cv"])


class MasterIn(BaseModel):
    data: CVData
    change_summary: str = Field(default="Edited manually", max_length=300)


class EditAcceptIn(BaseModel):
    draft_data: CVData


def cv_out(cv: CV) -> dict:
    return {"id": cv.id, "kind": cv.kind, "title": cv.title, "data": cv.data, "version": cv.version,
            "parent_cv_id": cv.parent_cv_id, "job_analysis_id": cv.job_analysis_id,
            "created_at": cv.created_at.isoformat(), "updated_at": cv.updated_at.isoformat()}


def _snapshot(db: Session, cv: CV, summary: str) -> None:
    db.add(CVVersion(cv_id=cv.id, user_id=cv.user_id, version=cv.version, data=cv.data, change_summary=summary))


def save_master(db: Session, user: User, data: dict, summary: str) -> CV:
    cv = master_cv(db, user)
    if cv is None:
        cv = CV(user_id=user.id, kind="master", title="Master CV", data=data, version=1)
        db.add(cv)
        db.flush()
    else:
        cv.data = data
        cv.version += 1
    _snapshot(db, cv, summary)
    # pending suggestions built on an older version are now stale
    for s in db.scalars(select(CVSuggestion).where(CVSuggestion.cv_id == cv.id, CVSuggestion.status == "pending",
                                                   CVSuggestion.base_version < cv.version)):
        s.status = "stale"
    db.commit()
    return cv


@router.get("/master")
def get_master(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cv = master_cv(db, user)
    return cv_out(cv) if cv else None


@router.put("/master")
def put_master(body: MasterIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return cv_out(save_master(db, user, body.data.model_dump(), body.change_summary))


@router.post("/upload")
async def upload_cv(file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Parse an uploaded CV. Returns the structured result for REVIEW — nothing is saved to the Master CV."""
    data = await file.read()
    try:
        doc = validate_and_extract(file.filename or "cv", data)
    except UploadRejected as exc:
        raise HTTPException(422, str(exc)) from exc
    with track_task("cv_parse", user):
        parsed, flags = await parse_cv(user, doc.text)
    path = store(user.id, doc, data)
    db.add(Upload(user_id=user.id, filename=doc.filename, mime=doc.mime, size_bytes=doc.size, sha256=doc.sha256, purpose="cv",
                  storage_path=path, text_chars=len(doc.text), injection_flags=flags))
    db.commit()
    if flags:
        record_quality("injection_detected", user_id=user.id, task="cv_parse", details={"flags": len(flags)})
    return {"parsed": parsed.model_dump(), "injection_flags": flags, "text_chars": len(doc.text),
            "has_master": master_cv(db, user) is not None}


@router.get("/versions")
def versions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cv = master_cv(db, user)
    if not cv:
        return []
    rows = db.scalars(select(CVVersion).where(CVVersion.cv_id == cv.id).order_by(CVVersion.version.desc())).all()
    return [{"version": v.version, "change_summary": v.change_summary, "created_at": v.created_at.isoformat()} for v in rows]


@router.get("/versions/{version}")
def get_version(version: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cv = master_cv(db, user)
    v = cv and db.scalar(select(CVVersion).where(CVVersion.cv_id == cv.id, CVVersion.version == version))
    if not v:
        raise HTTPException(404, "Version not found")
    return {"version": v.version, "data": v.data, "change_summary": v.change_summary, "created_at": v.created_at.isoformat()}


@router.post("/versions/{version}/restore")
def restore(version: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cv = master_cv(db, user)
    v = cv and db.scalar(select(CVVersion).where(CVVersion.cv_id == cv.id, CVVersion.version == version))
    if not v:
        raise HTTPException(404, "Version not found")
    return cv_out(save_master(db, user, v.data, f"Restored version {version}"))


# ------------------------------------------------------------------ suggestions (Accept / Edit / Reject)
@router.get("/suggestions")
def list_suggestions(status: str = "pending", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(CVSuggestion).where(CVSuggestion.user_id == user.id, CVSuggestion.status == status)
                      .order_by(CVSuggestion.created_at.desc())).all()
    return [suggestion_out(s) for s in rows]


def _pending(db: Session, suggestion_id: str, user: User) -> tuple[CVSuggestion, CV]:
    s = owned(db, CVSuggestion, suggestion_id, user)
    if s.status != "pending":
        raise HTTPException(409, f"Suggestion is already {s.status}.")
    cv = db.get(CV, s.cv_id)
    if cv is None or cv.version != s.base_version:
        s.status = "stale"
        db.commit()
        raise HTTPException(409, "Your Master CV changed since this suggestion was drafted. Regenerate it from the achievement.")
    return s, cv


def _resolve(db: Session, s: CVSuggestion, status: str, user: User) -> None:
    s.status = status
    s.resolved_at = datetime.now(UTC)
    db.commit()
    record_quality("cv_suggestion_decision", user_id=user.id, task="cv_update", outcome=status,
                   details={"changes": len(s.changes)})


@router.post("/suggestions/{suggestion_id}/accept")
def accept(suggestion_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s, _ = _pending(db, suggestion_id, user)
    summary = "; ".join(c.get("summary", "") for c in s.changes)[:300] or "Accepted AI suggestion"
    cv = save_master(db, user, s.draft_data, f"Accepted: {summary}")
    _resolve(db, s, "accepted", user)
    return {"cv": cv_out(cv), "suggestion": suggestion_out(s)}


@router.post("/suggestions/{suggestion_id}/edit")
def edit_accept(suggestion_id: str, body: EditAcceptIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s, _ = _pending(db, suggestion_id, user)
    s.draft_data = body.draft_data.model_dump()
    cv = save_master(db, user, s.draft_data, "Accepted edited AI suggestion")
    _resolve(db, s, "edited", user)
    return {"cv": cv_out(cv), "suggestion": suggestion_out(s)}


@router.post("/suggestions/{suggestion_id}/reject")
def reject(suggestion_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = owned(db, CVSuggestion, suggestion_id, user)
    if s.status != "pending":
        raise HTTPException(409, f"Suggestion is already {s.status}.")
    _resolve(db, s, "rejected", user)
    return suggestion_out(s)


# ------------------------------------------------------------------ tailored CVs + export
@router.get("/tailored")
def tailored(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(CV).where(CV.user_id == user.id, CV.kind == "tailored").order_by(CV.created_at.desc())).all()
    return [cv_out(c) for c in rows]


@router.delete("/tailored/{cv_id}", status_code=204)
def delete_tailored(cv_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cv = owned(db, CV, cv_id, user)
    if cv.kind == "master":
        raise HTTPException(400, "The Master CV cannot be deleted here.")
    db.delete(cv)
    db.commit()


def _disposition(name: str, ext: str) -> str:
    # ASCII fallback + RFC 5987 UTF-8 name (Arabic names are not latin-1 safe in headers)
    return f"attachment; filename=\"wasl_cv.{ext}\"; filename*=UTF-8''{quote(name)}.{ext}"


@router.get("/{cv_id}/export")
def export_cv(cv_id: str, format: str = "pdf", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cv = owned(db, CV, cv_id, user)
    name = (cv.data.get("contact", {}).get("full_name") or "cv").replace(" ", "_")
    suffix = "" if cv.kind == "master" else "_tailored"
    if format == "docx":
        return Response(export.to_docx(cv.data), media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        headers={"Content-Disposition": _disposition(name + suffix, "docx")})
    if format == "pdf":
        return Response(export.to_pdf(cv.data), media_type="application/pdf",
                        headers={"Content-Disposition": _disposition(name + suffix, "pdf")})
    raise HTTPException(400, "format must be pdf or docx")
