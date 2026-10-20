from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.ai.claims import check_claims
from app.ai.workflows.content import evidence_text, generate_post, improve_post
from app.deps import achievement_dict, get_current_user, get_db, owned, track_task
from app.models import Achievement, Integration, Post, User
from app.monitoring.recorder import record_quality
from app.security.crypto import decrypt
from app.services import linkedin

router = APIRouter(prefix="/api/posts", tags=["posts"])

Tone = Literal["professional", "inspiring", "storytelling", "concise", "humble", "technical"]


class GenerateIn(BaseModel):
    achievement_id: str | None = None
    text: str | None = Field(default=None, max_length=4000, description="Ad-hoc description when no saved achievement")
    tone: Tone = "professional"
    language: Literal["en", "ar"] = "en"
    instructions: str = Field(default="", max_length=500)


class ImproveIn(BaseModel):
    content: str = Field(min_length=20, max_length=3000)
    tone: Tone = "professional"
    language: Literal["en", "ar"] = "en"
    save_as_post_id: str | None = None


class PostPatch(BaseModel):
    content: str | None = Field(default=None, min_length=1, max_length=3000)
    hashtags: list[str] | None = Field(default=None, max_length=8)
    tone: Tone | None = None


class PublishIn(BaseModel):
    confirm: bool = False  # explicit user approval, required
    confirm_not_published: bool = False  # required to retry after an ambiguous result


def post_out(p: Post) -> dict:
    return {"id": p.id, "achievement_id": p.achievement_id, "content": p.content, "tone": p.tone, "language": p.language,
            "hashtags": p.hashtags or [], "status": p.status, "linkedin_post_urn": p.linkedin_post_urn,
            "publish_error": p.publish_error, "published_at": p.published_at.isoformat() if p.published_at else None,
            "claim_check": p.claim_check or {}, "created_at": p.created_at.isoformat(), "updated_at": p.updated_at.isoformat()}


@router.get("")
def list_posts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [post_out(p) for p in db.scalars(select(Post).where(Post.user_id == user.id).order_by(Post.updated_at.desc()))]


@router.post("/generate", status_code=201)
async def generate(body: GenerateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.achievement_id:
        a = owned(db, Achievement, body.achievement_id, user)
        if a.status == "rejected":
            raise HTTPException(409, "This achievement was rejected.")
        ach = achievement_dict(a)
    elif body.text and len(body.text.strip()) >= 20:
        ach = {"title": "", "description": body.text.strip()}
    else:
        raise HTTPException(422, "Pick an achievement or describe it (at least 20 characters).")
    with track_task("post_generation", user):
        state = await generate_post(user, ach, body.tone, body.language, body.instructions)
    claims = state["claims"]
    record_quality("claim_check", user_id=user.id, task="post_generation",
                   details={"claims_checked": claims["claims_checked"], "unsupported_count": claims["unsupported_count"],
                            "revisions": state.get("revisions", 0)})
    gp = state["post"]
    p = Post(user_id=user.id, achievement_id=body.achievement_id, content=gp.content, tone=body.tone, language=body.language,
             hashtags=gp.hashtags, status="draft",
             claim_check={**claims, "revisions": state.get("revisions", 0), "provider": state.get("provider"),
                          "model": state.get("model"), "fallback_used": state.get("fallback_used", False)})
    db.add(p)
    db.commit()
    return post_out(p)


@router.post("/improve")
async def improve(body: ImproveIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    with track_task("post_improve", user):
        gp, claims, provider = await improve_post(user, body.content, body.tone, body.language)
    record_quality("claim_check", user_id=user.id, task="post_improve",
                   details={"claims_checked": claims["claims_checked"], "unsupported_count": claims["unsupported_count"]})
    return {"content": gp.content, "hashtags": gp.hashtags, "claim_check": claims, "provider": provider}


@router.patch("/{post_id}")
def edit(post_id: str, body: PostPatch, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = owned(db, Post, post_id, user)
    if p.status in ("published", "publishing"):
        raise HTTPException(409, "Published posts cannot be edited here.")
    data = body.model_dump(exclude_none=True)
    for k, v in data.items():
        setattr(p, k, v)
    if "content" in data and p.achievement_id:
        a = db.get(Achievement, p.achievement_id)
        if a:
            p.claim_check = {**check_claims(p.content, evidence_text(achievement_dict(a))), "edited_by_user": True}
    db.commit()
    return post_out(p)


@router.delete("/{post_id}", status_code=204)
def delete(post_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = owned(db, Post, post_id, user)
    if p.status == "publishing":
        raise HTTPException(409, "Post is being published.")
    db.delete(p)
    db.commit()


@router.post("/{post_id}/publish")
async def publish(post_id: str, body: PublishIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = owned(db, Post, post_id, user)
    if not body.confirm:
        raise HTTPException(400, "Publishing requires explicit confirmation.")
    if p.status == "published":
        raise HTTPException(409, "Already published.")
    if p.status == "uncertain" and not body.confirm_not_published:
        raise HTTPException(409, "The last attempt may have succeeded. Check LinkedIn, then confirm it was not published to retry.")
    integ = db.scalar(select(Integration).where(Integration.user_id == user.id, Integration.provider == "linkedin"))
    if integ is None or integ.status != "connected":
        raise HTTPException(412, "LinkedIn is not connected. Connect it in Settings to publish.")
    if integ.expires_at and integ.expires_at.replace(tzinfo=integ.expires_at.tzinfo or UTC) < datetime.now(UTC):
        integ.status = "expired"
        db.commit()
        raise HTTPException(412, "Your LinkedIn connection expired. Reconnect it in Settings.")

    # Atomic lock: only one request can move draft/failed/uncertain -> publishing (prevents duplicate posts).
    res = db.execute(update(Post).where(Post.id == p.id, Post.status.in_(["draft", "failed", "uncertain"]))
                     .values(status="publishing", publish_attempts=Post.publish_attempts + 1))
    db.commit()
    if res.rowcount != 1:
        raise HTTPException(409, "This post is already being published.")

    text = p.content + ("\n\n" + " ".join(p.hashtags) if p.hashtags else "")
    try:
        urn = await linkedin.publish(decrypt(integ.access_token_enc), integ.account_id, text)
    except linkedin.PublishError as err:
        p.status = "uncertain" if err.kind == "ambiguous" else "failed"
        p.publish_error = err.message
        if err.kind == "auth":
            integ.status = "expired"
        db.commit()
        record_quality("publish_result", user_id=user.id, task="linkedin", outcome=err.kind)
        raise HTTPException(502, {"message": err.message, "kind": err.kind, "post": post_out(p)}) from err
    p.status = "published"
    p.linkedin_post_urn = urn
    p.publish_error = None
    p.published_at = datetime.now(UTC)
    db.commit()
    record_quality("publish_result", user_id=user.id, task="linkedin", outcome="success")
    return post_out(p)
