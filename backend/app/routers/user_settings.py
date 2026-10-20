"""AI preferences + Bring Your Own Key. Keys are validated with the provider, encrypted at rest, and never returned."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.providers import registry
from app.deps import get_current_user, get_db
from app.models import User, UserApiKey
from app.security.crypto import decrypt, encrypt, hint

router = APIRouter(prefix="/api/settings", tags=["settings"])


class PrefsIn(BaseModel):
    ai_mode: Literal["platform", "personal", "personal_first"]
    allow_platform_fallback: bool = True
    allow_cross_provider: bool = True


class KeyIn(BaseModel):
    api_key: str = Field(min_length=10, max_length=300)


def _key_out(k: UserApiKey) -> dict:
    return {"provider": k.provider, "hint": k.key_hint, "status": k.status,
            "validated_at": k.validated_at.isoformat() if k.validated_at else None, "created_at": k.created_at.isoformat()}


@router.get("/ai")
def get_ai(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    keys = db.scalars(select(UserApiKey).where(UserApiKey.user_id == user.id)).all()
    return {
        "ai_mode": user.ai_mode, "allow_platform_fallback": user.allow_platform_fallback,
        "allow_cross_provider": user.allow_cross_provider,
        "platform_providers": [p for p in registry.platform_providers() if p != "fake"],  # names only, never keys
        "byok_providers": registry.BYOK_PROVIDERS,
        "keys": [_key_out(k) for k in keys],
    }


@router.put("/ai")
def put_ai(body: PrefsIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.ai_mode = body.ai_mode
    user.allow_platform_fallback = body.allow_platform_fallback
    user.allow_cross_provider = body.allow_cross_provider
    db.commit()
    return get_ai(user, db)


async def _validate(provider: str, key: str) -> bool:
    return await registry.build(provider, key).validate_key()


@router.put("/keys/{provider}")
async def put_key(provider: str, body: KeyIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if provider not in registry.BYOK_PROVIDERS and not (provider == "fake" and "fake" in registry.PROVIDER_CLASSES):
        raise HTTPException(400, "Unsupported provider")
    key = body.api_key.strip()
    valid = await _validate(provider, key)
    if not valid:
        raise HTTPException(422, f"{provider.title()} rejected this key. Nothing was saved.")
    row = db.scalar(select(UserApiKey).where(UserApiKey.user_id == user.id, UserApiKey.provider == provider))
    if row is None:
        row = UserApiKey(user_id=user.id, provider=provider, key_enc="", key_hint="")
        db.add(row)
    row.key_enc, row.key_hint, row.status, row.validated_at = encrypt(key), hint(key), "valid", datetime.now(UTC)
    db.commit()
    return _key_out(row)


@router.post("/keys/{provider}/validate")
async def revalidate(provider: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.scalar(select(UserApiKey).where(UserApiKey.user_id == user.id, UserApiKey.provider == provider))
    if row is None:
        raise HTTPException(404, "No key saved for this provider")
    row.status = "valid" if await _validate(provider, decrypt(row.key_enc)) else "invalid"
    row.validated_at = datetime.now(UTC)
    db.commit()
    return _key_out(row)


@router.delete("/keys/{provider}", status_code=204)
def delete_key(provider: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.scalar(select(UserApiKey).where(UserApiKey.user_id == user.id, UserApiKey.provider == provider))
    if row:
        db.delete(row)
        db.commit()
