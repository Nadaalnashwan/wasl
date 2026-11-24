"""Supabase access-token verification with real cryptography (no network, no real project).

Tokens are signed with a throwaway EC key exposed through a stubbed JWKS client (ES256, Supabase's current
asymmetric signing keys) and with a throwaway legacy HS256 secret.
"""
from __future__ import annotations

import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.config import settings
from app.db import SessionLocal
from app.models import User
from app.security import auth as auth_mod

SB_URL = "https://example-project.supabase.co"
ISS = f"{SB_URL}/auth/v1"
HS_SECRET = "legacy-test-secret-legacy-test-secret-0001"
_EC_KEY = ec.generate_private_key(ec.SECP256R1())


class _Key:
    key = _EC_KEY.public_key()


class _FakeJWKS:
    def get_signing_key_from_jwt(self, _token):
        return _Key()


@pytest.fixture
def supabase_mode(monkeypatch):
    monkeypatch.setattr(settings, "auth_mode", "supabase")
    monkeypatch.setattr(settings, "supabase_url", SB_URL)
    monkeypatch.setattr(settings, "supabase_jwt_secret", HS_SECRET)
    monkeypatch.setattr(auth_mod, "_jwks_client", lambda: _FakeJWKS())


def _claims(sub_: str, **over) -> dict:
    now = int(time.time())
    sub = sub_
    c = {"sub": sub, "aud": "authenticated", "iss": ISS, "role": "authenticated", "iat": now, "exp": now + 3600,
         "email": f"{sub[:8]}@example.test", "user_metadata": {"full_name": "Sam Example"}}
    c.update(over)
    return c


def _es256(claims: dict) -> str:
    return jwt.encode(claims, _EC_KEY, algorithm="ES256", headers={"kid": "test-key"})


def _get(client, token: str):
    return client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})


def test_valid_token_mirrors_user_as_normal_user(client, supabase_mode):
    sub = str(uuid.uuid4())
    # user_metadata / app_metadata are attacker-influenced: claiming admin there must change nothing
    tok = _es256(_claims(sub, user_metadata={"full_name": "Sam", "role": "admin"}, app_metadata={"role": "admin"}))
    r = _get(client, tok)
    assert r.status_code == 200, r.text
    assert r.json()["id"] == sub and r.json()["role"] == "user"
    db = SessionLocal()
    try:
        assert db.get(User, sub).role == "user"
    finally:
        db.close()
    assert client.get("/api/admin/whoami", headers={"Authorization": f"Bearer {tok}"}).status_code == 403
    # session restoration: the same token on a later request resolves to the same mirrored row
    assert _get(client, tok).json()["id"] == sub


def test_legacy_hs256_token_accepted_only_with_project_secret(client, supabase_mode):
    sub = str(uuid.uuid4())
    good = jwt.encode(_claims(sub), HS_SECRET, algorithm="HS256")
    assert _get(client, good).status_code == 200
    forged = jwt.encode(_claims(str(uuid.uuid4())), "not-the-project-secret-xxxxxxxxxxxxxxxx", algorithm="HS256")
    assert _get(client, forged).status_code == 401


@pytest.mark.parametrize("over,detail", [
    ({"exp": int(time.time()) - 10}, "Session expired"),
    ({"aud": "anon"}, "Invalid token"),
    ({"iss": "https://evil.example/auth/v1"}, "Invalid token"),
    ({"sub": ""}, "Invalid token"),
])
def test_rejected_claims(client, supabase_mode, over, detail):
    r = _get(client, _es256(_claims(str(uuid.uuid4()), **over)))
    assert r.status_code == 401 and r.json()["detail"] == detail


def test_tampered_and_unsigned_tokens_rejected(client, supabase_mode):
    tok = _es256(_claims(str(uuid.uuid4())))
    head, payload, sig = tok.split(".")
    other = _es256(_claims(str(uuid.uuid4())))
    assert _get(client, f"{head}.{other.split('.')[1]}.{sig}").status_code == 401   # payload swapped
    unsigned = jwt.encode(_claims(str(uuid.uuid4())), None, algorithm="none")
    assert _get(client, unsigned).status_code == 401
    other_key = ec.generate_private_key(ec.SECP256R1())
    assert _get(client, jwt.encode(_claims(str(uuid.uuid4())), other_key, algorithm="ES256")).status_code == 401


def test_email_collision_with_existing_account_is_refused(client, supabase_mode):
    """A new identity whose token email matches an existing profile must not take that profile over."""
    first = str(uuid.uuid4())
    assert _get(client, _es256(_claims(first, email="shared@example.test"))).status_code == 200
    r = _get(client, _es256(_claims(str(uuid.uuid4()), email="shared@example.test")))
    assert r.status_code == 401 and r.json()["detail"] == "Account conflict"


def test_users_are_isolated(client, supabase_mode):
    a, b = str(uuid.uuid4()), str(uuid.uuid4())
    ha = {"Authorization": f"Bearer {_es256(_claims(a))}"}
    hb = {"Authorization": f"Bearer {_es256(_claims(b))}"}
    aid = client.post("/api/achievements?auto_cv_update=false", json={"title": "A's project", "description": "Built a tool.",
                                                                       "category": "project"}, headers=ha).json()["achievement"]["id"]
    assert all(x["id"] != aid for x in client.get("/api/achievements", headers=hb).json())
    assert client.delete(f"/api/achievements/{aid}", headers=hb).status_code == 404
    assert any(x["id"] == aid for x in client.get("/api/achievements", headers=ha).json())
