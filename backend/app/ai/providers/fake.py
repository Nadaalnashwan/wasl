"""Deterministic test double. Only registered when AI_ENABLE_FAKE_PROVIDER=true (pytest).

It is never used for evaluation scores or shown in the product as a real model.
"""
from __future__ import annotations

from collections.abc import Callable

from app.ai.providers.base import ChatMessage, LLMResult, Provider, ProviderError

Responder = Callable[[list[ChatMessage]], str]


class FakeProvider(Provider):
    name = "fake"
    responder: Responder | None = None
    # queue of errors to raise before answering, e.g. ["rate_limit", "timeout"]
    error_queue: list[str] = []
    calls: int = 0

    async def complete(self, messages, model, *, json_mode, temperature, max_tokens, timeout) -> LLMResult:
        FakeProvider.calls += 1
        if FakeProvider.error_queue:
            raise ProviderError(FakeProvider.error_queue.pop(0), "fake provider injected error", retry_after=0)
        if FakeProvider.responder is None:
            raise ProviderError("server", "fake provider has no responder")
        text = FakeProvider.responder(messages)
        return LLMResult(text=text, provider=self.name, model=model, prompt_tokens=100, completion_tokens=50)

    async def validate_key(self) -> bool:
        return self.api_key == "fake-valid-key"
