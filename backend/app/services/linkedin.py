
"""LinkedIn OAuth 2.0 and member post publishing.

Required LinkedIn developer products:
- Sign In with LinkedIn using OpenID Connect
- Share on LinkedIn (w_member_social)

Supports:
- Text-only posts
- Single-image posts
- Multi-image posts (up to 4 images)
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
IMAGES_URL = "https://api.linkedin.com/rest/images"

API_VERSION = os.environ.get("LINKEDIN_API_VERSION", "202609")
MAX_IMAGES = 4


@dataclass
class PublishError(Exception):
    kind: str  # auth | permission | rate_limit | rejected | server | ambiguous
    message: str
    http_status: int | None = None

    def __post_init__(self):
        super().__init__(self.message)


def authorize_url(state: str) -> str:
    return AUTH_URL + "?" + urlencode({
        "response_type": "code",
        "client_id": settings.linkedin_client_id,
        "redirect_uri": settings.linkedin_redirect_uri,
        "state": state,
        "scope": settings.linkedin_scopes,
    })


async def exchange_code(code: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.linkedin_redirect_uri,
                "client_id": settings.linkedin_client_id,
                "client_secret": settings.linkedin_client_secret,
            },
        )

    if r.status_code != 200:
        raise PublishError(
            "auth",
            f"LinkedIn token exchange failed (HTTP {r.status_code})",
            r.status_code,
        )

    return r.json()


async def userinfo(token: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            USERINFO_URL,
            headers={"Authorization": f"Bearer {token}"},
        )

    if r.status_code != 200:
        raise PublishError(
            "auth",
            f"LinkedIn profile lookup failed (HTTP {r.status_code})",
            r.status_code,
        )

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


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": API_VERSION,
    }


async def upload_image(
    client: httpx.AsyncClient,
    token: str,
    person_id: str,
    image_bytes: bytes,
    content_type: str,
) -> str:
    """Upload an image to LinkedIn and return its image URN.

    The image is registered first, then uploaded to the URL
    returned by LinkedIn.
    """
    if content_type not in ("image/jpeg", "image/png"):
        raise PublishError(
            "rejected",
            "Only JPEG and PNG images are supported.",
        )

    if not image_bytes:
        raise PublishError("rejected", "The image is empty.")

    owner = f"urn:li:person:{person_id}"

    initialize_body = {
        "initializeUploadRequest": {
            "owner": owner,
        }
    }

    try:
        init_response = await client.post(
            f"{IMAGES_URL}?action=initializeUpload",
            json=initialize_body,
            headers=_headers(token),
        )
    except httpx.HTTPError as exc:
        raise PublishError(
            "server",
            "Could not initialize the LinkedIn image upload.",
        ) from exc

    if init_response.status_code not in (200, 201):
        raise PublishError(
            _classify(init_response.status_code),
            f"LinkedIn image initialization failed (HTTP {init_response.status_code}).",
            init_response.status_code,
        )

    try:
        value = init_response.json()["value"]
        upload_url = value["uploadUrl"]
        image_urn = value["image"]
    except (KeyError, TypeError, ValueError) as exc:
        raise PublishError(
            "server",
            "LinkedIn returned an invalid image upload response.",
        ) from exc

    try:
        upload_response = await client.put(
            upload_url,
            content=image_bytes,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": content_type,
            },
        )
    except httpx.HTTPError as exc:
        raise PublishError(
            "server",
            "Could not upload the image to LinkedIn.",
        ) from exc

    if upload_response.status_code not in (200, 201, 202, 204):
        raise PublishError(
            _classify(upload_response.status_code),
            f"LinkedIn image upload failed (HTTP {upload_response.status_code}).",
            upload_response.status_code,
        )

    return image_urn


async def publish(
    token: str,
    person_id: str,
    text: str,
    images: list[tuple[bytes, str]] | None = None,
) -> str:
    """Publish a LinkedIn post.

    images:
        Optional list of (image_bytes, content_type).
        Supports 1 to 4 images.

    Returns:
        LinkedIn post URN.

    Raises:
        PublishError.
    """
    images = images or []

    if len(images) > MAX_IMAGES:
        raise PublishError(
            "rejected",
            f"A LinkedIn post can contain at most {MAX_IMAGES} images.",
        )

    author = f"urn:li:person:{person_id}"

    headers = _headers(token)

    body = {
        "author": author,
        "commentary": text,
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": [],
        },
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            image_urns: list[str] = []

            for image_bytes, content_type in images:
                image_urn = await upload_image(
                    client=client,
                    token=token,
                    person_id=person_id,
                    image_bytes=image_bytes,
                    content_type=content_type,
                )
                image_urns.append(image_urn)

            if len(image_urns) == 1:
                body["content"] = {
                    "media": {
                        "id": image_urns[0],
                    }
                }

            elif len(image_urns) > 1:
                body["content"] = {
                    "multiImage": {
                        "images": [
                            {
                                "id": urn,
                                "altText": f"Post image {index + 1}",
                            }
                            for index, urn in enumerate(image_urns)
                        ]
                    }
                }

            r = await client.post(
                POSTS_URL,
                json=body,
                headers=headers,
            )

            # Preserve the existing fallback for text-only posts.
            # Image posts must not fall back to a text-only request.
            if (
                not image_urns
                and r.status_code in (400, 426)
                and "version" in r.text.lower()
            ):
                ugc = {
                    "author": author,
                    "lifecycleState": "PUBLISHED",
                    "specificContent": {
                        "com.linkedin.ugc.ShareContent": {
                            "shareCommentary": {"text": text},
                            "shareMediaCategory": "NONE",
                        }
                    },
                    "visibility": {
                        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
                    },
                }

                r = await client.post(
                    UGC_URL,
                    json=ugc,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Restli-Protocol-Version": "2.0.0",
                    },
                )

    except httpx.TimeoutException as exc:
        raise PublishError(
            "ambiguous",
            "LinkedIn did not answer in time. "
            "The post MAY have been published — "
            "check your profile before retrying.",
        ) from exc

    except httpx.HTTPError as exc:
        raise PublishError(
            "server",
            f"Could not reach LinkedIn ({type(exc).__name__}).",
        ) from exc

    if r.status_code not in (200, 201):
        raise PublishError(
            _classify(r.status_code),
            f"LinkedIn rejected the post (HTTP {r.status_code}).",
            r.status_code,
        )

    urn = (
        r.headers.get("x-restli-id")
        or r.headers.get("X-RestLi-Id")
        or (r.json().get("id") if r.content else None)
    )

    if not urn:
        raise PublishError(
            "ambiguous",
            "LinkedIn accepted the request but returned no post id. "
            "Check your profile.",
        )

    return urn
