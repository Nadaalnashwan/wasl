
"""Database models. Every user-owned table carries user_id and every query filters by it.

On Supabase the same tables are created by supabase/migrations/0001_init.sql, which also
enables Row Level Security (user_id = auth.uid()).
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str] = mapped_column(String(200), default="")
    headline: Mapped[str] = mapped_column(String(300), default="")
    locale: Mapped[str] = mapped_column(String(5), default="en")
    # AI preferences (BYOK)
    ai_mode: Mapped[str] = mapped_column(String(20), default="platform")
    allow_platform_fallback: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_cross_provider: Mapped[bool] = mapped_column(Boolean, default=True)


class Achievement(Base, TimestampMixin):
    __tablename__ = "achievements"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(40), default="project")
    source: Mapped[str] = mapped_column(String(20), default="manual")
    source_ref: Mapped[str | None] = mapped_column(String(500), nullable=True)
    technologies: Mapped[list[str]] = mapped_column(JSON, default=list)
    skills: Mapped[list[str]] = mapped_column(JSON, default=list)
    impact: Mapped[str] = mapped_column(Text, default="")
    evidence: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    # pending = AI-suggested, needs user confirmation. confirmed = user verified. rejected = dismissed.
    status: Mapped[str] = mapped_column(String(20), default="confirmed", index=True)
    contribution_note: Mapped[str] = mapped_column(Text, default="")
    needs_contribution_confirmation: Mapped[bool] = mapped_column(Boolean, default=False)
    fingerprint: Mapped[str] = mapped_column(String(64), index=True, default="")
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    occurred_on: Mapped[str] = mapped_column(String(20), default="")


class Post(Base, TimestampMixin):
    __tablename__ = "posts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    achievement_id: Mapped[str | None] = mapped_column(ForeignKey("achievements.id", ondelete="SET NULL"), nullable=True)
    content: Mapped[str] = mapped_column(Text)
    tone: Mapped[str] = mapped_column(String(30), default="professional")
    language: Mapped[str] = mapped_column(String(5), default="en")
    hashtags: Mapped[list[str]] = mapped_column(JSON, default=list)

    # Images attached to the LinkedIn post (up to 4).
    # Stores image metadata/references, not the image binary itself.
    images: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)

    # draft | publishing | published | failed | uncertain
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    linkedin_post_urn: Mapped[str | None] = mapped_column(String(200), nullable=True)
    publish_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    publish_attempts: Mapped[int] = mapped_column(Integer, default=0)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    claim_check: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class CV(Base, TimestampMixin):
    """A CV document. kind=master is the single approved Master CV; kind=tailored are job versions."""

    __tablename__ = "cvs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="master")
    title: Mapped[str] = mapped_column(String(300), default="Master CV")
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1)
    parent_cv_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    job_analysis_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class CVVersion(Base, TimestampMixin):
    __tablename__ = "cv_versions"
    __table_args__ = (UniqueConstraint("cv_id", "version"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    cv_id: Mapped[str] = mapped_column(ForeignKey("cvs.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    data: Mapped[dict[str, Any]] = mapped_column(JSON)
    change_summary: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)


class CVSuggestion(Base, TimestampMixin):
    """A proposed update applied to a SEPARATE draft. Master CV changes only on accept."""

    __tablename__ = "cv_suggestions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    cv_id: Mapped[str] = mapped_column(ForeignKey("cvs.id", ondelete="CASCADE"), index=True)
    achievement_id: Mapped[str | None] = mapped_column(ForeignKey("achievements.id", ondelete="SET NULL"), nullable=True)
    base_version: Mapped[int] = mapped_column(Integer)
    draft_data: Mapped[dict[str, Any]] = mapped_column(JSON)
    changes: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    rationale: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class JobAnalysis(Base, TimestampMixin):
    __tablename__ = "job_analyses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    job_title: Mapped[str] = mapped_column(String(300), default="")
    company: Mapped[str] = mapped_column(String(300), default="")
    requirements: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    result: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    match_score: Mapped[float | None] = mapped_column(Float, nullable=True)


class Integration(Base, TimestampMixin):
    __tablename__ = "integrations"
    __table_args__ = (UniqueConstraint("user_id", "provider"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(20))
    access_token_enc: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scopes: Mapped[str] = mapped_column(String(500), default="")
    account_id: Mapped[str] = mapped_column(String(200), default="")
    account_name: Mapped[str] = mapped_column(String(300), default="")
    status: Mapped[str] = mapped_column(String(20), default="connected")
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OAuthState(Base, TimestampMixin):
    """One-time CSRF state for OAuth flows."""

    __tablename__ = "oauth_states"
    state: Mapped[str] = mapped_column(String(100), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    provider: Mapped[str] = mapped_column(String(20))
    code_verifier: Mapped[str] = mapped_column(String(200), default="")


class UserApiKey(Base, TimestampMixin):
    __tablename__ = "user_api_keys"
    __table_args__ = (UniqueConstraint("user_id", "provider"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(20))
    key_enc: Mapped[str] = mapped_column(Text)
    key_hint: Mapped[str] = mapped_column(String(12))
    status: Mapped[str] = mapped_column(String(20), default="unverified")
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Upload(Base, TimestampMixin):
    __tablename__ = "uploads"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(300))
    mime: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    purpose: Mapped[str] = mapped_column(String(20))
    storage_path: Mapped[str] = mapped_column(String(500))
    text_chars: Mapped[int] = mapped_column(Integer, default=0)
    injection_flags: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="processed")


class RepoSnapshot(Base, TimestampMixin):
    """Last scanned state of a GitHub repo, used to detect new / significantly updated projects."""

    __tablename__ = "repo_snapshots"
    __table_args__ = (UniqueConstraint("user_id", "full_name"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    full_name: Mapped[str] = mapped_column(String(300))
    pushed_at: Mapped[str] = mapped_column(String(40), default="")
    readme_sha: Mapped[str] = mapped_column(String(64), default="")
    last_scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ---------------------------------------------------------------- monitoring tables
class AIEvent(Base, TimestampMixin):
    """One row per provider attempt. No prompt or completion text is stored (privacy)."""

    __tablename__ = "ai_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    request_id: Mapped[str] = mapped_column(String(36), index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    task: Mapped[str] = mapped_column(String(40), index=True)
    provider: Mapped[str] = mapped_column(String(20), index=True)
    model: Mapped[str] = mapped_column(String(100))
    key_source: Mapped[str] = mapped_column(String(10), default="platform")
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    is_fallback: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), index=True)
    error_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    input_chars: Mapped[int] = mapped_column(Integer, default=0)


class HTTPEvent(Base, TimestampMixin):
    __tablename__ = "http_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    method: Mapped[str] = mapped_column(String(8))
    route: Mapped[str] = mapped_column(String(200), index=True)
    status_code: Mapped[int] = mapped_column(Integer, index=True)
    latency_ms: Mapped[int] = mapped_column(Integer)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    error_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


class QualityEvent(Base, TimestampMixin):
    """Product-level outcomes: task completion, claim checks, CV review decisions, extraction feedback."""

    __tablename__ = "quality_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(40), index=True)
    task: Mapped[str] = mapped_column(String(40), default="")
    outcome: Mapped[str] = mapped_column(String(30), default="")
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class ErrorLog(Base, TimestampMixin):
    __tablename__ = "error_logs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    route: Mapped[str] = mapped_column(String(200))
    error_type: Mapped[str] = mapped_column(String(100))
    message: Mapped[str] = mapped_column(Text)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


class EvalRun(Base, TimestampMixin):
    __tablename__ = "eval_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    dataset_version: Mapped[str] = mapped_column(String(40))
    provider: Mapped[str] = mapped_column(String(40), default="")
    summary: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    cases: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
