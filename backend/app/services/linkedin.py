"""LinkedIn: OAuth 2.0 (Sign In with LinkedIn using OpenID Connect) + member post publishing.

Required LinkedIn developer products for the app: "Sign In with LinkedIn using OpenID Connect" and
"Share on LinkedIn" (grants w_member_social). Docs:
  https://learn.microsoft.com/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
  https://learn.microsoft.com/linkedin/consumer/integrations/self-serve/share-on-linkedin
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.config import settings

AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
UGC_URL = "https://api.linkedin.com/v2/ugcPosts"
POSTS_URL = "https://api.linkedin.com/rest/posts"
API_VERSION = os.environ.get("LINKEDIN_API_VERSION", "202509")


@dataclass
class PublishError(Exception):
    kind: str  # auth | permission | rate_limit | rejected | server | ambiguous
    message: str
    http_status: int | None = None

    def __post_init__(self):
        super().__init__(self.message)


def authorize_url(state: str) -> str:
    return AUTH_URL + "?" + urlencode({
        "response_type": "code", "client_id": settings.linkedin_client_id, "redirect_uri": settings.linkedin_redirect_uri,
        "state": state, "scope": settings.linkedin_scopes,
    })


async def exchange_code(code: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(TOKEN_URL, data={
            "grant_type": "authorization_code", "code": code, "redirect_uri": settings.linkedin_redirect_uri,
            "client_id": settings.linkedin_client_id, "client_secret": settings.linkedin_client_secret,
        })
    if r.status_code != 200:
        raise PublishError("auth", f"LinkedIn token exchange failed (HTTP {r.status_code})", r.status_code)
    return r.json()


async def userinfo(token: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(USERINFO_URL, headers={"Authorization": f"Bearer {token}"})
    if r.status_code != 200:
        raise PublishError("auth", f"LinkedIn profile lookup failed (HTTP {r.status_code})", r.status_code)
    return r.json()


def _classify(status: int) -> str:
    if status == 401:
        return "auth"
    if status == 403:
        return "permission"
    if status == 429:
        return "rate_limit"
    if status >= 500:
        return "server"
    return "rejected"


async def publish(token: str, person_id: str, text: str) -> str:
    """Publish a text post as the member. Returns the post URN. Raises PublishError.

    Uses the versioned Posts API; if the configured version is not accepted (HTTP 426/400 version error)
    falls back to the UGC Posts API, which accepts the same w_member_social permission.
    """
    author = f"urn:li:person:{person_id}"
    headers = {"Authorization": f"Bearer {token}", "X-Restli-Protocol-Version": "2.0.0", "LinkedIn-Version": API_VERSION}
    body = {
        "author": author, "commentary": text, "visibility": "PUBLIC",
        "distribution": {"feedDistribution": "MAIN_FEED", "targetEntities": [], "thirdPartyDistributionChannels": []},
        "lifecycleState": "PUBLISHED", "isReshareDisabledByAuthor": False,
    }
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(POSTS_URL, json=body, headers=headers)
            if r.status_code in (400, 426) and "version" in r.text.lower():
                ugc = {
                    "author": author, "lifecycleState": "PUBLISHED",
                    "specificContent": {"com.linkedin.ugc.ShareContent": {"shareCommentary": {"text": text}, "shareMediaCategory": "NONE"}},
                    "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
                }
                r = await c.post(UGC_URL, json=ugc, headers={"Authorization": f"Bearer {token}", "X-Restli-Protocol-Version": "2.0.0"})
    except httpx.TimeoutException as exc:
        # The request may have reached LinkedIn. Never auto-retry: the user must check first.
        raise PublishError("ambiguous", "LinkedIn did not answer in time. The post MAY have been published — check your profile before retrying.") from exc
    except httpx.HTTPError as exc:
        raise PublishError("server", f"Could not reach LinkedIn ({type(exc).__name__}).") from exc
    if r.status_code not in (200, 201):
        raise PublishError(_classify(r.status_code), f"LinkedIn rejected the post (HTTP {r.status_code}).", r.status_code)
    urn = r.headers.get("x-restli-id") or r.headers.get("X-RestLi-Id") or (r.json().get("id") if r.content else None)
    if not urn:
        raise PublishError("ambiguous", "LinkedIn accepted the request but returned no post id. Check your profile.")
    return urn
