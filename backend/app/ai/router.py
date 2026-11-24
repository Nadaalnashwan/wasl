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

from app.ai import model_registry
from app.ai.pricing import PRICING_VERSION, estimate_cost
from app.ai.providers import registry
from app.ai.providers.base import ChatMessage, ProviderError
from app.config import settings
from app.db import SessionLocal
from app.models import User, UserApiKey
from app.monitoring.recorder import record_ai_event
from app.security.crypto import decrypt
from app.security.pii import Redactor

T = TypeVar("T", bound=BaseModel)


# Task configuration now lives in the model registry (app/ai/model_registry.py); re-exported for callers.
TASKS = model_registry.TASKS


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
    model: str  # identifier the provider reported (falls back to the requested model)
    request_id: str
    fallback_used: bool
    attempts: list[dict] = field(default_factory=list)
    requested_model: str = ""
    registry_version: str = model_registry.REGISTRY_VERSION
    est_cost_usd: float | None = None
    redactions: int = 0


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
    pii_names: list[str] | None = None,
    document: bool = False,
) -> RouterResult:
    """Run one logical AI request.

    Privacy enforcement happens HERE (not in each workflow): personal-data tasks only go to providers whose
    verified privacy level meets AI_PERSONAL_MIN_PRIVACY — the same rule applies to fallbacks and BYOK keys —
    and every outbound message is PII-redacted, with placeholders restored locally in the answer.
    `pii_names` adds names to redact; `document=True` also treats the first line as the holder's name (CVs).
    """
    cfg = model_registry.TASKS[task]
    cands = candidates if candidates is not None else build_candidates(user)
    request_id = str(uuid.uuid4())
    input_chars = len(system) + len(user_prompt)
    uid = user.id if user else None

    def _no_provider(error_type: str, reason: str) -> AIUnavailableError:
        record_ai_event(request_id=request_id, user_id=uid, task=task, provider="none", model="-", key_source="platform",
                        status="error", error_type=error_type, latency_ms=0, input_chars=input_chars,
                        registry_version=model_registry.REGISTRY_VERSION)
        return AIUnavailableError(reason)

    if not cands:
        if user is not None and user.ai_mode == "personal" and not user.allow_platform_fallback:
            raise _no_provider("no_provider", "You chose to use only your own API keys, but no valid personal key is saved. Add one in Settings.")
        raise _no_provider("no_provider", "No AI provider is configured. Add GROQ_API_KEY or GEMINI_API_KEY to backend/.env, or add your own key in Settings.")

    # ---- provider privacy policy (applies equally to primary, fallback and BYOK candidates)
    eligible: list[tuple[Candidate, str]] = []
    for c in cands:
        level, _basis = model_registry.provider_privacy(c.provider, c.key_source)
        if model_registry.privacy_ok(level, cfg.sensitivity):
            eligible.append((c, level))
    if not eligible:
        raise _no_provider(
            "privacy_policy",
            "No configured AI provider meets Wasl's privacy requirements for personal career data, so nothing was sent. "
            "An administrator must enable a provider with limited retention (see docs/PRIVACY.md), or add a Groq or "
            "OpenRouter key in Settings.",
        )

    # ---- PII redaction at the provider boundary
    names = [n for n in [*(pii_names or []), (user.full_name if user else "")] if n]
    redactor = Redactor(known_names=names, cv_header=document)
    if settings.ai_redact_pii:
        safe_system, safe_prompt = redactor.redact(system), redactor.redact(user_prompt)
    else:  # pragma: no cover - only for local debugging
        safe_system, safe_prompt = system, user_prompt

    sys_msg = f"{safe_system}\n\nRespond with a single JSON object only, matching this JSON Schema:\n{_schema_hint(schema)}"
    if redactor.count:
        sys_msg += ("\nSome personal details were replaced with placeholders like [EMAIL_1] or [NAME_1]. "
                    "Copy placeholders exactly where those values belong; never invent replacements.")
    attempts_log: list[dict] = []
    deadline = time.monotonic() + settings.ai_total_deadline_seconds

    for idx, (cand, level) in enumerate(eligible):
        provider = registry.build(cand.provider, cand.api_key)
        provider.zdr_required = cfg.sensitivity == "personal"  # adapters that support request-level ZDR use it
        model = model_registry.model_for(cand.provider, cfg.tier)
        messages = [ChatMessage("system", sys_msg), ChatMessage("user", safe_prompt)]
        repaired = False
        attempt = 0
        while attempt <= cfg.max_retries:
            remaining = deadline - time.monotonic()
            if remaining <= 1:
                attempts_log.append({"provider": cand.provider, "attempt": attempt + 1, "error": "deadline"})
                break
            attempt += 1
            t0 = time.perf_counter()
            event = dict(
                request_id=request_id, user_id=uid, task=task, provider=cand.provider, model=model, key_source=cand.key_source,
                attempt=attempt, is_fallback=idx > 0, input_chars=input_chars, registry_version=model_registry.REGISTRY_VERSION,
                pricing_version=PRICING_VERSION, privacy_level=level, redactions=redactor.count,
            )
            try:
                res = await provider.complete(
                    messages, model, json_mode=True, temperature=cfg.temperature,
                    max_tokens=cfg.max_tokens, timeout=min(cfg.timeout_s, remaining),
                )
            except ProviderError as err:
                latency = int((time.perf_counter() - t0) * 1000)
                record_ai_event(**event, status="error", error_type=err.error_type, http_status=err.http_status, latency_ms=latency)
                attempts_log.append({"provider": cand.provider, "attempt": attempt, "error": err.error_type})
                if err.retryable and attempt <= cfg.max_retries:
                    delay = err.retry_after if err.retry_after is not None else min(8.0, 0.75 * 2 ** (attempt - 1))
                    if delay >= deadline - time.monotonic():
                        break  # Retry-After longer than our budget -> try the next provider instead of waiting
                    await asyncio.sleep(min(delay, 8.0))
                    continue
                break  # non-retryable (auth/bad_request) or retries exhausted -> next provider

            latency = int((time.perf_counter() - t0) * 1000)
            returned = res.model or model
            cost = estimate_cost(cand.provider, model, res.prompt_tokens, res.completion_tokens)
            tokens = dict(prompt_tokens=res.prompt_tokens, completion_tokens=res.completion_tokens, returned_model=returned[:120],
                          est_cost_usd=cost)
            try:
                parsed = schema.model_validate(extract_json(redactor.restore(res.text)))
            except (json.JSONDecodeError, ValidationError) as verr:
                record_ai_event(**event, status="invalid_output", error_type="validation", latency_ms=latency, **tokens)
                attempts_log.append({"provider": cand.provider, "attempt": attempt, "error": "validation"})
                if not repaired:
                    repaired = True
                    detail = redactor.redact(str(verr)[:800])
                    messages = messages + [
                        ChatMessage("assistant", res.text[:4000]),
                        ChatMessage("user", f"That output failed validation: {detail}\nReturn ONLY corrected JSON for the schema."),
                    ]
                    continue
                break
            record_ai_event(**event, status="success", latency_ms=latency, **tokens)
            attempts_log.append({"provider": cand.provider, "attempt": attempt, "ok": True})
            return RouterResult(parsed, cand.provider, returned, request_id, idx > 0, attempts_log, requested_model=model,
                                est_cost_usd=cost, redactions=redactor.count)

    summary = ", ".join(f"{a['provider']}:{a.get('error', 'ok')}" for a in attempts_log[-6:])
    errors = {a.get("error") for a in attempts_log}
    if errors & {"rate_limit", "timeout", "server", "network", "empty", "deadline"}:
        hint = "This is usually temporary — please retry in a minute."
    elif errors & {"auth", "model_not_found", "bad_request"}:
        hint = "The AI provider configuration needs attention (key or model name)."
    else:
        hint = "The model did not return valid structured output — please retry."
    raise AIUnavailableError(f"All configured AI providers failed for this request ({summary}). {hint}", attempts_log)
