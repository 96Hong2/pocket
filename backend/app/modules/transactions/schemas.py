"""거래 API 스키마.

입력 경로(키패드·줄글·캡처·영수증)가 달라도 서버로 오는 형태는 하나다.
금액은 항상 양수이고 의미는 type 이 구분한다.

종류·입력경로·피드백 종류는 domain 의 enum 을 그대로 쓴다. 값 목록을 여기 다시 적지 않는다.
그래야 openapi.json 에 enum 이 실려 프론트 타입이 문자열로 뭉개지지 않는다.
금액 규칙은 app/api/amounts.py 하나를 예산 스키마와 함께 쓴다.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.api.amounts import MAX_AMOUNT, integral_won, ratio_out
from app.api.months import MAX_YEAR, MIN_YEAR
from app.domain.aggregation import TransactionSource, TransactionType
from app.domain.feedback import FeedbackKind, FeedbackResult
from app.domain.money import Money
from app.modules import ledger
from app.modules.budgets.schemas import BudgetStateOut

__all__ = [
    "CalendarDayOut",
    "CalendarMonthOut",
    "FeedbackOut",
    "PeriodSummaryOut",
    "TransactionCreate",
    "TransactionCreated",
    "TransactionListOut",
    "TransactionOut",
    "TransactionUpdate",
    "TransactionUpdated",
    "to_feedback",
]


def _as_utc(value: datetime) -> datetime:
    """돌려주는 시각에 시간대를 붙인다.

    PostgreSQL 은 붙여서 주고 SQLite 는 잃어버리고 준다. 검증 하네스만 SQLite 라
    시간대 없는 값이 응답으로 새어 나가고, 받는 쪽이 자기 시간대로 읽어 하루가 밀린다.
    """
    return ledger.as_utc(value) if isinstance(value, datetime) else value


def _in_range(value: datetime | None) -> datetime | None:
    """기간을 만들 수 없는 연도를 막는다.

    질의 파라미터에는 같은 방어가 이미 걸려 있는데 본문 시각만 빠져 있었다.
    `date(1, 1, 1)` 이나 `9999-12-31` 을 보내면 시간대 변환과 월 경계 계산이
    OverflowError 로 터져 500 이 되고, 저장이 성공한 경우에는 홈이 계속 어긋난다.
    """
    if value is None:
        return None
    if not MIN_YEAR <= value.year <= MAX_YEAR:
        raise ValueError(f"거래 시각은 {MIN_YEAR}년부터 {MAX_YEAR}년 사이여야 해요.")
    return value


def _clean_text(value: str | None) -> str | None:
    """NUL·제어문자를 막는다.

    PostgreSQL 은 text 에 NUL(0x00)을 넣지 못해 드라이버가 DataError 를 낸다.
    테스트가 SQLite 라 그대로 통과하고 운영에서만 500 이 된다. 여기서 422 로 떨어뜨린다.
    """
    if value is None:
        return None
    if any(ord(ch) < 0x20 or ord(ch) == 0x7F for ch in value):
        raise ValueError("상호에 넣을 수 없는 문자가 있어요.")
    return value


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

    _check_amount = field_validator("amount")(integral_won)
    _check_occurred_at = field_validator("occurred_at")(_in_range)
    _check_merchant = field_validator("merchant")(_clean_text)

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
    """보낸 필드만 고친다. 검증과 시각 정규화는 저장 경로와 같은 것을 쓴다."""

    occurred_at: AwareDatetime | None = None
    amount: Decimal | None = Field(default=None, gt=0, le=MAX_AMOUNT)
    type: TransactionType | None = None
    merchant: str | None = Field(default=None, max_length=120)
    category_id: uuid.UUID | None = None
    excluded_from_budget: bool | None = None

    _check_amount = field_validator("amount")(integral_won)
    _check_occurred_at = field_validator("occurred_at")(_in_range)
    _check_merchant = field_validator("merchant")(_clean_text)


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    # 시간대를 반드시 달고 나간다. SQLite 는 저장한 시간대를 잃어버리고 돌려주는데,
    # 그대로 실어 보내면 받는 쪽이 자기 시간대로 읽어 하루가 밀린다.
    occurred_at: AwareDatetime
    amount: Decimal
    type: TransactionType
    merchant: str | None
    category_id: uuid.UUID | None
    source: TransactionSource
    confidence: float
    excluded_from_budget: bool

    _stamp_occurred_at = field_validator("occurred_at", mode="before")(_as_utc)


class TransactionListOut(BaseModel):
    items: list[TransactionOut]
    # 다음 페이지 커서. null 이면 끝이다. 다음 요청의 cursor 로 그대로 넘긴다.
    next_cursor: str | None = None


class CalendarDayOut(BaseModel):
    """달력 한 칸. 집계에 잡히는 거래가 없는 날은 응답에 없다.

    expense 는 그날 환불을 뺀 값이라 음수가 될 수 있다.
    """

    day: date
    expense: Decimal
    income: Decimal


class CalendarMonthOut(BaseModel):
    period_start: date
    period_end: date
    days: list[CalendarDayOut]


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
    # 갱신된 예산 상태. 화면이 다시 부르지 않고 홈을 그린다.
    # 판정이 실패했을 때만 null 이고, 그때 feedback.kind 는 month_fact 로 떨어진다.
    budget: BudgetStateOut | None = None
    # 되돌리기 가능 시간(초). 화면의 스낵바가 이 값을 쓴다.
    undo_window_seconds: int
    # 되돌리기 마감 시각(UTC). 백그라운드에 다녀왔을 때 남은 시간을 보정하는 데 쓴다.
    undo_until: datetime


class TransactionUpdated(BaseModel):
    """수정 응답. 카테고리를 바꾸면 판정과 예산 상태가 달라져 함께 준다."""

    transaction: TransactionOut
    feedback: FeedbackOut
    budget: BudgetStateOut | None = None


class PeriodSummaryOut(BaseModel):
    period_start: date
    period_end: date
    month_expense: Decimal
    month_income: Decimal
    # 수입 - 지출. 남은 예산과 다른 개념이다.
    monthly_delta: Decimal
    # 예산 상태. 예산을 정하지 않았으면 budget.amount 가 null 이다.
    # 앱을 다시 열거나 되돌린 뒤 홈을 다시 그릴 때 이 블록으로 채운다.
    budget: BudgetStateOut


def _amount(value: Money | None) -> Decimal | None:
    return value.amount if value is not None else None


def to_feedback(result: FeedbackResult) -> FeedbackOut:
    """판정 결과를 응답 형태로 옮긴다. 문장은 만들지 않는다."""
    return FeedbackOut(
        kind=result.kind,
        remaining_budget=_amount(result.remaining_budget),
        daily_allowance=_amount(result.daily_allowance),
        remaining_days=result.remaining_days,
        over_amount=_amount(result.over_amount),
        over_category_id=uuid.UUID(result.over_category_id) if result.over_category_id else None,
        saved_amount=_amount(result.saved_amount),
        month_expense=_amount(result.month_expense),
        pace_ratio=ratio_out(result.pace_ratio),
        projected_month_end=_amount(result.projected_month_end),
        category_spend=_amount(result.category_spend),
        category_budget_amount=_amount(result.category_budget_amount),
        large_expense_threshold=_amount(result.large_expense_threshold),
    )
