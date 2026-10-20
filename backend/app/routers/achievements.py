from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.router import AIUnavailableError
from app.ai.skills import canonical
from app.ai.workflows.discovery import discover, fingerprint, similarity
from app.deps import achievement_dict, get_current_user, get_db, owned, track_task
from app.models import Achievement, User
from app.monitoring.recorder import record_quality
from app.services.cv_updates import suggest_for_achievement

router = APIRouter(prefix="/api/achievements", tags=["achievements"])

Category = Literal["project", "certification", "experience", "award", "education"]


class AchievementIn(BaseModel):
    title: str = Field(min_length=3, max_length=300)
    description: str = Field(default="", max_length=4000)
    category: Category = "project"
    technologies: list[str] = Field(default_factory=list, max_length=30)
    skills: list[str] = Field(default_factory=list, max_length=30)
    impact: str = Field(default="", max_length=1500)
    occurred_on: str = Field(default="", max_length=20)
    contribution_note: str = Field(default="", max_length=1500)


class AchievementPatch(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=300)
    description: str | None = Field(default=None, max_length=4000)
    category: Category | None = None
    technologies: list[str] | None = None
    skills: list[str] | None = None
    impact: str | None = Field(default=None, max_length=1500)
    occurred_on: str | None = None
    contribution_note: str | None = Field(default=None, max_length=1500)


class ExtractIn(BaseModel):
    text: str = Field(min_length=20, max_length=12000)


class ConfirmIn(BaseModel):
    contribution_note: str = Field(default="", max_length=1500)
    auto_cv_update: bool = True


def existing_for_dedupe(db: Session, user: User) -> list[dict]:
    rows = db.scalars(select(Achievement).where(Achievement.user_id == user.id, Achievement.status != "rejected")).all()
    return [{"id": a.id, "title": a.title, "description": a.description, "fingerprint": a.fingerprint} for a in rows]


def find_duplicate(db: Session, user: User, title: str, description: str, exclude: str | None = None) -> dict | None:
    fp = fingerprint(title)
    for e in existing_for_dedupe(db, user):
        if e["id"] == exclude:
            continue
        if e["fingerprint"] == fp or similarity(f"{title} {description}", f"{e['title']} {e['description']}") >= 0.6:
            return {"id": e["id"], "title": e["title"]}
    return None


def save_candidates(db: Session, user: User, candidates: list[dict], source: str, source_ref: str | None) -> list[dict]:
    saved = []
    for c in candidates:
        a = Achievement(
            user_id=user.id, title=c["title"][:300], description=c["description"], category=c["category"], source=source,
            source_ref=source_ref, technologies=c["technologies"], skills=c["skills"], impact=c["impact"],
            evidence=c["evidence"], status="pending", needs_contribution_confirmation=c["needs_contribution_confirmation"],
            fingerprint=c["fingerprint"], confidence=c["confidence"], occurred_on=c.get("occurred_on", ""),
        )
        db.add(a)
        db.flush()
        d = achievement_dict(a)
        d.update({"duplicate_of": c.get("duplicate_of"), "contribution_question": c.get("contribution_question", ""),
                  "dropped_terms": c.get("dropped_terms", []), "unverified_quotes": c.get("unverified_quotes", 0)})
        saved.append(d)
    db.commit()
    return saved


@router.get("")
def list_achievements(status: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Achievement).where(Achievement.user_id == user.id)
    if status:
        stmt = stmt.where(Achievement.status == status)
    return [achievement_dict(a) for a in db.scalars(stmt.order_by(Achievement.created_at.desc()))]


@router.post("", status_code=201)
async def create_achievement(body: AchievementIn, auto_cv_update: bool = True, force: bool = False,
                             user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Manually entered achievements are the user's own statements -> confirmed immediately."""
    dup = find_duplicate(db, user, body.title, body.description)
    if dup and not force:
        raise HTTPException(409, detail={"message": "This looks like an achievement you already added.", "duplicate_of": dup})
    a = Achievement(user_id=user.id, **body.model_dump(), status="confirmed", source="manual", fingerprint=fingerprint(body.title),
                    confidence=1.0)
    a.technologies = [canonical(t) for t in body.technologies]
    a.skills = [canonical(s) for s in body.skills]
    db.add(a)
    db.commit()
    out = {"achievement": achievement_dict(a), "cv_update": None}
    if auto_cv_update:
        out["cv_update"] = await _try_suggest(db, user, a)
    return out


async def _try_suggest(db: Session, user: User, a: Achievement) -> dict:
    try:
        with track_task("cv_update", user):
            return await suggest_for_achievement(db, user, a)
    except AIUnavailableError as exc:
        return {"status": "ai_unavailable", "reason": exc.reason}


@router.post("/extract")
async def extract(body: ExtractIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Free text (e.g. 'I finished the AWS SA cert and built…') -> structured candidates saved as pending."""
    with track_task("achievement_extraction", user):
        state = await discover(user, "manual", "your description", body.text, existing_for_dedupe(db, user))
    if state.get("injection_flags"):
        record_quality("injection_detected", user_id=user.id, task="achievement_extraction", details={"flags": len(state["injection_flags"])})
    saved = save_candidates(db, user, state["candidates"], "manual", None)
    return {"candidates": saved, "no_achievement_reason": state["extraction"].no_achievement_reason,
            "injection_flags": state.get("injection_flags", [])}


@router.patch("/{achievement_id}")
def update(achievement_id: str, body: AchievementPatch, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = owned(db, Achievement, achievement_id, user)
    data = body.model_dump(exclude_none=True)
    for k, v in data.items():
        if k in ("technologies", "skills"):
            v = [canonical(x) for x in v]
        setattr(a, k, v)
    if "title" in data:
        a.fingerprint = fingerprint(a.title)
    db.commit()
    return achievement_dict(a)


@router.post("/{achievement_id}/confirm")
async def confirm(achievement_id: str, body: ConfirmIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = owned(db, Achievement, achievement_id, user)
    if a.needs_contribution_confirmation and len(body.contribution_note.strip()) < 10:
        raise HTTPException(422, "Please describe your personal contribution (at least a sentence) before confirming.")
    was_pending = a.status == "pending"
    a.status = "confirmed"
    if body.contribution_note:
        a.contribution_note = body.contribution_note.strip()
    db.commit()
    if was_pending:
        record_quality("achievement_feedback", user_id=user.id, task=a.source, outcome="confirmed", value=a.confidence)
    out = {"achievement": achievement_dict(a), "cv_update": None}
    if body.auto_cv_update:
        out["cv_update"] = await _try_suggest(db, user, a)
    return out


@router.post("/{achievement_id}/reject")
def reject(achievement_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = owned(db, Achievement, achievement_id, user)
    if a.status == "pending":
        record_quality("achievement_feedback", user_id=user.id, task=a.source, outcome="rejected", value=a.confidence)
    a.status = "rejected"
    db.commit()
    return achievement_dict(a)


@router.post("/{achievement_id}/suggest-cv-update")
async def suggest(achievement_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = owned(db, Achievement, achievement_id, user)
    if a.status != "confirmed":
        raise HTTPException(409, "Confirm the achievement before adding it to your CV.")
    with track_task("cv_update", user):
        return await suggest_for_achievement(db, user, a)


@router.delete("/{achievement_id}", status_code=204)
def delete(achievement_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = owned(db, Achievement, achievement_id, user)
    db.delete(a)
    db.commit()
