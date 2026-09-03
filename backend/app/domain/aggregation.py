"""거래 집계. 종류별 반영 규칙이 여기 한 곳에 모인다.

| 종류     | 이번달 지출 | 이번달 수입 | 차액    | 남은 예산 | 카테고리 지출 |
|----------|-------------|-------------|---------|-----------|---------------|
| expense  | +amount     | -           | -amount | -amount   | +amount       |
| income   | -           | +amount     | +amount | 영향 없음 | 영향 없음     |
| transfer | 제외        | 제외        | 제외    | 제외      | 제외          |
| refund   | -amount     | 제외        | +amount | +amount   | -amount       |

excluded_from_budget 인 거래는 예산 계산에서만 빠지고 목록·리포트에는 남는다.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum

from app.domain.money import Money
from app.domain.period import BudgetPeriod

__all__ = [
    "DayTotals",
    "PeriodTotals",
    "TransactionInput",
    "TransactionSource",
    "TransactionType",
    "aggregate_days",
    "aggregate_period",
]


class TransactionType(StrEnum):
    """거래 종류의 유일한 정의. models·schemas·llm 이 전부 이걸 가져다 쓴다."""

    EXPENSE = "expense"
    INCOME = "income"
    TRANSFER = "transfer"
    REFUND = "refund"


class TransactionSource(StrEnum):
    """어떤 입력 경로로 들어왔는지. 값을 늘릴 때 고칠 자리는 여기 하나다."""

    KEYPAD = "keypad"
    NL = "nl"
    SCREENSHOT = "screenshot"
    RECEIPT = "receipt"
    ASSET_SCREENSHOT = "asset_screenshot"
    NO_SPEND = "no_spend"


@dataclass(frozen=True)
class TransactionInput:
    """집계에 필요한 것만 담은 거래 값 객체. amount 는 항상 양수."""

    occurred_on: date
    amount: Money
    type: TransactionType
    category_id: str | None = None
    excluded_from_budget: bool = False
    is_deleted: bool = False


@dataclass(frozen=True)
class PeriodTotals:
    budgeted_spend: Money
    month_expense: Money
    month_income: Money
    monthly_delta: Money
    # 리포트용: excluded 포함
    category_spend: dict[str | None, Money] = field(default_factory=dict)
    # 예산용: excluded 제외
    category_budgeted_spend: dict[str | None, Money] = field(default_factory=dict)


def aggregate_period(
    transactions: Iterable[TransactionInput],
    period: BudgetPeriod,
) -> PeriodTotals:
    """기간 안의 거래를 집계한다. 삭제·기간 밖 거래는 버린다."""
    budgeted_spend = Money.zero()
    month_expense = Money.zero()
    month_income = Money.zero()
    category_spend: dict[str | None, Money] = {}
    category_budgeted_spend: dict[str | None, Money] = {}

    for tx in transactions:
        if tx.is_deleted or not period.contains(tx.occurred_on):
            continue
        if tx.type is TransactionType.TRANSFER:
            continue

        if tx.type is TransactionType.INCOME:
            month_income = month_income + tx.amount
            continue

        signed = tx.amount if tx.type is TransactionType.EXPENSE else -tx.amount
        month_expense = month_expense + signed
        _accumulate(category_spend, tx.category_id, signed)
        if not tx.excluded_from_budget:
            budgeted_spend = budgeted_spend + signed
            _accumulate(category_budgeted_spend, tx.category_id, signed)

    return PeriodTotals(
        budgeted_spend=budgeted_spend,
        month_expense=month_expense,
        month_income=month_income,
        monthly_delta=month_income - month_expense,
        category_spend=category_spend,
        category_budgeted_spend=category_budgeted_spend,
    )


def _accumulate(bucket: dict[str | None, Money], category_id: str | None, amount: Money) -> None:
    bucket[category_id] = bucket.get(category_id, Money.zero()) + amount


@dataclass(frozen=True)
class DayTotals:
    """달력 한 칸에 들어갈 하루 합계.

    환불이 그날 지출을 깎으므로 expense 는 음수가 될 수 있다. 0 으로 붙이지 않는다.
    예산 제외 거래도 목록에 남으므로 여기서는 센다. 빠지는 것은 예산 계산에서다.
    """

    day: date
    expense: Money
    income: Money


def aggregate_days(
    transactions: Iterable[TransactionInput],
    period: BudgetPeriod,
) -> list[DayTotals]:
    """날짜별 지출·수입을 날짜순으로 접는다. 규칙은 위 표와 같다.

    집계에 잡히는 거래가 하나도 없는 날은 결과에 넣지 않는다. 이체만 있는 날도 마찬가지다.
    달력 격자는 빈 칸을 스스로 채우므로, 값이 0 인 날을 굳이 실어 보내지 않는다.
    """
    expenses: dict[date, Money] = {}
    incomes: dict[date, Money] = {}

    for tx in transactions:
        if tx.is_deleted or not period.contains(tx.occurred_on):
            continue
        if tx.type is TransactionType.TRANSFER:
            continue

        if tx.type is TransactionType.INCOME:
            incomes[tx.occurred_on] = incomes.get(tx.occurred_on, Money.zero()) + tx.amount
            continue

        signed = tx.amount if tx.type is TransactionType.EXPENSE else -tx.amount
        expenses[tx.occurred_on] = expenses.get(tx.occurred_on, Money.zero()) + signed

    days = sorted(expenses.keys() | incomes.keys())
    return [
        DayTotals(
            day=day,
            expense=expenses.get(day, Money.zero()),
            income=incomes.get(day, Money.zero()),
        )
        for day in days
    ]
