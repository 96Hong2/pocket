"""거래 API 스키마.

입력 경로(키패드·줄글·캡처·영수증)가 달라도 서버로 오는 형태는 하나다.
금액은 항상 양수이고 의미는 type 이 구분한다.

종류·입력경로·피드백 종류는 domain 의 enum 을 그대로 쓴다. 값 목록을 여기 다시 적지 않는다.
그래야 openapi.json 에 enum 이 실려 프론트 타입이 문자열로 뭉개지지 않는다.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domain.aggregation import TransactionSource, TransactionType
from app.domain.feedback import FeedbackKind

__all__ = [
    "FeedbackOut",
    "PeriodSummaryOut",
    "TransactionCreate",
    "TransactionCreated",
    "TransactionListOut",
    "TransactionOut",
    "TransactionUpdate",
]

# numeric(14,0) 상한. 넘으면 DB 가 아니라 여기서 막는다.
MAX_AMOUNT = Decimal("99999999999999")


def _integral_won(value: Decimal | None) -> Decimal | None:
    """원 단위 정수만 받는다. 소수를 조용히 반올림해 저장하지 않는다."""
    if value is None:
        return None
    if value != value.to_integral_value():
        raise ValueError("금액은 원 단위 정수여야 해요.")
    return value.quantize(Decimal(1))


class TransactionCreate(BaseModel):
    """표준 거래 형식. 파싱 결과와 손입력이 같은 형태로 들어온다."""

    # 시간대 없는 값은 받지 않는다. 서버가 임의로 해석하면 월 귀속이 어긋난다.
    occurred_at: AwareDatetime
    amount: Decimal = Field(ge=0, le=MAX_AMOUNT, description="원 단위 정수. 무지출일만 0")
    type: TransactionType = TransactionType.EXPENSE
    merchant: str | None = Field(default=None, max_length=120)
    category_id: uuid.UUID | None = None
    source: TransactionSource = TransactionSource.KEYPAD
    confidence: float = Field(default=1.0, ge=0, le=1)
    excluded_from_budget: bool = False
    refund_of_transaction_id: uuid.UUID | None = None

    _check_amount = field_validator("amount")(_integral_won)

    @model_validator(mode="after")
    def _zero_only_for_no_spend(self) -> TransactionCreate:
        # DB 제약(amount > 0 OR source = 'no_spend')과 같은 규칙을 API 에서도 지킨다.
        is_no_spend = self.source is TransactionSource.NO_SPEND
        if is_no_spend and self.amount != 0:
            raise ValueError("무지출일 기록의 금액은 0이어야 해요.")
        if not is_no_spend and self.amount <= 0:
            raise ValueError("금액은 0보다 커야 해요.")
        return self


class TransactionUpdate(BaseModel):
    """아직 라우트가 없다. 붙일 때 create 와 같은 검증을 공유한다(docs/API_CONTRACT.md)."""

    occurred_at: AwareDatetime | None = None
    amount: Decimal | None = Field(default=None, gt=0, le=MAX_AMOUNT)
    type: TransactionType | None = None
    merchant: str | None = Field(default=None, max_length=120)
    category_id: uuid.UUID | None = None
    excluded_from_budget: bool | None = None

    _check_amount = field_validator("amount")(_integral_won)


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    occurred_at: datetime
    amount: Decimal
    type: TransactionType
    merchant: str | None
    category_id: uuid.UUID | None
    source: TransactionSource
    confidence: float
    excluded_from_budget: bool


class TransactionListOut(BaseModel):
    items: list[TransactionOut]
    # 다음 페이지 커서. null 이면 끝이다.
    next_cursor: str | None = None


class FeedbackOut(BaseModel):
    """저장 직후 돌려주는 판정 결과.

    문장이 아니라 숫자와 종류만 준다. 문장 조립은 화면이 한다.
    """

    kind: FeedbackKind
    remaining_budget: Decimal | None = None
    daily_allowance: Decimal | None = None
    remaining_days: int | None = None
    over_amount: Decimal | None = None
    over_category_id: uuid.UUID | None = None
    saved_amount: Decimal | None = None
    month_expense: Decimal | None = None
    pace_ratio: Decimal | None = None
    projected_month_end: Decimal | None = None
    category_spend: Decimal | None = None
    category_budget_amount: Decimal | None = None
    large_expense_threshold: Decimal | None = None


class TransactionCreated(BaseModel):
    transaction: TransactionOut
    feedback: FeedbackOut
    # 되돌리기 가능 시간(초). 화면의 스낵바가 이 값을 쓴다.
    undo_window_seconds: int
    # 되돌리기 마감 시각(UTC). 화면은 이 절대 시각으로 센다. 기기 시계 차이를 없애기 위해서다.
    undo_until: datetime


class PeriodSummaryOut(BaseModel):
    period_start: date
    period_end: date
    month_expense: Decimal
    month_income: Decimal
    monthly_delta: Decimal
