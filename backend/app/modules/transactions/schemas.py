"""거래 API 스키마.

입력 경로(키패드·줄글·캡처·영수증)가 달라도 서버로 오는 형태는 하나다.
금액은 항상 양수이고 의미는 type 이 구분한다.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

__all__ = [
    "FeedbackOut",
    "TransactionCreate",
    "TransactionListOut",
    "TransactionOut",
    "TransactionUpdate",
]

TxType = str
TxSource = str


class TransactionCreate(BaseModel):
    """표준 거래 형식. 파싱 결과와 손입력이 같은 형태로 들어온다."""

    occurred_at: datetime
    amount: Decimal = Field(gt=0, description="원 단위 양수")
    type: TxType = Field(pattern="^(expense|income|transfer|refund)$")
    merchant: str | None = Field(default=None, max_length=120)
    category_id: uuid.UUID | None = None
    source: TxSource = Field(
        default="keypad",
        pattern="^(keypad|nl|screenshot|receipt|asset_screenshot|no_spend)$",
    )
    confidence: float = Field(default=1.0, ge=0, le=1)
    excluded_from_budget: bool = False
    refund_of_transaction_id: uuid.UUID | None = None


class TransactionUpdate(BaseModel):
    occurred_at: datetime | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    type: TxType | None = Field(default=None, pattern="^(expense|income|transfer|refund)$")
    merchant: str | None = Field(default=None, max_length=120)
    category_id: uuid.UUID | None = None
    excluded_from_budget: bool | None = None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    occurred_at: datetime
    amount: Decimal
    type: TxType
    merchant: str | None
    category_id: uuid.UUID | None
    source: TxSource
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

    kind: str
    remaining_budget: Decimal | None = None
    daily_allowance: Decimal | None = None
    remaining_days: int | None = None
    over_amount: Decimal | None = None
    saved_amount: Decimal | None = None
    month_expense: Decimal | None = None
    pace_ratio: Decimal | None = None
    category_spend: Decimal | None = None
    category_budget_amount: Decimal | None = None


class TransactionCreated(BaseModel):
    transaction: TransactionOut
    feedback: FeedbackOut
    # 되돌리기 가능 시간(초). 화면의 스낵바가 이 값을 쓴다.
    undo_window_seconds: int = 8


class PeriodSummaryOut(BaseModel):
    period_start: date
    period_end: date
    month_expense: Decimal
    month_income: Decimal
    monthly_delta: Decimal
