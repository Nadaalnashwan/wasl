
"""Combine pending CV drafts and new achievements without changing the Master CV."""
from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.claims import check_claims
from app.ai.workflows.career import achievement_text, propose_cv_update
from app.deps import achievement_dict, master_cv
from app.models import Achievement, CVSuggestion, User
from app.monitoring.recorder import record_quality


def suggestion_out(s: CVSuggestion) -> dict:
    return {
        "id": s.id,
        "cv_id": s.cv_id,
        "achievement_id": s.achievement_id,
        "base_version": s.base_version,
        "draft_data": s.draft_data,
        "changes": s.changes,
        "rationale": s.rationale,
        "status": s.status,
        "created_at": s.created_at.isoformat(),
        "resolved_at": (
            s.resolved_at.isoformat() if s.resolved_at else None
        ),
    }


def _merge_value(base, current, incoming, path="CV"):
    """
    Merge two drafts relative to the same Master CV version.
    Preserve additions from both drafts; reject conflicting edits.
    """
    if incoming == base:
        return deepcopy(current)

    if current == base:
        return deepcopy(incoming)

    if current == incoming:
        return deepcopy(current)

    if isinstance(current, dict) and isinstance(incoming, dict):
        original = base if isinstance(base, dict) else {}
        result = deepcopy(current)

        for key, value in incoming.items():
            if key not in result:
                result[key] = deepcopy(value)
            else:
                result[key] = _merge_value(
                    original.get(key),
                    result[key],
                    value,
                    f"{path}.{key}",
                )
        return result

    if isinstance(current, list) and isinstance(incoming, list):
        original = base if isinstance(base, list) else []

        # CV sections containing items with stable IDs.
        if all(
            isinstance(item, dict) and item.get("id")
            for item in current + incoming
        ):
            original_by_id = {
                item["id"]: item
                for item in original
                if isinstance(item, dict) and item.get("id")
            }

            result = deepcopy(current)
            positions = {
                item["id"]: index
                for index, item in enumerate(result)
            }

            for item in incoming:
                item_id = item["id"]

                if item_id not in positions:
                    positions[item_id] = len(result)
                    result.append(deepcopy(item))
                else:
                    index = positions[item_id]
                    result[index] = _merge_value(
                        original_by_id.get(item_id),
                        result[index],
                        item,
                        f"{path}.{item_id}",
                    )

            return result

        # Skills, languages, bullets, and other simple lists.
        if all(
            not isinstance(item, (dict, list))
            for item in current + incoming
        ):
            result = deepcopy(current)
            for item in incoming:
                if item not in result:
                    result.append(deepcopy(item))
            return result

    raise ValueError(
        f"Conflicting pending CV changes at {path}. "
        "Review the drafts before merging."
    )


def _achievement_ids(suggestion: CVSuggestion) -> set[str]:
    ids = set()

    if suggestion.achievement_id:
        ids.add(suggestion.achievement_id)

    for change in suggestion.changes or []:
        if isinstance(change, dict) and change.get("achievement_id"):
            ids.add(change["achievement_id"])

    return ids


async def suggest_for_achievement(
    db: Session,
    user: User,
    ach: Achievement,
) -> dict:
    cv = master_cv(db, user)

    if cv is None:
        return {"status": "no_cv"}

    pending = db.scalars(
        select(CVSuggestion)
        .where(
            CVSuggestion.user_id == user.id,
            CVSuggestion.cv_id == cv.id,
            CVSuggestion.status == "pending",
        )
        .order_by(
            CVSuggestion.created_at.asc(),
            CVSuggestion.id.asc(),
        )
    ).all()

    # Never merge drafts created from different Master CV versions.
    if any(s.base_version != cv.version for s in pending):
        return {
            "status": "stale",
            "reason": (
                "A pending draft was created from an older Master CV "
                "version. Review it before merging."
            ),
        }

    # Avoid processing the same achievement twice.
    for suggestion in pending:
        if ach.id in _achievement_ids(suggestion):
            return {
                "status": "exists",
                "suggestion": suggestion_out(suggestion),
            }

    # Reconcile all pending drafts against the same Master CV.
    combined = deepcopy(cv.data)
    all_changes = []
    rationales = []

    try:
        for suggestion in pending:
            combined = _merge_value(
                cv.data,
                combined,
                suggestion.draft_data,
            )

            all_changes.extend(deepcopy(suggestion.changes or []))

            if suggestion.rationale:
                rationales.append(suggestion.rationale)

    except ValueError as exc:
        return {
            "status": "conflict",
            "reason": str(exc),
        }

    # Add the new confirmed achievement to the combined draft.
    achievement = achievement_dict(ach)

    result = await propose_cv_update(
        user,
        combined,
        achievement,
    )

    if result["duplicate"]:
        return {
            "status": "duplicate",
            "reason": result["duplicate"],
        }

    if not result["draft"]:
        return {
            "status": "no_changes",
            "rationale": result["rationale"],
            "rejected": result["rejected"],
        }

    new_changes = []

    for change in result["applied"]:
        if isinstance(change, dict):
            new_changes.append({
                **change,
                "achievement_id": ach.id,
            })

    added = " ".join(
        change.get("bullet", "") or change.get("summary", "")
        for change in new_changes
    )

    if added:
        check = check_claims(
            added,
            achievement_text(achievement),
        )

        record_quality(
            "claim_check",
            user_id=user.id,
            task="cv_update",
            details={
                "claims_checked": check["claims_checked"],
                "unsupported_count": check["unsupported_count"],
            },
        )

    all_changes.extend(new_changes)

    rationale = result["rationale"]

    if result["rejected"]:
        rationale += (
            f" (filtered {len(result['rejected'])} "
            "unsafe change(s))"
        )

    if rationale:
        rationales.append(rationale)

    # Keep the oldest pending suggestion as the unified draft.
    if pending:
        target = pending[0]

        target.draft_data = result["draft"]
        target.changes = all_changes
        target.rationale = "\n\n".join(rationales)

        # Other pending drafts are superseded, not deleted.
        for old in pending[1:]:
            old.status = "stale"
            old.resolved_at = datetime.now(UTC)

        db.commit()
        db.refresh(target)

        return {
            "status": "created",
            "suggestion": suggestion_out(target),
        }

    suggestion = CVSuggestion(
        user_id=user.id,
        cv_id=cv.id,
        achievement_id=ach.id,
        base_version=cv.version,
        draft_data=result["draft"],
        changes=new_changes,
        rationale="\n\n".join(rationales),
    )

    db.add(suggestion)
    db.commit()
    db.refresh(suggestion)

    return {
        "status": "created",
        "suggestion": suggestion_out(suggestion),
    }
