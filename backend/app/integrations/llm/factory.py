"""쓸 LLM 클라이언트를 고른다.

설정 `LLM_PROVIDER` 하나로 갈린다. 고르는 자리를 한 곳에 두어야 "어떤 게 도는지" 를
한 파일만 보면 안다. 키 없는 provider 는 여기서 막고, create_app() 이 기동할 때 이것을 부르므로
그 리비전은 뜨지 못한다. 첫 사진 요청에서야 503 이 나면 이미 트래픽을 받고 있다.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import SecretStr

from app.core.config import get_settings
from app.integrations.llm.gemini import GEMINI_DEFAULT_MODEL, GeminiStructuredClient
from app.integrations.llm.openai import OPENAI_DEFAULT_MODEL, OpenAiStructuredClient
from app.integrations.llm.port import LlmMisconfigured, LlmStructuredClient
from app.integrations.llm.stub import StubLlmStructuredClient

__all__ = ["get_llm_client"]


@lru_cache(maxsize=1)
def get_llm_client() -> LlmStructuredClient:
    settings = get_settings()
    if settings.llm_provider == "gemini":
        return GeminiStructuredClient(
            api_key=_require_key(settings.gemini_api_key, "GEMINI_API_KEY", "gemini"),
            model=settings.llm_model or GEMINI_DEFAULT_MODEL,
            timeout_seconds=settings.llm_timeout_seconds,
        )
    if settings.llm_provider == "openai":
        return OpenAiStructuredClient(
            api_key=_require_key(settings.openai_api_key, "OPENAI_API_KEY", "openai"),
            model=settings.llm_model or OPENAI_DEFAULT_MODEL,
            timeout_seconds=settings.llm_timeout_seconds,
        )
    return StubLlmStructuredClient()


def _require_key(secret: SecretStr | None, name: str, provider: str) -> str:
    value = secret.get_secret_value().strip() if secret is not None else ""
    if not value:
        raise LlmMisconfigured(f"LLM_PROVIDER={provider} 에는 {name} 가 필요합니다.")
    return value
