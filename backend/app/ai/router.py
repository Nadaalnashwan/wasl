"""AI Model Router.

Responsibilities
- Task-based model selection (fast vs quality tier, JSON mode, token budget per task).
- Candidate ordering that respects the user's BYOK + privacy preferences:
    ai_mode=platform        -> platform providers (priority from AI_PROVIDER_PRIORITY)
    ai_mode=personal        -> user's own keys only; platform used ONLY if allow_platform_fallback
    ai_mode=personal_first  -> user's keys first, then platform if allow_platform_fallback
    allow_cross_provider=False -> never send the same data to a second provider company
- Per-attempt timeout, retries with exponential backoff (honours Retry-After) for transient errors.
- Structured output: JSON parsed + validated with a Pydantic schema; one repair round-trip on failure.
- Fallback to the next compatible provider; every attempt is recorded as an AIEvent (metadata only).
- Helpful error when everything fails.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import TypeVar

from pydantic import BaseModel, ValidationError
from sqlalchemy import select

from app.ai.providers import registry
from app.ai.providers.base import ChatMessage, ProviderError
from app.config import settings
from app.db import SessionLocal
from app.models import User, UserApiKey
from app.monitoring.recorder import record_ai_event
from app.security.crypto import decrypt

T = TypeVar("T", bound=BaseModel)


@dataclass(frozen=True)
class TaskProfile:
    tier: str  # fast | quality
    max_tokens: int
    temperature: float


TASKS: dict[str, TaskProfile] = {
    "post_generation": TaskProfile("quality", 1200, 0.7),
    "post_improve": TaskProfile("quality", 1000, 0.4),
    "achievement_extraction": TaskProfile("quality", 1500, 0.1),
    "repo_analysis": TaskProfile("quality", 1500, 0.1),
    "cv_parse": TaskProfile("quality", 3500, 0.0),
    "cv_update": TaskProfile("quality", 1500, 0.2),
    "job_requirements": TaskProfile("fast", 1200, 0.0),
    "cv_tailor": TaskProfile("quality", 3000, 0.2),
    "gap_roadmap": TaskProfile("quality", 2000, 0.3),
}


class AIUnavailableError(Exception):
    """No provider could serve the request. `reason` is safe to show to users."""

    def __init__(self, reason: str, attempts: list[dict] | None = None):
        super().__init__(reason)
        self.reason = reason
        self.attempts = attempts or []


@dataclass
class Candidate:
    provider: str
    api_key: str
    key_source: str  # platform | user


@dataclass
class RouterResult:
    data: BaseModel
    provider: str
    model: str
    request_id: str
    fallback_used: bool
    attempts: list[dict] = field(default_factory=list)


def _user_keys(user_id: str) -> dict[str, str]:
    db = SessionLocal()
    try:
        rows = db.scalars(select(UserApiKey).where(UserApiKey.user_id == user_id, UserApiKey.status != "invalid")).all()
        out = {}
        for r in rows:
            if r.provider in registry.PROVIDER_CLASSES:
                try:
                    out[r.provider] = decrypt(r.key_enc)
                except ValueError:
                    continue
        return out
    finally:
        db.close()


def build_candidates(user: User | None) -> list[Candidate]:
    platform = [Candidate(p, registry.platform_key(p), "platform") for p in registry.platform_providers()]
    if user is None or user.ai_mode == "platform":
        cands = platform
    else:
        keys = _user_keys(user.id)
        personal = [Candidate(p, k, "user") for p, k in keys.items()]
        cands = personal + (platform if user.allow_platform_fallback else [])
    if user is not None and not user.allow_cross_provider and cands:
        first = cands[0].provider
        cands = [c for c in cands if c.provider == first]
    return cands


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.M)


def extract_json(text: str) -> dict:
    text = _FENCE.sub("", text.strip())
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
        raise


def _schema_hint(schema: type[BaseModel]) -> str:
    return json.dumps(schema.model_json_schema(), separators=(",", ":"))[:6000]


async def run_structured(
    task: str,
    system: str,
    user_prompt: str,
    schema: type[T],
    *,
    user: User | None = None,
    candidates: list[Candidate] | None = None,
) -> RouterResult:
    profile = TASKS[task]
    cands = candidates if candidates is not None else build_candidates(user)
    if not cands:
        # still visible on the dashboard: users experienced a failed AI call
        record_ai_event(request_id=str(uuid.uuid4()), user_id=user.id if user else None, task=task, provider="none", model="-",
                        key_source="platform", status="error", error_type="no_provider", latency_ms=0,
                        input_chars=len(system) + len(user_prompt))
        if user is not None and user.ai_mode == "personal" and not user.allow_platform_fallback:
            raise AIUnavailableError("You chose to use only your own API keys, but no valid personal key is saved. Add one in Settings.")
        raise AIUnavailableError("No AI provider is configured. Add GROQ_API_KEY or GEMINI_API_KEY to backend/.env, or add your own key in Settings.")

    sys_msg = (
        f"{system}\n\nRespond with a single JSON object only, matching this JSON Schema:\n{_schema_hint(schema)}"
    )
    request_id = str(uuid.uuid4())
    attempts_log: list[dict] = []
    input_chars = len(system) + len(user_prompt)

    for idx, cand in enumerate(cands):
        provider = registry.build(cand.provider, cand.api_key)
        model = registry.model_for(cand.provider, profile.tier)
        messages = [ChatMessage("system", sys_msg), ChatMessage("user", user_prompt)]
        repaired = False
        attempt = 0
        while attempt <= settings.ai_max_retries:
            attempt += 1
            t0 = time.perf_counter()
            event = dict(
                request_id=request_id, user_id=user.id if user else None, task=task, provider=cand.provider,
                model=model, key_source=cand.key_source, attempt=attempt, is_fallback=idx > 0, input_chars=input_chars,
            )
            try:
                res = await provider.complete(
                    messages, model, json_mode=True, temperature=profile.temperature,
                    max_tokens=profile.max_tokens, timeout=settings.ai_timeout_seconds,
                )
            except ProviderError as err:
                latency = int((time.perf_counter() - t0) * 1000)
                record_ai_event(**event, status="error", error_type=err.error_type, http_status=err.http_status, latency_ms=latency)
                attempts_log.append({"provider": cand.provider, "attempt": attempt, "error": err.error_type})
                if err.retryable and attempt <= settings.ai_max_retries:
                    delay = err.retry_after if err.retry_after is not None else min(8.0, 0.75 * 2 ** (attempt - 1))
                    await asyncio.sleep(min(delay, 8.0))
                    continue
                break  # non-retryable (auth/bad_request) or retries exhausted -> next provider

            latency = int((time.perf_counter() - t0) * 1000)
            tokens = dict(prompt_tokens=res.prompt_tokens, completion_tokens=res.completion_tokens)
            try:
                parsed = schema.model_validate(extract_json(res.text))
            except (json.JSONDecodeError, ValidationError) as verr:
                record_ai_event(**event, status="invalid_output", error_type="validation", latency_ms=latency, **tokens)
                attempts_log.append({"provider": cand.provider, "attempt": attempt, "error": "validation"})
                if not repaired:
                    repaired = True
                    detail = str(verr)[:800]
                    messages = messages + [
                        ChatMessage("assistant", res.text[:4000]),
                        ChatMessage("user", f"That output failed validation: {detail}\nReturn ONLY corrected JSON for the schema."),
                    ]
                    continue
                break
            record_ai_event(**event, status="success", latency_ms=latency, **tokens)
            attempts_log.append({"provider": cand.provider, "attempt": attempt, "ok": True})
            return RouterResult(parsed, cand.provider, res.model, request_id, idx > 0, attempts_log)

    summary = ", ".join(f"{a['provider']}:{a.get('error', 'ok')}" for a in attempts_log[-6:])
    errors = {a.get("error") for a in attempts_log}
    if errors & {"rate_limit", "timeout", "server", "network", "empty"}:
        hint = "This is usually temporary — please retry in a minute."
    elif errors & {"auth", "model_not_found", "bad_request"}:
        hint = "The AI provider configuration needs attention (key or model name)."
    else:
        hint = "The model did not return valid structured output — please retry."
    raise AIUnavailableError(f"All configured AI providers failed for this request ({summary}). {hint}", attempts_log)
