"""LLM 파싱 결과 계약.

줄글 입력이든 캡처 입력이든 같은 후보 형태로 나온다.
여기서 나오는 값은 아직 '후보'다. 확정·중복판정·집계는 domain 이 한다.

LLM 은 구조화·분류만 한다. 금액 합계·잔액·증감 같은 계산을 시키지 않는다.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field

# 종류·입력경로는 domain 이 정본이다. 여기서 값 목록을 다시 적지 않는다.
from app.domain.aggregation import TransactionSource, TransactionType
from app.domain.categories import expense_category_names

# 프롬프트와 스텁이 참고하는 분류 이름. 정본은 app/domain/categories.py 다.
DEFAULT_CATEGORY_HINTS: tuple[str, ...] = expense_category_names()

# 이 값 아래는 사용자 확인 없이 확정하지 않는다.
LOW_CONFIDENCE_THRESHOLD = 0.5


class ExtractedTransaction(BaseModel):
    """LLM 이 채우는 부분. 여기에 계산 결과를 담지 않는다."""

    model_config = ConfigDict(extra="forbid")

    occurred_at: date | None = Field(
        default=None,
        description="거래 날짜. 입력에서 알 수 없으면 null 로 둔다. 추측하지 않는다.",
    )
    amount: int = Field(
        gt=0,
        description="금액. 부호 없는 정수(원). 의미는 type 이 구분한다.",
    )
    type: TransactionType = Field(
        description="expense 지출 / income 수입 / transfer 이체 / refund 환불",
    )
    merchant: str | None = Field(
        default=None,
        max_length=120,
        description="가맹점 또는 메모. 없으면 null.",
    )
    category: str | None = Field(
        default=None,
        max_length=40,
        description="분류 이름 후보. 확실하지 않으면 null.",
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="이 후보를 얼마나 믿을 수 있는지. 0~1.",
    )

    @property
    def is_low_confidence(self) -> bool:
        return self.confidence < LOW_CONFIDENCE_THRESHOLD


class TransactionExtraction(BaseModel):
    """LLM Structured Output 최상위 스키마."""

    model_config = ConfigDict(extra="forbid")

    candidates: list[ExtractedTransaction] = Field(default_factory=list)


class TransactionCandidate(ExtractedTransaction):
    """입력 경로(source)까지 붙인 후보. domain 이 이걸 받아 확정 여부를 정한다."""

    source: TransactionSource


class ParseMeta(BaseModel):
    """이 결과가 어디서 나왔는지. 스텁 결과를 진짜 성공으로 오해하지 않게 한다."""

    model_config = ConfigDict(extra="forbid")

    provider: str
    is_stub: bool = False
    model: str | None = None
    notes: list[str] = Field(default_factory=list)


class ParseResult(BaseModel):
    """줄글 파싱과 캡처 파싱이 공통으로 돌려주는 형태."""

    model_config = ConfigDict(extra="forbid")

    candidates: list[TransactionCandidate] = Field(default_factory=list)
    meta: ParseMeta

    @property
    def has_candidate(self) -> bool:
        return bool(self.candidates)


def attach_source(
    extraction: TransactionExtraction, source: TransactionSource
) -> list[TransactionCandidate]:
    """LLM 결과에 입력 경로를 붙인다. source 는 LLM 이 아니라 호출자가 안다."""
    return [
        TransactionCandidate(**item.model_dump(), source=source) for item in extraction.candidates
    ]
