"""OpenAI-compatible chat completions adapter. Used for Groq and OpenRouter (and any compatible API)."""
from __future__ import annotations

import httpx

from app.ai.providers.base import LLMResult, Provider, ProviderError, classify_status


class OpenAICompatProvider(Provider):
    base_url: str = ""
    extra_headers: dict[str, str] = {}

    async def complete(self, messages, model, *, json_mode, temperature, max_tokens, timeout) -> LLMResult:
        body: dict = {
            "model": model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode and self.supports_json_mode:
            body["response_format"] = {"type": "json_object"}
        if "gpt-oss" in model:
            body["reasoning_effort"] = "low"  # reasoning tokens count against max_tokens; keep them small
        headers = {"Authorization": f"Bearer {self.api_key}", **self.extra_headers}
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(f"{self.base_url}/chat/completions", json=body, headers=headers)
        except httpx.TimeoutException as exc:
            raise ProviderError("timeout", f"{self.name} timed out") from exc
        except httpx.HTTPError as exc:
            raise ProviderError("network", f"{self.name} network error: {type(exc).__name__}") from exc

        if resp.status_code >= 400:
            retry_after = resp.headers.get("retry-after")
            raise ProviderError(
                classify_status(resp.status_code),
                f"{self.name} HTTP {resp.status_code}",
                http_status=resp.status_code,
                retry_after=float(retry_after) if retry_after and retry_after.replace(".", "").isdigit() else None,
            )
        data = resp.json()
        try:
            text = data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError("empty", f"{self.name} returned no choices") from exc
        if not text.strip():
            raise ProviderError("empty", f"{self.name} returned empty content")
        usage = data.get("usage") or {}
        return LLMResult(
            text=text,
            provider=self.name,
            model=data.get("model", model),
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
        )

    async def validate_key(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(f"{self.base_url}/models", headers={"Authorization": f"Bearer {self.api_key}"})
        except httpx.HTTPError:
            return False
        return resp.status_code == 200


class GroqProvider(OpenAICompatProvider):
    name = "groq"
    base_url = "https://api.groq.com/openai/v1"


class OpenRouterProvider(OpenAICompatProvider):
    name = "openrouter"
    base_url = "https://openrouter.ai/api/v1"
    extra_headers = {"HTTP-Referer": "https://github.com/wasl-app", "X-Title": "Wasl"}

    async def validate_key(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(f"{self.base_url}/key", headers={"Authorization": f"Bearer {self.api_key}"})
        except httpx.HTTPError:
            return False
        return resp.status_code == 200

