
"""Dashboard summary — every number is the user's real data; recommendations are rule-based."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.deps import get_current_user, get_db, master_cv
from app.models import Achievement, CVSuggestion, Integration, JobAnalysis, Post, User

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    def count(stmt) -> int:
        return db.scalar(stmt) or 0

    ach_counts = dict(
        db.execute(
            select(Achievement.status, func.count())
            .where(Achievement.user_id == user.id)
            .group_by(Achievement.status)
        ).all()
    )

    post_counts = dict(
        db.execute(
            select(Post.status, func.count())
            .where(Post.user_id == user.id)
            .group_by(Post.status)
        ).all()
    )

    pending_sugg = count(
        select(func.count())
        .select_from(CVSuggestion)
        .where(
            CVSuggestion.user_id == user.id,
            CVSuggestion.status == "pending",
        )
    )

    recent_achievements = db.scalars(
        select(Achievement)
        .where(
            Achievement.user_id == user.id,
            Achievement.status == "confirmed",
        )
        .order_by(Achievement.created_at.desc())
        .limit(10)
    ).all()

    recent_posts = db.scalars(
        select(Post)
        .where(
            Post.user_id == user.id,
            Post.status == "published",
            Post.linkedin_post_urn.is_not(None),
            Post.published_at.is_not(None),
        )
        .order_by(Post.published_at.desc())
        .limit(10)
    ).all()

    recent_activity = [
        {
            "id": a.id,
            "type": "achievement",
            "title": a.title,
            "preview": a.description,
            "created_at": a.created_at.isoformat(),
        }
        for a in recent_achievements
    ] + [
        {
            "id": p.id,
            "type": "linkedin_post",
            "title": "",
            "preview": p.content[:240],
            "created_at": p.published_at.isoformat(),
        }
        for p in recent_posts
    ]
    recent_activity.sort(key=lambda item: item["created_at"], reverse=True)
    recent_activity = recent_activity[:10]

    cv = master_cv(db, user)

    integrations = {
        i.provider: i.status
        for i in db.scalars(
            select(Integration).where(Integration.user_id == user.id)
        )
    }

    last_analysis = db.scalars(
        select(JobAnalysis)
        .where(JobAnalysis.user_id == user.id)
        .order_by(JobAnalysis.created_at.desc())
        .limit(1)
    ).first()

    linked_ids = set()

    if cv:
        for sec in ("projects", "certifications", "awards"):
            linked_ids |= {
                i.get("achievement_id")
                for i in cv.data.get(sec, [])
                if i.get("achievement_id")
            }

    confirmed = db.scalars(
        select(Achievement).where(
            Achievement.user_id == user.id,
            Achievement.status == "confirmed",
        )
    ).all()

    not_in_cv = [
        a for a in confirmed
        if a.id not in linked_ids
    ]

    posted_ids = {
        p
        for (p,) in db.execute(
            select(Post.achievement_id).where(
                Post.user_id == user.id,
                Post.achievement_id.is_not(None),
            )
        )
    }

    not_posted = [
        a for a in confirmed
        if a.id not in posted_ids
    ]

    recs = []

    if not cv:
        recs.append({
            "key": "create_cv",
            "action": "/cv",
            "priority": "high",
        })

    if pending_sugg:
        recs.append({
            "key": "review_suggestions",
            "count": pending_sugg,
            "action": "/cv",
            "priority": "high",
        })

    if cv and not_in_cv:
        recs.append({
            "key": "achievements_not_in_cv",
            "count": len(not_in_cv),
            "action": "/cv",
            "priority": "medium",
        })

    if not_posted:
        recs.append({
            "key": "achievements_not_posted",
            "count": len(not_posted),
            "action": "/studio",
            "priority": "medium",
        })

    if "linkedin" not in integrations:
        recs.append({
            "key": "connect_linkedin",
            "action": "/settings",
            "priority": "low",
            "available": settings.linkedin_configured,
        })

    if cv and not last_analysis:
        recs.append({
            "key": "try_gap",
            "action": "/gap",
            "priority": "low",
        })

    return {
        "user": {
            "full_name": user.full_name,
            "headline": user.headline,
        },
        "achievements": {
            "confirmed": ach_counts.get("confirmed", 0),
            "pending": ach_counts.get("pending", 0),
            "rejected": ach_counts.get("rejected", 0),
        },
        "posts": {
            "draft": post_counts.get("draft", 0),
            "published": post_counts.get("published", 0),
            "failed": (
                post_counts.get("failed", 0)
                + post_counts.get("uncertain", 0)
            ),
        },
        "cv": {
            "exists": bool(cv),
            "version": cv.version if cv else None,
            "updated_at": (
                cv.updated_at.isoformat()
                if cv else None
            ),
            "pending_suggestions": pending_sugg,
            "sections": {
                k: len(cv.data.get(k, []))
                for k in (
                    "experience",
                    "projects",
                    "education",
                    "certifications",
                    "skills",
                )
            } if cv else None,
        },
        "recent_activity": recent_activity,
        "integrations": integrations,
        "last_analysis": {
            "id": last_analysis.id,
            "kind": last_analysis.kind,
            "job_title": last_analysis.job_title,
            "match_score": last_analysis.match_score,
            "created_at": last_analysis.created_at.isoformat(),
        } if last_analysis else None,
        "recommendations": recs,
    }
