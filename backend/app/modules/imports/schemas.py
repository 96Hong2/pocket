"""줄글·캡처 입력의 검토 단위 스키마.

여기서 나오는 것은 아직 거래가 아니라 **후보**다. 저장은 commit 이 따로 한다.
저신뢰 후보를 조용히 확정하지 않으려고 선택 여부를 서버가 들고 있는다.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import AwareDatetime, BaseModel, Field, field_validator, model_validator

from app.api.amounts import MAX_AMOUNT, integral_won
from app.api.months import MAX_YEAR, MIN_YEAR
from app.domain.aggregation import TransactionSource, TransactionType
from app.integrations.llm import LOW_CONFIDENCE_THRESHOLD, LlmStructuredClient
from app.models.import_batch import ImportBatch, ImportBatchStatus, ImportCandidate
from app.modules.budgets.schemas import BudgetStateOut
from app.modules.transactions.schemas import FeedbackOut

__all__ = [
    "MAX_TEXT_LENGTH",
    "ImportBatchOut",
    "ImportCandidateOut",
    "ImportCandidatePatch",
    "ImportCommitOut",
    "ImportMetaOut",
    "ImportTextIn",
]

# 한 번에 받아 주는 줄글 길이. 캡처 붙여넣기까지 생각해도 넉넉하다.
MAX_TEXT_LENGTH = 1000


class ImportTextIn(BaseModel):
    """줄글 한 덩어리. 여러 건이 들어 있을 수 있다."""

    text: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)


class ImportMetaOut(BaseModel):
    """이 결과가 어디서 나왔는지. 스텁 결과를 진짜 성공으로 오해하지 않게 한다."""

    provider: str
    is_stub: bool
    notes: list[str] = Field(default_factory=list)


class ImportCandidateOut(BaseModel):
    id: uuid.UUID
    occurred_at: datetime
    amount: Decimal
    type: TransactionType
    merchant: str | None = None
    category_id: uuid.UUID | None = None
    # 확신이 낮으면 화면이 점선으로 표시하고 기본 선택에서 뺀다.
    confidence: float
    is_low_confidence: bool
    is_duplicate: bool
    is_selected: bool


class ImportBatchOut(BaseModel):
    id: uuid.UUID
    source: TransactionSource
    status: ImportBatchStatus
    detected_count: int
    # 상한을 넘겨 버린 건수 같은, 화면이 알려야 할 사정. 원문은 담지 않는다.
    error_code: str | None = None
    # 지금 고른 것의 건수. 저장 버튼에 그대로 적는다.
    selected_count: int
    # 고른 것 중 **지출**만 더한 값. 수입·이체를 지출과 한 덩어리로 더하면
    # "2건 저장 · 21,000원" 이 실제로 쓴 돈과 달라진다.
    selected_expense_total: Decimal
    meta: ImportMetaOut
    candidates: list[ImportCandidateOut] = Field(default_factory=list)


class ImportCandidatePatch(BaseModel):
    """후보 한 줄 고치기. 보낸 항목만 바뀐다.

    `merchant` 와 `category_id` 는 명시적으로 null 을 보내면 비운다.
    '안 보냄' 과 'null 로 보냄' 을 가르려고 라우터가 exclude_unset 으로 넘긴다.
    """

    occurred_at: AwareDatetime | None = None
    amount: Decimal | None = Field(default=None, gt=0, le=MAX_AMOUNT)
    type: TransactionType | None = None
    merchant: str | None = Field(default=None, max_length=120)
    category_id: uuid.UUID | None = None
    is_selected: bool | None = None

    _check_amount = field_validator("amount")(integral_won)

    @field_validator("occurred_at")
    @classmethod
    def _in_range(cls, value: datetime | None) -> datetime | None:
        """기간을 만들 수 없는 연도를 막는다. 거래 저장과 같은 규칙을 쓴다."""
        if value is not None and not MIN_YEAR <= value.year <= MAX_YEAR:
            raise ValueError(f"거래 시각은 {MIN_YEAR}년부터 {MAX_YEAR}년 사이여야 해요.")
        return value

    @model_validator(mode="after")
    def _reject_explicit_nulls(self) -> ImportCandidatePatch:
        """비울 수 없는 값에 null 을 보내면 막는다.

        `merchant` 와 `category_id` 만 '비우기' 가 있다. 나머지에 null 이 들어오면
        그대로 컬럼에 써서 NOT NULL 위반이나 엉뚱한 409 로 죽는다.
        """
        for field in ("amount", "type", "is_selected", "occurred_at"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} 는 비울 수 없어요.")
        return self


class ImportCommitOut(BaseModel):
    """저장 결과. 마지막 한 건 기준으로 지금 돈 상태를 함께 준다."""

    batch: ImportBatchOut
    created_count: int
    total_amount: Decimal
    feedback: FeedbackOut | None = None
    budget: BudgetStateOut | None = None


def to_candidate(row: ImportCandidate) -> ImportCandidateOut:
    return ImportCandidateOut(
        id=row.id,
        occurred_at=row.occurred_at,
        amount=row.amount,
        type=row.type,
        merchant=row.merchant,
        category_id=row.category_id,
        confidence=row.confidence,
        is_low_confidence=row.confidence < LOW_CONFIDENCE_THRESHOLD,
        is_duplicate=row.is_duplicate,
        is_selected=row.is_selected,
    )


def to_batch(batch: ImportBatch, *, client: LlmStructuredClient) -> ImportBatchOut:
    """검토 단위를 응답 형태로 옮긴다.

    고른 건수와 합계는 여기서 센다. 화면이 다시 더하면 두 곳의 계산이 어긋난다.
    """
    candidates = [to_candidate(row) for row in batch.candidates]
    chosen = [item for item in candidates if item.is_selected]
    spent = [item.amount for item in chosen if item.type == TransactionType.EXPENSE]
    return ImportBatchOut(
        id=batch.id,
        source=batch.source,
        status=batch.status,
        detected_count=batch.detected_count,
        error_code=batch.error_code,
        selected_count=len(chosen),
        selected_expense_total=sum(spent, Decimal(0)),
        meta=ImportMetaOut(provider=client.provider, is_stub=client.is_stub),
        candidates=candidates,
    )
