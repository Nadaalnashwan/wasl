"""Provider adapter contract. Adding a provider = one class implementing `complete` + `validate_key`."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ChatMessage:
    role: str  # system | user | assistant
    content: str


@dataclass
class LLMResult:
    text: str
    provider: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0


@dataclass
class ProviderError(Exception):
    error_type: str  # timeout | rate_limit | auth | model_not_found | bad_request | server | network | empty
    message: str
    http_status: int | None = None
    retry_after: float | None = None
    retryable: bool = field(init=False)

    def __post_init__(self) -> None:
        self.retryable = self.error_type in {"timeout", "rate_limit", "server", "network", "empty"}
        super().__init__(self.message)


def classify_status(status: int) -> str:
    if status == 429:
        return "rate_limit"
    if status in (401, 403):
        return "auth"
    if status == 404:
        return "model_not_found"
    if status >= 500:
        return "server"
    return "bad_request"


class Provider(ABC):
    name: str
    supports_json_mode: bool = True

    def __init__(self, api_key: str):
        self.api_key = api_key

    @abstractmethod
    async def complete(
        self,
        messages: list[ChatMessage],
        model: str,
        *,
        json_mode: bool,
        temperature: float,
        max_tokens: int,
        timeout: float,
    ) -> LLMResult: ...

    @abstractmethod
    async def validate_key(self) -> bool:
        """Cheap authenticated call proving the key works (lists models)."""
