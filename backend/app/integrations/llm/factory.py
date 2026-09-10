"""쓸 LLM 클라이언트를 고른다.

설정 `LLM_PROVIDER` 하나로 갈린다. 고르는 자리를 한 곳에 두어야 "어떤 게 도는지" 를
한 파일만 보면 안다. 키 없는 provider 는 여기서 막고, create_app() 이 기동할 때 이것을 부르므로
그 리비전은 뜨지 못한다. 첫 사진 요청에서야 503 이 나면 이미 트래픽을 받고 있다.

**모델이 둘이다.** 1차(`get_llm_client`)는 값싼 것으로 늘 부르고, 재시도(`get_escalation_client`)는
서버 검증에 걸렸을 때만 부른다. 재시도 쪽이 열 배 가까이 비싸서 일부러 갈라 뒀다.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import SecretStr

from app.core.config import get_settings
from app.integrations.llm.gemini import (
    GEMINI_DEFAULT_MODEL,
    GEMINI_ESCALATION_MODEL,
    GeminiStructuredClient,
)
from app.integrations.llm.openai import (
    OPENAI_DEFAULT_MODEL,
    OPENAI_ESCALATION_MODEL,
    OpenAiStructuredClient,
)
from app.integrations.llm.port import LlmMisconfigured, LlmStructuredClient
from app.integrations.llm.stub import StubLlmStructuredClient

__all__ = ["get_escalation_client", "get_llm_client"]


@lru_cache(maxsize=1)
def get_llm_client() -> LlmStructuredClient:
    settings = get_settings()
    return _build(
        settings.llm_provider, settings.llm_model or _default_model(settings.llm_provider)
    )


@lru_cache(maxsize=1)
def get_escalation_client() -> LlmStructuredClient | None:
    """1차가 이상할 때만 부르는 모델. 안 쓰기로 했으면 None.

    1차와 같은 모델이면 없는 것으로 본다. 같은 것을 두 번 불러 봐야 값만 두 배다.
    스텁일 때도 없다. 규칙 파서를 두 번 돌린다고 답이 달라지지 않는다.
    """
    settings = get_settings()
    if settings.llm_provider == "stub":
        return None
    escalation = settings.llm_escalation_model or _default_escalation_model(settings.llm_provider)
    if not escalation or escalation == (
        settings.llm_model or _default_model(settings.llm_provider)
    ):
        return None
    return _build(settings.llm_provider, escalation)


def _build(provider: str, model: str) -> LlmStructuredClient:
    settings = get_settings()
    if provider == "gemini":
        return GeminiStructuredClient(
            api_key=_require_key(settings.gemini_api_key, "GEMINI_API_KEY", "gemini"),
            model=model,
            timeout_seconds=settings.llm_timeout_seconds,
        )
    if provider == "openai":
        return OpenAiStructuredClient(
            api_key=_require_key(settings.openai_api_key, "OPENAI_API_KEY", "openai"),
            model=model,
            timeout_seconds=settings.llm_timeout_seconds,
        )
    return StubLlmStructuredClient()


def _default_model(provider: str) -> str:
    if provider == "gemini":
        return GEMINI_DEFAULT_MODEL
    if provider == "openai":
        return OPENAI_DEFAULT_MODEL
    return "stub"


def _default_escalation_model(provider: str) -> str | None:
    if provider == "gemini":
        return GEMINI_ESCALATION_MODEL
    if provider == "openai":
        return OPENAI_ESCALATION_MODEL
    return None


def _require_key(secret: SecretStr | None, name: str, provider: str) -> str:
    value = secret.get_secret_value().strip() if secret is not None else ""
    if not value:
        raise LlmMisconfigured(f"LLM_PROVIDER={provider} 에는 {name} 가 필요합니다.")
    return value
