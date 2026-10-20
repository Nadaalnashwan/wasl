"""Symmetric encryption for secrets at rest (user BYOK keys, OAuth tokens) using Fernet (AES-128-CBC + HMAC)."""
from __future__ import annotations

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

log = logging.getLogger("wasl.crypto")


def _fernet() -> Fernet:
    key = settings.encryption_key
    if not key:
        if settings.app_env == "production":
            raise RuntimeError("ENCRYPTION_KEY must be set in production")
        # Development fallback: derive a stable key from JWT_SECRET so local data stays readable.
        log.warning("ENCRYPTION_KEY not set; deriving a development key. Set ENCRYPTION_KEY for real use.")
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.jwt_secret.encode()).digest()).decode()
    return Fernet(key.encode())


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:  # key rotated or data corrupted
        raise ValueError("Stored secret could not be decrypted") from exc


def hint(secret: str) -> str:
    """Non-reversible display hint: last 4 characters only."""
    return "…" + secret[-4:] if len(secret) >= 8 else "…"
