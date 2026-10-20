"""Automatic CV update workflow: achievement -> proposed changes applied to a SEPARATE draft -> user review."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.claims import check_claims
from app.ai.workflows.career import achievement_text, propose_cv_update
from app.deps import achievement_dict, master_cv
from app.models import Achievement, CVSuggestion, User
from app.monitoring.recorder import record_quality


def suggestion_out(s: CVSuggestion) -> dict:
    return {"id": s.id, "cv_id": s.cv_id, "achievement_id": s.achievement_id, "base_version": s.base_version,
            "draft_data": s.draft_data, "changes": s.changes, "rationale": s.rationale, "status": s.status,
            "created_at": s.created_at.isoformat(), "resolved_at": s.resolved_at.isoformat() if s.resolved_at else None}


async def suggest_for_achievement(db: Session, user: User, ach: Achievement) -> dict:
    """Returns {"status": created|duplicate|no_cv|no_changes|exists, ...}."""
    cv = master_cv(db, user)
    if cv is None:
        return {"status": "no_cv"}
    existing = db.scalar(select(CVSuggestion).where(CVSuggestion.user_id == user.id, CVSuggestion.achievement_id == ach.id,
                                                    CVSuggestion.status == "pending"))
    if existing:
        return {"status": "exists", "suggestion": suggestion_out(existing)}
    a = achievement_dict(ach)
    res = await propose_cv_update(user, cv.data, a)
    if res["duplicate"]:
        return {"status": "duplicate", "reason": res["duplicate"]}
    # claim check of everything the draft adds, for monitoring
    added = " ".join(filter(None, [c.get("bullet", "") or c.get("summary", "") for c in res["applied"]]))
    if added:
        chk = check_claims(added, achievement_text(a))
        record_quality("claim_check", user_id=user.id, task="cv_update",
                       details={"claims_checked": chk["claims_checked"], "unsupported_count": chk["unsupported_count"]})
    if not res["draft"]:
        return {"status": "no_changes", "rationale": res["rationale"], "rejected": res["rejected"]}
    s = CVSuggestion(user_id=user.id, cv_id=cv.id, achievement_id=ach.id, base_version=cv.version,
                     draft_data=res["draft"], changes=res["applied"],
                     rationale=res["rationale"] + (f" (filtered {len(res['rejected'])} unsafe change(s))" if res["rejected"] else ""))
    db.add(s)
    db.commit()
    return {"status": "created", "suggestion": suggestion_out(s)}
