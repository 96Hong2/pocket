"""쓸 LLM 클라이언트를 고른다.

지금은 스텁 하나뿐이다. 실제 provider 는 키가 오면 여기서 갈린다.
고르는 자리를 한 곳에 두어야 "어떤 게 도는지" 를 한 파일만 보면 안다.
"""

from __future__ import annotations

from functools import lru_cache

from app.integrations.llm.port import LlmStructuredClient
from app.integrations.llm.stub import StubLlmStructuredClient

__all__ = ["get_llm_client"]


@lru_cache(maxsize=1)
def get_llm_client() -> LlmStructuredClient:
    return StubLlmStructuredClient()
