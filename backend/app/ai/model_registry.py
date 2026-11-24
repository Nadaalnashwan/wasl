"""Model registry: one traceable configuration per AI task (docs/AI_MODEL_REGISTRY.md).

Each task pins: tier → exact model per provider, temperature, token budget, per-attempt timeout, retry policy,
data sensitivity (which drives the provider privacy policy) and required capabilities. The primary provider is
the first eligible one in AI_PROVIDER_PRIORITY; approved fallbacks are the remaining eligible providers.

REGISTRY_VERSION is stored on every ai_events row so a metric can always be traced to the configuration that
produced it. Bump it whenever a model, temperature, budget or sensitivity changes.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

from app.config import settings

REGISTRY_VERSION = "2026-11-24.1"

# provider privacy levels, weakest → strongest
PRIVACY_LEVELS = ("none", "limited_retention", "zdr")


@dataclass(frozen=True)
class TaskConfig:
    name: str
    tier: str  # fast | quality
    max_tokens: int
    temperature: float
    timeout_s: float
    max_retries: int
    sensitivity: str  # personal (CV / achievements / posts) | public (job ads only)
    capabilities: tuple[str, ...] = ("json",)
    description: str = ""


def _t(name, tier, max_tokens, temperature, sensitivity, description, timeout_s=None, retries=None) -> TaskConfig:
    return TaskConfig(name, tier, max_tokens, temperature, timeout_s or settings.ai_timeout_seconds,
                      settings.ai_max_retries if retries is None else retries, sensitivity, ("json",), description)


TASKS: dict[str, TaskConfig] = {t.name: t for t in [
    _t("post_generation", "quality", 1200, 0.7, "personal", "Write a LinkedIn post from one confirmed achievement"),
    _t("post_improve", "quality", 1000, 0.4, "personal", "Rewrite a draft / remove flagged claims"),
    _t("achievement_extraction", "quality", 1500, 0.1, "personal", "Extract achievements + verbatim evidence quotes from text/files"),
    _t("repo_analysis", "quality", 1500, 0.1, "personal", "Extract achievements from a GitHub repository bundle"),
    _t("cv_parse", "quality", 3500, 0.0, "personal", "Structure an uploaded CV (contact details redacted first)"),
    _t("cv_update", "quality", 1500, 0.2, "personal", "Propose Master CV changes for a confirmed achievement"),
    _t("cv_tailor", "quality", 3000, 0.2, "personal", "Rephrase/reorder existing CV content for a job"),
    _t("gap_roadmap", "quality", 2000, 0.3, "personal", "Learning roadmap from verified/unverified/missing skills"),
    _t("job_profile", "fast", 800, 0.0, "personal", "Derive job-search titles/skills from the Master CV"),
    _t("job_requirements", "fast", 1200, 0.0, "public", "Extract requirements from a job description"),
    _t("job_requirements_batch", "fast", 2500, 0.0, "public", "Extract requirements from many public job ads"),
]}


def model_for(provider: str, tier: str) -> str:
    if provider == "groq":
        return settings.groq_model_quality if tier == "quality" else settings.groq_model_fast
    if provider == "gemini":
        return settings.gemini_model_quality if tier == "quality" else settings.gemini_model_fast
    if provider == "openrouter":
        return settings.openrouter_model
    return f"{provider}-{tier}"


def provider_privacy(provider: str, key_source: str = "platform") -> tuple[str, str]:
    """(level, basis) from official provider documentation, verified 2026-11-24 (docs/PRIVACY.md).

    Levels describe the configuration Wasl can actually guarantee for that call, not the best the provider offers.
    """
    if provider == "fake":
        return "zdr", "test double — no network"
    if provider == "groq":
        if key_source == "platform" and settings.groq_zdr_enabled:
            return "zdr", "Groq Zero Data Retention enabled in Data Controls (operator attestation)"
        return "limited_retention", "Groq: inputs/outputs not retained by default; may be logged ≤30 days for reliability/abuse"
    if provider == "gemini":
        if key_source == "platform" and settings.gemini_paid_tier:
            return "limited_retention", "Gemini paid tier: prompts not used to improve products; limited abuse-monitoring logs"
        return "none", "Gemini unpaid tier (or unknown tier for personal keys): content may be used to improve products and reviewed by humans"
    if provider == "openrouter":
        return "zdr", "OpenRouter request sets provider.zdr=true and data_collection=deny (routes only to ZDR endpoints or fails)"
    return "none", "unknown provider"


def privacy_ok(level: str, sensitivity: str) -> bool:
    if sensitivity != "personal":
        return True
    required = settings.ai_personal_min_privacy if settings.ai_personal_min_privacy in PRIVACY_LEVELS else "limited_retention"
    return PRIVACY_LEVELS.index(level) >= PRIVACY_LEVELS.index(required)


def describe() -> dict:
    """Registry snapshot for the admin console (no secrets)."""
    from app.ai.pricing import PRICING_VERSION, price_for

    order = settings.provider_priority()
    tasks = []
    for t in TASKS.values():
        routes = []
        for p in order:
            level, basis = provider_privacy(p)
            model = model_for(p, t.tier)
            routes.append({"provider": p, "model": model, "privacy_level": level, "privacy_basis": basis,
                           "eligible": privacy_ok(level, t.sensitivity), "price_per_mtok": price_for(p, model)})
        eligible = [r for r in routes if r["eligible"]]
        tasks.append({**asdict(t), "primary": eligible[0] if eligible else None, "fallbacks": eligible[1:], "routes": routes})
    return {"registry_version": REGISTRY_VERSION, "pricing_version": PRICING_VERSION,
            "personal_min_privacy": settings.ai_personal_min_privacy, "provider_priority": order, "tasks": tasks}
