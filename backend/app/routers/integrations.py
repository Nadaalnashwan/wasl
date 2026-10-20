"""OAuth connections for LinkedIn and GitHub.

Flow: frontend calls GET /{provider}/authorize (authenticated) -> receives the provider URL with a one-time
random `state` bound to the user -> provider redirects the browser to /{provider}/callback -> state is
consumed (CSRF protection, 10 minute expiry) -> token exchanged server-side and stored encrypted ->
browser redirected back to the frontend Settings page with a status flag. Tokens never reach the browser.
"""
from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.deps import get_current_user, get_db
from app.models import Integration, OAuthState, User
from app.monitoring.recorder import record_error
from app.security.crypto import encrypt
from app.services import github, linkedin

router = APIRouter(prefix="/api/integrations", tags=["integrations"])
PROVIDERS = ("linkedin", "github")


def _configured(provider: str) -> bool:
    return settings.linkedin_configured if provider == "linkedin" else settings.github_configured


@router.get("")
def status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = {i.provider: i for i in db.scalars(select(Integration).where(Integration.user_id == user.id))}
    out = {}
    for p in PROVIDERS:
        i = rows.get(p)
        out[p] = {
            "configured_on_server": _configured(p),
            "connected": bool(i and i.status == "connected"),
            "status": i.status if i else "disconnected",
            "account_name": i.account_name if i else None,
            "scopes": i.scopes if i else None,
            "connected_at": i.created_at.isoformat() if i else None,
            "expires_at": i.expires_at.isoformat() if i and i.expires_at else None,
        }
    return out


@router.get("/{provider}/authorize")
def authorize(provider: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if provider not in PROVIDERS:
        raise HTTPException(404, "Unknown provider")
    if not _configured(provider):
        raise HTTPException(503, f"{provider.title()} is not configured on this server. See docs/SETUP.md.")
    state = secrets.token_urlsafe(32)
    db.add(OAuthState(state=state, user_id=user.id, provider=provider))
    db.commit()
    url = linkedin.authorize_url(state) if provider == "linkedin" else github.authorize_url(state)
    return {"url": url}


def _back(provider: str, result: str) -> RedirectResponse:
    return RedirectResponse(f"{settings.frontend_url}/settings?integration={provider}&result={result}", status_code=302)


@router.get("/{provider}/callback")
async def callback(provider: str, state: str = "", code: str = "", error: str = "", db: Session = Depends(get_db)):
    if provider not in PROVIDERS:
        raise HTTPException(404, "Unknown provider")
    st = db.get(OAuthState, state) if state else None
    if st is None or st.provider != provider:
        return _back(provider, "invalid_state")
    created = st.created_at if st.created_at.tzinfo else st.created_at.replace(tzinfo=UTC)
    user_id = st.user_id
    db.delete(st)  # one-time use
    db.commit()
    if datetime.now(UTC) - created > timedelta(minutes=10):
        return _back(provider, "expired_state")
    if error or not code:
        return _back(provider, "denied")
    try:
        if provider == "linkedin":
            tok = await linkedin.exchange_code(code)
            info = await linkedin.userinfo(tok["access_token"])
            account_id, account_name = info["sub"], info.get("name") or info.get("email", "")
            expires = datetime.now(UTC) + timedelta(seconds=int(tok.get("expires_in", 0))) if tok.get("expires_in") else None
            scopes = tok.get("scope", settings.linkedin_scopes)
        else:
            tok = await github.exchange_code(code)
            info = await github.me(tok["access_token"])
            account_id, account_name = str(info["id"]), info["login"]
            expires, scopes = None, tok.get("scope", "")
    except Exception as exc:  # noqa: BLE001 - surface as a redirect, log the scrubbed error
        record_error(f"/api/integrations/{provider}/callback", exc, user_id)
        return _back(provider, "error")

    integ = db.scalar(select(Integration).where(Integration.user_id == user_id, Integration.provider == provider))
    if integ is None:
        integ = Integration(user_id=user_id, provider=provider, access_token_enc="")
        db.add(integ)
    integ.access_token_enc = encrypt(tok["access_token"])
    integ.account_id, integ.account_name, integ.expires_at, integ.scopes = account_id, account_name, expires, scopes
    integ.status = "connected"
    integ.last_verified_at = datetime.now(UTC)
    db.commit()
    return _back(provider, "connected")


@router.delete("/{provider}", status_code=204)
def disconnect(provider: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    integ = db.scalar(select(Integration).where(Integration.user_id == user.id, Integration.provider == provider))
    if integ:
        db.delete(integ)
        db.commit()
