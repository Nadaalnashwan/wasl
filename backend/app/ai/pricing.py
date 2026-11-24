"""Versioned list prices (USD per 1M tokens) used for COST ESTIMATES.

Sources (verified 2026-11-24, official pages):
  Groq models page       https://console.groq.com/docs/models
  Gemini API pricing     https://ai.google.dev/gemini-api/docs/pricing   (paid tier; free tier is free of charge)
  OpenRouter model page  https://openrouter.ai/meta-llama/llama-3.3-70b-instruct   (":free" variants are priced 0)

Estimates are list price × tokens for EVERY attempt (retries and fallbacks included). They are not invoices:
free-tier platform keys are billed $0, and BYOK usage is billed to the user's own account. Unknown models
return None so the dashboard shows "N/A" instead of a misleading $0.
"""
from __future__ import annotations

PRICING_VERSION = "2026-11-24"

# (provider, model) -> (input $/1M tokens, output $/1M tokens)
PRICES: dict[tuple[str, str], tuple[float, float]] = {
    ("groq", "openai/gpt-oss-120b"): (0.15, 0.60),
    ("groq", "openai/gpt-oss-20b"): (0.075, 0.30),
    # Gemini paid-tier list prices valid through 2026-12-31 (rise to 1.50 / 7.50 on 2027-01-01)
    ("gemini", "gemini-3.8-flash"): (0.75, 3.75),
    ("gemini", "gemini-3.6-flash"): (0.75, 3.75),
    ("gemini", "gemini-3.5-flash-lite"): (0.30, 2.50),
    ("openrouter", "meta-llama/llama-3.3-70b-instruct:free"): (0.0, 0.0),
}


def price_for(provider: str, model: str) -> dict | None:
    p = PRICES.get((provider, model))
    return {"input": p[0], "output": p[1]} if p else None


def estimate_cost(provider: str, model: str, prompt_tokens: int, completion_tokens: int) -> float | None:
    p = PRICES.get((provider, model))
    if p is None or (prompt_tokens == 0 and completion_tokens == 0):
        return None
    return round(prompt_tokens / 1e6 * p[0] + completion_tokens / 1e6 * p[1], 8)
