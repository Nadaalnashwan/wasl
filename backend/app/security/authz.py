"""Server-side authorization.

* Authentication (who you are) lives in app/security/auth.py.
* Authorization (what you may do) is enforced HERE, in backend code, because the backend's direct database
  connection can bypass Supabase RLS. Never rely on the frontend, a JWT claim, a query parameter or an email
  allow-list for privileged access: the role is read from the users table on every request, so revoking an
  admin takes effect on their next request.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status

from app.db import SessionLocal
from app.models import AdminAuditLog, User
from app.security.auth import get_current_user

ROLES = ("user", "admin")


def is_admin(user: User | None) -> bool:
    return bool(user is not None and user.role == "admin")


def audit(action: str, *, actor: User | None = None, actor_label: str = "", target_user_id: str | None = None,
          details: dict | None = None) -> None:
    """Append to the admin audit log on its own session (never breaks the request)."""
    db = SessionLocal()
    try:
        db.add(AdminAuditLog(actor_user_id=actor.id if actor else None, actor_label=actor_label or (actor.email if actor else ""),
                             action=action, target_user_id=target_user_id, details=details or {}))
        db.commit()
    except Exception:  # pragma: no cover - audit write failure must not leak details to the client
        db.rollback()
    finally:
        db.close()


def require_admin(request: Request, user: User = Depends(get_current_user)) -> User:
    """401 if unauthenticated (raised by get_current_user), 403 if authenticated without the admin role."""
    if not is_admin(user):
        audit("admin_denied", actor=user, details={"route": request.url.path})
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator access required.")
    # one audit row per admin API call: route template only, never query values or payloads
    route = getattr(request.scope.get("route"), "path", request.url.path)
    audit("admin_access", actor=user, details={"route": route, "method": request.method})
    return user
