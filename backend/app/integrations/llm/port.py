"""LLM 포트.

앱 코드는 이 프로토콜만 안다. provider SDK 는 이 패키지 밖으로 새지 않는다.

계약은 Structured Output + schema validation 이다.
호출자가 pydantic 모델을 주고, 구현체는 그 모델로 검증된 인스턴스만 돌려준다.
검증에 실패하면 예외로 올린다. 반쯤 맞는 dict 를 돌려주지 않는다.

LLM 에게 숫자 계산을 시키지 않는다. 파싱과 분류만 시킨다.
합계·잔액·증감·페이스는 domain 이 결정적으로 계산한다.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, TypeVar, runtime_checkable

from pydantic import BaseModel

from app.integrations.llm.contracts import ParseMeta

SchemaT = TypeVar("SchemaT", bound=BaseModel)


class LlmError(Exception):
    """LLM 호출 실패."""

    @property
    def retryable(self) -> bool:
        return False


class LlmUnavailableError(LlmError):
    """지금은 부를 수 없다. 잠시 뒤 다시 시도할 수 있다."""

    @property
    def retryable(self) -> bool:
        return True


class LlmSchemaError(LlmError):
    """응답이 요청한 스키마를 만족하지 못했다."""


class LlmInputError(LlmError):
    """입력이 잘못됐다. text 와 image 중 정확히 하나가 필요하다."""


@dataclass(frozen=True, slots=True)
class LlmImage:
    """캡처 입력. 원문을 저장하거나 로그에 남기지 않는다."""

    media_type: str
    data: bytes

    def __repr__(self) -> str:
        # 실수로 로그에 원문이 찍히지 않게 한다.
        return f"LlmImage(media_type={self.media_type!r}, bytes={len(self.data)})"


@runtime_checkable
class LlmStructuredClient(Protocol):
    """구조화 추출 클라이언트."""

    @property
    def provider(self) -> str: ...

    @property
    def is_stub(self) -> bool: ...

    async def extract(
        self,
        *,
        prompt: str,
        schema: type[SchemaT],
        text: str | None = None,
        image: LlmImage | None = None,
    ) -> SchemaT: ...


def build_meta(
    client: LlmStructuredClient,
    *,
    model: str | None = None,
    notes: list[str] | None = None,
) -> ParseMeta:
    """응답 메타. 스텁이면 그 사실이 그대로 드러난다."""
    return ParseMeta(
        provider=client.provider,
        is_stub=client.is_stub,
        model=model,
        notes=list(notes or []),
    )


def require_single_input(text: str | None, image: LlmImage | None) -> None:
    if (text is None) == (image is None):
        raise LlmInputError("text 와 image 중 하나만 넣어야 한다")
