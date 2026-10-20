"""Google Gemini (Generative Language API v1beta) adapter."""
from __future__ import annotations

import httpx

from app.ai.providers.base import LLMResult, Provider, ProviderError, classify_status

BASE = "https://generativelanguage.googleapis.com/v1beta"


class GeminiProvider(Provider):
    name = "gemini"

    async def complete(self, messages, model, *, json_mode, temperature, max_tokens, timeout) -> LLMResult:
        system = "\n\n".join(m.content for m in messages if m.role == "system")
        contents = [
            {"role": "model" if m.role == "assistant" else "user", "parts": [{"text": m.content}]}
            for m in messages
            if m.role != "system"
        ]
        gen_cfg: dict = {"temperature": temperature, "maxOutputTokens": max_tokens}
        if model.startswith("gemini-3"):
            gen_cfg["thinkingConfig"] = {"thinkingLevel": "low"}  # lower latency for structured extraction
        if json_mode:
            gen_cfg["responseMimeType"] = "application/json"
        body: dict = {"contents": contents, "generationConfig": gen_cfg}
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    f"{BASE}/models/{model}:generateContent", json=body, headers={"x-goog-api-key": self.api_key}
                )
        except httpx.TimeoutException as exc:
            raise ProviderError("timeout", "gemini timed out") from exc
        except httpx.HTTPError as exc:
            raise ProviderError("network", f"gemini network error: {type(exc).__name__}") from exc
        if resp.status_code >= 400:
            raise ProviderError(classify_status(resp.status_code), f"gemini HTTP {resp.status_code}", http_status=resp.status_code)
        data = resp.json()
        try:
            parts = data["candidates"][0]["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts)
        except (KeyError, IndexError, TypeError) as exc:
            reason = (data.get("promptFeedback") or {}).get("blockReason", "no candidates")
            raise ProviderError("empty", f"gemini returned no content ({reason})") from exc
        if not text.strip():
            raise ProviderError("empty", "gemini returned empty content")
        usage = data.get("usageMetadata") or {}
        return LLMResult(
            text=text,
            provider=self.name,
            model=model,
            prompt_tokens=int(usage.get("promptTokenCount") or 0),
            completion_tokens=int(usage.get("candidatesTokenCount") or 0),
        )

    async def validate_key(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(f"{BASE}/models", headers={"x-goog-api-key": self.api_key})
        except httpx.HTTPError:
            return False
        return resp.status_code == 200
