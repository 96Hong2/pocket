"""예산 API 스키마.

BudgetStateOut 은 홈 히어로가 쓰는 한 덩어리다. 예산 조회·거래 저장·거래 수정·기간 요약이
모두 같은 모양으로 실어 준다. 앱을 다시 열거나 되돌리기를 눌러 홈을 다시 그릴 때
어느 응답에서든 같은 필드로 채울 수 있어야 하기 때문이다.

게이지 비율(spend_progress)을 화면이 계산하지 못한다는 점이 중요하다.
`budget = remaining_budget + month_expense` 는 틀린다. month_expense 는 예산에서 뺀 거래를
포함하고 budgeted_spend 는 포함하지 않는다. 그래서 서버가 실어 준다.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.api.amounts import MAX_AMOUNT, integral_won, ratio_out
from app.domain.budget import BudgetStatus
from app.domain.money import Money, ratio
from app.domain.period import BudgetPeriod

__all__ = [
    "BudgetOut",
    "BudgetStateOut",
    "BudgetUpsert",
    "CategoryBudgetOut",
    "to_budget_state",
    "to_category_budget",
]


class BudgetUpsert(BaseModel):
    """예산 저장 요청. 같은 기간에 몇 번을 보내도 결과가 같다."""

    # 0원은 받지 않는다. '예산 없음'(amount null)과 구분되지 않는데다
    # 분모가 0 이라 게이지 비율이 null 이 되어 화면이 그릴 수 없다.
    amount: Decimal = Field(gt=0, le=MAX_AMOUNT, description="원 단위 정수. 1원 이상")

    _check_amount = field_validator("amount")(integral_won)


class BudgetStateOut(BaseModel):
    """예산 상태. 예산을 정하지 않은 것은 정상이고 그때 amount 가 null 이다."""

    period_start: date
    period_end: date
    # 정하지 않았으면 null. 이 값이 null 이면 아래 예산 기반 값도 전부 null 이다.
    amount: Decimal | None
    # 예산에 반영되는 지출. month_expense 와 달리 예산 제외 거래를 빼고 환불을 되돌린다.
    budgeted_spend: Decimal
    remaining_budget: Decimal | None
    daily_allowance: Decimal | None
    total_days: int
    elapsed_days: int
    remaining_days: int
    # 게이지 비율. budgeted_spend / amount 다.
    spend_progress: Decimal | None
    pace_ratio: Decimal | None
    projected_month_end: Decimal
    # 초반 며칠은 표본이 적어 예측을 화면에 내보내지 않는다.
    is_projection_reliable: bool
    is_over_budget: bool
    # 직전 기간에서 자동으로 복사된 예산인가. 안내 배너의 근거다.
    is_auto_carried: bool
    # 이 기간을 지금 고칠 수 있나. 예산이 없어도 기간만으로 정해진다.
    is_editable: bool


class CategoryBudgetOut(BaseModel):
    """카테고리 한 줄. 전체 예산 게이지와 같은 규칙으로 계산한다."""

    category_id: uuid.UUID
    amount: Decimal
    # 그 카테고리의 예산 반영 지출. 환불은 빼고 이체와 예산 제외 거래는 세지 않는다.
    budgeted_spend: Decimal
    # 넘겼으면 음수 그대로 둔다. 화면이 초과 금액을 그대로 쓴다.
    remaining: Decimal
    spend_progress: Decimal | None
    is_over_budget: bool


class BudgetOut(BaseModel):
    """예산 조회·저장 응답. 홈이 첫 화면을 고르는 근거를 함께 준다."""

    budget: BudgetStateOut
    # 정한 카테고리만 온다. 전체 예산이 없으면 빈 배열이다.
    category_budgets: list[CategoryBudgetOut]
    month_expense: Decimal
    month_income: Decimal
    # 수입 - 지출. 남은 예산과 다른 개념이라 따로 준다.
    monthly_delta: Decimal
    # 기록이 하나라도 있나. 없으면 첫 사용 화면이다.
    has_any_transaction: bool
    # 마지막 기록 이후 며칠. 오늘 기록했으면 0, 기록이 없으면 null.
    days_since_last_transaction: int | None


def _amount(value: Money | None) -> Decimal | None:
    return value.amount if value is not None else None


def to_budget_state(
    period: BudgetPeriod,
    status: BudgetStatus,
    *,
    is_auto_carried: bool,
    today: date,
) -> BudgetStateOut:
    """도메인 판정 결과를 응답 형태로 옮긴다. 여기서 숫자를 새로 만들지 않는다."""
    return BudgetStateOut(
        period_start=period.start,
        period_end=period.end,
        amount=_amount(status.budget_amount),
        budgeted_spend=status.budgeted_spend.amount,
        remaining_budget=_amount(status.remaining_budget),
        daily_allowance=_amount(status.daily_allowance),
        total_days=status.total_days,
        elapsed_days=status.elapsed_days,
        remaining_days=status.remaining_days,
        spend_progress=ratio_out(status.spend_progress),
        pace_ratio=ratio_out(status.pace_ratio),
        projected_month_end=status.projected_month_end.amount,
        is_projection_reliable=status.is_projection_reliable,
        is_over_budget=status.is_over_budget,
        is_auto_carried=is_auto_carried,
        is_editable=period.end >= today,
    )


def to_category_budget(
    category_id: uuid.UUID, amount: Money, budgeted_spend: Money
) -> CategoryBudgetOut:
    """카테고리 한 줄을 응답 형태로 만든다. 합계는 이미 집계가 끝난 값을 받는다."""
    remaining = amount - budgeted_spend
    return CategoryBudgetOut(
        category_id=category_id,
        amount=amount.amount,
        budgeted_spend=budgeted_spend.amount,
        remaining=remaining.amount,
        spend_progress=ratio_out(ratio(budgeted_spend, amount)),
        is_over_budget=remaining.is_negative,
    )
