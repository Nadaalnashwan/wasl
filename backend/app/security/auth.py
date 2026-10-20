"""Authentication.

AUTH_MODE=local    -> email/password stored here (scrypt hash), backend issues HS256 JWTs.
AUTH_MODE=supabase -> frontend signs in with Supabase Auth; backend verifies the Supabase access
                      token (JWKS for asymmetric keys, or the legacy HS256 JWT secret) and mirrors
                      the user row (id = auth.users.id) so RLS policies line up with user_id.
"""
from __future__ import annotations

import hashlib
import hmac
import os
from datetime import UTC, datetime, timedelta
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import User

bearer = HTTPBearer(auto_error=False)

_SCRYPT = {"n": 2**14, "r": 8, "p": 1, "dklen": 32}


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT)
    return f"scrypt${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored or not stored.startswith("scrypt$"):
        return False
    _, salt_hex, dk_hex = stored.split("$")
    dk = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), **_SCRYPT)
    return hmac.compare_digest(dk.hex(), dk_hex)


def create_local_token(user_id: str) -> str:
    now = datetime.now(UTC)
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(minutes=settings.jwt_expire_minutes), "iss": "wasl"}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json", cache_keys=True)


def _decode_supabase(token: str) -> dict:
    header = jwt.get_unverified_header(token)
    if header.get("alg") == "HS256":
        if not settings.supabase_jwt_secret:
            raise jwt.InvalidTokenError("SUPABASE_JWT_SECRET not configured")
        return jwt.decode(token, settings.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated")
    key = _jwks_client().get_signing_key_from_jwt(token)
    return jwt.decode(token, key.key, algorithms=["ES256", "RS256"], audience="authenticated")


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not creds:
        raise _unauthorized()
    token = creds.credentials
    try:
        if settings.auth_mode == "supabase":
            claims = _decode_supabase(token)
        else:
            claims = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], issuer="wasl")
    except jwt.ExpiredSignatureError as exc:
        raise _unauthorized("Session expired") from exc
    except jwt.PyJWTError as exc:
        raise _unauthorized("Invalid token") from exc

    user_id = claims.get("sub")
    if not user_id:
        raise _unauthorized("Invalid token")
    user = db.get(User, user_id)
    if user is None and settings.auth_mode == "supabase":
        # first request from a Supabase user -> mirror profile row
        email = claims.get("email") or f"{user_id}@users.supabase"
        existing = db.scalar(select(User).where(User.email == email))
        if existing:
            raise _unauthorized("Account conflict")
        meta = claims.get("user_metadata") or {}
        user = User(id=user_id, email=email, full_name=meta.get("full_name", ""))
        db.add(user)
        db.commit()
    if user is None:
        raise _unauthorized("User not found")
    request.state.user_id = user.id  # used by monitoring middleware
    return user
