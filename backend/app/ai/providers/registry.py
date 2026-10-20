"""Provider registry + task-tier model selection."""
from __future__ import annotations

from app.ai.providers.base import Provider
from app.ai.providers.fake import FakeProvider
from app.ai.providers.gemini import GeminiProvider
from app.ai.providers.openai_compat import GroqProvider, OpenRouterProvider
from app.config import settings

PROVIDER_CLASSES: dict[str, type[Provider]] = {
    "groq": GroqProvider,
    "gemini": GeminiProvider,
    "openrouter": OpenRouterProvider,
}
if settings.ai_enable_fake_provider:
    PROVIDER_CLASSES["fake"] = FakeProvider

# Providers a user may bring their own key for.
BYOK_PROVIDERS = ["groq", "gemini", "openrouter"]


def platform_key(provider: str) -> str:
    if provider == "fake" and settings.ai_enable_fake_provider:
        return "fake-platform-key"
    return {
        "groq": settings.groq_api_key,
        "gemini": settings.gemini_api_key,
        "openrouter": settings.openrouter_api_key,
    }.get(provider, "")


def model_for(provider: str, tier: str) -> str:
    """tier: 'fast' (cheap classification/extraction) or 'quality' (writing, reasoning)."""
    if provider == "groq":
        return settings.groq_model_quality if tier == "quality" else settings.groq_model_fast
    if provider == "gemini":
        return settings.gemini_model_quality if tier == "quality" else settings.gemini_model_fast
    if provider == "openrouter":
        return settings.openrouter_model
    return f"{provider}-{tier}"


def platform_providers() -> list[str]:
    order = settings.provider_priority()
    if settings.ai_enable_fake_provider and "fake" not in order:
        order = ["fake", *order]
    return [p for p in order if p in PROVIDER_CLASSES and platform_key(p)]


def build(provider: str, api_key: str) -> Provider:
    return PROVIDER_CLASSES[provider](api_key)
