"""Central configuration. Every value comes from environment variables / backend/.env.

Platform AI keys live ONLY here (server side). They are never returned by any endpoint.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    # --- core ---
    app_env: str = "development"
    frontend_url: str = "http://localhost:3000"
    backend_url: str = "http://localhost:8000"
    cors_origins: str = "http://localhost:3000"

    # --- database ---
    # SQLite by default so the app runs with zero setup. Point at Supabase Postgres for production:
    # postgresql+psycopg://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'wasl.db').as_posix()}"

    # --- auth ---
    # "local": backend issues its own JWTs (dev/demo). "supabase": verify Supabase Auth JWTs.
    auth_mode: str = "local"
    jwt_secret: str = "dev-only-change-me-please-32-bytes-min"
    jwt_expire_minutes: int = 60 * 24
    supabase_url: str = ""
    supabase_jwt_secret: str = ""  # Supabase project -> Settings -> API -> JWT secret (legacy HS256)
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "wasl-uploads"

    # --- encryption for BYOK keys + OAuth tokens (Fernet, urlsafe base64 32 bytes) ---
    encryption_key: str = ""

    # --- platform AI providers (backend only) ---
    groq_api_key: str = ""
    gemini_api_key: str = ""
    openrouter_api_key: str = ""
    # comma separated provider priority; router skips providers without keys
    ai_provider_priority: str = "groq,gemini,openrouter"
    groq_model_fast: str = "openai/gpt-oss-20b"
    groq_model_quality: str = "openai/gpt-oss-120b"
    gemini_model_fast: str = "gemini-3.5-flash"
    gemini_model_quality: str = "gemini-3.5-flash"
    openrouter_model: str = "meta-llama/llama-3.3-70b-instruct:free"
    ai_timeout_seconds: float = 45.0
    ai_max_retries: int = 2
    # Test-only deterministic provider. Never enabled unless explicitly set.
    ai_enable_fake_provider: bool = False

    # --- LinkedIn (Sign In with LinkedIn using OpenID Connect + Share on LinkedIn) ---
    linkedin_client_id: str = ""
    linkedin_client_secret: str = ""
    linkedin_redirect_uri: str = "http://localhost:8000/api/integrations/linkedin/callback"
    linkedin_scopes: str = "openid profile email w_member_social"

    # --- GitHub OAuth App ---
    github_client_id: str = ""
    github_client_secret: str = ""
    github_redirect_uri: str = "http://localhost:8000/api/integrations/github/callback"
    github_scopes: str = "read:user"  # public repos only; add "repo" to include private repos (broad scope)
    github_max_repos_per_scan: int = 10

    # --- uploads ---
    max_upload_mb: int = 5
    upload_dir: str = str(BACKEND_DIR / "uploads")

    # --- monitoring alert thresholds ---
    alert_failure_rate: float = 0.2
    alert_p95_latency_ms: int = 15000
    alert_unsupported_claim_rate: float = 0.1
    alert_fallback_rate: float = 0.3

    @model_validator(mode="after")
    def _defaults_for_blank(self) -> Settings:
        # blank values in .env mean "use the default", not "empty"
        if not self.database_url:
            self.database_url = f"sqlite:///{(BACKEND_DIR / 'wasl.db').as_posix()}"
        if not self.jwt_secret:
            if self.app_env == "production":
                raise ValueError("JWT_SECRET must be set in production")
            self.jwt_secret = "dev-only-change-me-please-32-bytes-min"
        if self.app_env == "production" and self.jwt_secret.startswith("dev-only"):
            raise ValueError("Set a real JWT_SECRET in production")
        if self.app_env == "production" and not self.encryption_key:
            raise ValueError("ENCRYPTION_KEY must be set in production")
        return self

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    def provider_priority(self) -> list[str]:
        return [p.strip().lower() for p in self.ai_provider_priority.split(",") if p.strip()]

    @property
    def linkedin_configured(self) -> bool:
        return bool(self.linkedin_client_id and self.linkedin_client_secret)

    @property
    def github_configured(self) -> bool:
        return bool(self.github_client_id and self.github_client_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
