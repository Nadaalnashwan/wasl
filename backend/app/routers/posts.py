
from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.ai.claims import check_claims
from app.ai.workflows.content import (
    evidence_text,
    generate_post,
    improve_post,
)
from app.deps import (
    achievement_dict,
    get_current_user,
    get_db,
    owned,
    track_task,
)
from app.models import Achievement, Integration, Post, User
from app.monitoring.recorder import record_quality
from app.security.crypto import decrypt
from app.services import linkedin


router = APIRouter(prefix="/api/posts", tags=["posts"])

Tone = Literal[
    "professional",
    "inspiring",
    "storytelling",
    "concise",
    "humble",
    "technical",
]

MAX_IMAGES = 4
MAX_IMAGE_BYTES = 5 * 1024 * 1024

# Private server-side storage.
# Set WASL_POST_IMAGE_DIR to a persistent directory in production.
IMAGE_DIR = Path(
    os.environ.get(
        "WASL_POST_IMAGE_DIR",
        str(Path.home() / ".wasl" / "post-images"),
    )
).expanduser().resolve()


class GenerateIn(BaseModel):
    achievement_id: str | None = None
    text: str | None = Field(
        default=None,
        max_length=4000,
        description="Ad-hoc description when no saved achievement",
    )
    tone: Tone = "professional"
    language: Literal["en", "ar"] = "en"
    instructions: str = Field(default="", max_length=500)


class ImproveIn(BaseModel):
    content: str = Field(min_length=20, max_length=3000)
    tone: Tone = "professional"
    language: Literal["en", "ar"] = "en"
    save_as_post_id: str | None = None


class PostPatch(BaseModel):
    content: str | None = Field(
        default=None,
        min_length=1,
        max_length=3000,
    )
    hashtags: list[str] | None = Field(
        default=None,
        max_length=8,
    )
    tone: Tone | None = None


class PublishIn(BaseModel):
    confirm: bool = False
    confirm_not_published: bool = False


def post_out(p: Post) -> dict:
    return {
        "id": p.id,
        "achievement_id": p.achievement_id,
        "content": p.content,
        "tone": p.tone,
        "language": p.language,
        "hashtags": p.hashtags or [],
        "images": [
            {
                "id": img["id"],
                "filename": img["filename"],
                "mime": img["mime"],
                "size_bytes": img["size_bytes"],
                "url": (
                    f"/api/posts/{p.id}/images/{img['id']}"
                ),
            }
            for img in (p.images or [])
        ],
        "status": p.status,
        "linkedin_post_urn": p.linkedin_post_urn,
        "publish_error": p.publish_error,
        "published_at": (
            p.published_at.isoformat()
            if p.published_at
            else None
        ),
        "claim_check": p.claim_check or {},
        "created_at": p.created_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
    }


def ensure_editable(p: Post):
    if p.status in ("published", "publishing", "uncertain"):
        raise HTTPException(
            409,
            "This post cannot be edited in its current state.",
        )


def image_path(post_id: str, image_id: str) -> Path:
    # Never use an uploaded filename to build a filesystem path.
    try:
        post_uuid = str(uuid.UUID(post_id))
        image_uuid = str(uuid.UUID(image_id))
    except ValueError:
        raise HTTPException(404, "Image not found.")

    return IMAGE_DIR / post_uuid / image_uuid


