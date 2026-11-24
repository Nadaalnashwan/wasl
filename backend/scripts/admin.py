"""Administrator provisioning — the ONLY supported way to change a user's role.

Runs server-side with the backend's own DATABASE_URL (trusted operator access). The API has no endpoint
that can change roles, and on Supabase a trigger blocks role changes from client connections.

Usage (from backend/):
    python -m scripts.admin list
    python -m scripts.admin grant  <email> --reason "on-call engineer"
    python -m scripts.admin revoke <email> --reason "left the team"

Every change is written to admin_audit_log. The account must already exist (the person signs up normally
first), so no admin password is ever created or stored by this script.
"""
from __future__ import annotations

import argparse
import getpass
import sys

from sqlalchemy import select

from app.db import SessionLocal, init_db
from app.models import AdminAuditLog, User


def _operator() -> str:
    try:
        return f"cli:{getpass.getuser()}"
    except Exception:  # pragma: no cover
        return "cli"


def set_role(email: str, role: str, reason: str = "") -> int:
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email.strip().lower()))
        if user is None:
            print(f"No account with email {email!r}. Ask the person to register first.", file=sys.stderr)
            return 1
        old = user.role or "user"
        if old == role:
            print(f"{user.email} already has role {role!r}; nothing changed.")
            return 0
        user.role = role
        db.add(AdminAuditLog(actor_label=_operator(), action="role_grant" if role == "admin" else "role_revoke",
                             target_user_id=user.id, details={"from": old, "to": role, "reason": reason[:200]}))
        db.commit()
        print(f"{user.email}: {old} -> {role}")
        return 0
    finally:
        db.close()


def list_admins() -> int:
    db = SessionLocal()
    try:
        rows = db.scalars(select(User).where(User.role == "admin").order_by(User.email)).all()
        if not rows:
            print("No administrators.")
        for u in rows:
            print(f"{u.email}\t{u.id}")
        return 0
    finally:
        db.close()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m scripts.admin", description=__doc__.split("\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("grant", "revoke"):
        sp = sub.add_parser(name)
        sp.add_argument("email")
        sp.add_argument("--reason", default="")
    sub.add_parser("list")
    args = p.parse_args(argv)
    init_db()
    if args.cmd == "list":
        return list_admins()
    return set_role(args.email, "admin" if args.cmd == "grant" else "user", args.reason)


if __name__ == "__main__":
    raise SystemExit(main())