def detect_image_mime(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff") and data.endswith(b"\xff\xd9"):
        return "image/jpeg"

    png_signature = b"\x89PNG\r\n\x1a\n"

    if data.startswith(png_signature) and b"IEND" in data[-32:]:
        return "image/png"

    return None


def remove_image_files(p: Post):
    for img in p.images or []:
        try:
            image_path(p.id, img["id"]).unlink(
                missing_ok=True
            )
        except (OSError, KeyError, ValueError):
            pass

    try:
        (IMAGE_DIR / str(uuid.UUID(p.id))).rmdir()
    except (OSError, ValueError):
        pass


@router.get("")
def list_posts(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    posts = db.scalars(
        select(Post)
        .where(Post.user_id == user.id)
        .order_by(Post.updated_at.desc())
    )

    return [post_out(p) for p in posts]


@router.post("/generate", status_code=201)
async def generate(
    body: GenerateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.achievement_id:
        a = owned(
            db,
            Achievement,
            body.achievement_id,
            user,
        )

        if a.status == "rejected":
            raise HTTPException(
                409,
                "This achievement was rejected.",
            )

        ach = achievement_dict(a)

    elif body.text and len(body.text.strip()) >= 20:
        ach = {
            "title": "",
            "description": body.text.strip(),
        }

    else:
        raise HTTPException(
            422,
            "Describe your achievement in at least 20 characters.",
        )

    with track_task("post_generation", user):
        state = await generate_post(
            user,
            ach,
            body.tone,
            body.language,
            body.instructions,
        )

    claims = state["claims"]

    record_quality(
        "claim_check",
        user_id=user.id,
        task="post_generation",
        details={
            "claims_checked": claims["claims_checked"],
            "unsupported_count": claims["unsupported_count"],
            "revisions": state.get("revisions", 0),
        },
    )

    gp = state["post"]

    p = Post(
        user_id=user.id,
        achievement_id=body.achievement_id,
        content=gp.content,
        tone=body.tone,
        language=body.language,
        hashtags=gp.hashtags,
        images=[],
        status="draft",
        claim_check={
            **claims,
            "revisions": state.get("revisions", 0),
            "provider": state.get("provider"),
            "model": state.get("model"),
            "fallback_used": state.get(
                "fallback_used",
                False,
            ),
        },
    )

    db.add(p)
    db.commit()

    return post_out(p)


@router.post("/improve")
async def improve(
    body: ImproveIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    with track_task("post_improve", user):
        gp, claims, provider = await improve_post(
            user,
            body.content,
            body.tone,
            body.language,
        )

    record_quality(
        "claim_check",
        user_id=user.id,
        task="post_improve",
        details={
            "claims_checked": claims["claims_checked"],
            "unsupported_count": claims["unsupported_count"],
        },
    )

    return {
        "content": gp.content,
        "hashtags": gp.hashtags,
        "claim_check": claims,
        "provider": provider,
    }


@router.patch("/{post_id}")
def edit(
    post_id: str,
    body: PostPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = owned(db, Post, post_id, user)
    ensure_editable(p)

    data = body.model_dump(exclude_none=True)

    for key, value in data.items():
        setattr(p, key, value)

    if "content" in data and p.achievement_id:
        a = db.get(Achievement, p.achievement_id)

        if a:
            p.claim_check = {
                **check_claims(
                    p.content,
                    evidence_text(achievement_dict(a)),
                ),
                "edited_by_user": True,
            }

    db.commit()
    return post_out(p)


# -------------------------------------------------------
# IMAGE UPLOAD
# -------------------------------------------------------

@router.post("/{post_id}/images")
async def upload_post_images(
    post_id: str,
    files: list[UploadFile] = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = owned(db, Post, post_id, user)
    ensure_editable(p)

    existing = list(p.images or [])

    if not files:
        raise HTTPException(422, "Select at least one image.")

    if len(existing) + len(files) > MAX_IMAGES:
        raise HTTPException(
            422,
            "You can attach a maximum of 4 images.",
        )

    validated = []

    for file in files:
        try:
            data = await file.read(MAX_IMAGE_BYTES + 1)
        finally:
            await file.close()

        if not data:
            raise HTTPException(
                422,
                "An uploaded image is empty.",
            )

        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(
                413,
                "Each image must be 5 MB or smaller.",
            )

        mime = detect_image_mime(data)

        if mime is None:
            raise HTTPException(
                422,
                "Only valid JPG and PNG images are supported.",
            )

        if file.content_type not in (
            "image/jpeg",
            "image/png",
        ):
            raise HTTPException(
                422,
                "Invalid image content type.",
            )

        if file.content_type != mime:
            raise HTTPException(
                422,
                "Image type does not match its content.",
            )

        validated.append({
            "filename": (
                Path(file.filename or "image").name[:200]
            ),
            "mime": mime,
            "size_bytes": len(data),
            "data": data,
        })

    directory = IMAGE_DIR / str(uuid.UUID(p.id))
    created_paths = []
    new_images = []

    try:
        directory.mkdir(
            parents=True,
            exist_ok=True,
            mode=0o700,
        )

        for item in validated:
            image_id = str(uuid.uuid4())
            path = image_path(p.id, image_id)

            with path.open("xb") as f:
                f.write(item["data"])

            created_paths.append(path)

            new_images.append({
                "id": image_id,
                "filename": item["filename"],
                "mime": item["mime"],
                "size_bytes": item["size_bytes"],
            })

        p.images = existing + new_images
        db.commit()

    except Exception:
        db.rollback()

        for path in created_paths:
            path.unlink(missing_ok=True)

        raise

    return post_out(p)


# -------------------------------------------------------
# PRIVATE IMAGE PREVIEW
# -------------------------------------------------------

@router.get("/{post_id}/images/{image_id}")
def get_post_image(
    post_id: str,
    image_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = owned(db, Post, post_id, user)

    image = next(
        (
            img
            for img in (p.images or [])
            if img.get("id") == image_id
        ),
        None,
    )

    if image is None:
        raise HTTPException(404, "Image not found.")

    path = image_path(p.id, image_id)

    if not path.is_file():
        raise HTTPException(
            404,
            "Image file is missing.",
        )

    return FileResponse(
        path,
        media_type=image["mime"],
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


# -------------------------------------------------------
# REMOVE IMAGE
# -------------------------------------------------------

@router.delete(
    "/{post_id}/images/{image_id}",
    status_code=204,
)
def delete_post_image(
    post_id: str,
    image_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = owned(db, Post, post_id, user)
    ensure_editable(p)

    images = list(p.images or [])

    if not any(
        img.get("id") == image_id
        for img in images
    ):
        raise HTTPException(404, "Image not found.")

    p.images = [
        img
        for img in images
        if img.get("id") != image_id
    ]

    db.commit()

    image_path(p.id, image_id).unlink(
        missing_ok=True
    )


# -------------------------------------------------------
# DELETE POST
# -------------------------------------------------------

@router.delete("/{post_id}", status_code=204)
def delete(
    post_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = owned(db, Post, post_id, user)

    if p.status == "publishing":
        raise HTTPException(
            409,
            "Post is being published.",
        )

    if p.status == "uncertain":
        raise HTTPException(
            409,
            "Check LinkedIn before deleting a post with an uncertain publishing result.",
        )

    remove_image_files(p)

    db.delete(p)
    db.commit()


# -------------------------------------------------------
# PUBLISH TO LINKEDIN
# -------------------------------------------------------

@router.post("/{post_id}/publish")
async def publish(
    post_id: str,
    body: PublishIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = owned(db, Post, post_id, user)

    if not body.confirm:
        raise HTTPException(
            400,
            "Publishing requires explicit confirmation.",
        )

    if p.status == "published":
        raise HTTPException(
            409,
            "Already published.",
        )

    if (
        p.status == "uncertain"
        and not body.confirm_not_published
    ):
        raise HTTPException(
            409,
            "The last attempt may have succeeded. "
            "Check LinkedIn before retrying.",
        )

    integ = db.scalar(
        select(Integration).where(
            Integration.user_id == user.id,
            Integration.provider == "linkedin",
        )
    )

    if integ is None or integ.status != "connected":
        raise HTTPException(
            412,
            "LinkedIn is not connected. "
            "Connect it in Settings to publish.",
        )

    if (
        integ.expires_at
        and integ.expires_at.replace(
            tzinfo=integ.expires_at.tzinfo or UTC
        ) < datetime.now(UTC)
    ):
        integ.status = "expired"
        db.commit()

        raise HTTPException(
            412,
            "Your LinkedIn connection expired. "
            "Reconnect it in Settings.",
        )

    # Validate images before locking the post.
    images_data: list[tuple[bytes, str]] = []

    for img in p.images or []:
        path = image_path(p.id, img["id"])

        if not path.is_file():
            raise HTTPException(
                409,
                "One of the attached images is missing. "
                "Remove it and upload it again.",
            )

        if path.stat().st_size > MAX_IMAGE_BYTES:
            raise HTTPException(
                413,
                "An attached image exceeds the size limit.",
            )

        data = path.read_bytes()
        mime = detect_image_mime(data)

        if mime != img["mime"]:
            raise HTTPException(
                409,
                "An attached image is invalid.",
            )

        images_data.append((data, mime))

    if len(images_data) > MAX_IMAGES:
        raise HTTPException(
            422,
            "Maximum 4 images are allowed.",
        )

    # Atomic lock prevents duplicate publishing.
    res = db.execute(
        update(Post)
        .where(
            Post.id == p.id,
            Post.user_id == user.id,
            Post.status.in_(
                ["draft", "failed", "uncertain"]
            ),
        )
        .values(
            status="publishing",
            publish_attempts=Post.publish_attempts + 1,
        )
    )

    db.commit()

    if res.rowcount != 1:
        raise HTTPException(
            409,
            "This post is already being published.",
        )

    text = p.content + (
        "\n\n" + " ".join(p.hashtags)
        if p.hashtags
        else ""
    )

    try:
        urn = await linkedin.publish(
            decrypt(integ.access_token_enc),
            integ.account_id,
            text,
            images=images_data,
        )

    except linkedin.PublishError as err:
        p.status = (
            "uncertain"
            if err.kind == "ambiguous"
            else "failed"
        )

        p.publish_error = err.message

        if err.kind == "auth":
            integ.status = "expired"

        db.commit()

        record_quality(
            "publish_result",
            user_id=user.id,
            task="linkedin",
            outcome=err.kind,
        )

        raise HTTPException(
            502,
            {
                "message": err.message,
                "kind": err.kind,
                "post": post_out(p),
            },
        ) from err

    except Exception:
        # Unexpected failure after the publishing request began:
        # don't automatically retry because the outcome is unknown.
        p.status = "uncertain"
        p.publish_error = (
            "Publishing outcome is unknown. "
            "Check LinkedIn before retrying."
        )
        db.commit()
        raise

    p.status = "published"
    p.linkedin_post_urn = urn
    p.publish_error = None
    p.published_at = datetime.now(UTC)

    db.commit()

    record_quality(
        "publish_result",
        user_id=user.id,
        task="linkedin",
        outcome="success",
    )

    return post_out(p)
