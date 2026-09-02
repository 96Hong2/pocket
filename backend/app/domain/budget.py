"""예산 상태 계산.

remainingBudget  = budget.amount - budgetedSpend
dailyAllowance   = max(0, remainingBudget) / max(1, remainingDays)   내림
spendProgress    = budgetedSpend / budget.amount
paceRatio        = spendProgress / dateProgress
projected        = budgetedSpend / dateProgress
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.domain.money import Money, ratio
from app.domain.period import BudgetPeriod

__all__ = ["MIN_PROJECTION_ELAPSED_DAYS", "BudgetStatus", "evaluate_budget"]

# 초반 며칠은 표본이 적어 예측을 화면에 내보내지 않는다.
MIN_PROJECTION_ELAPSED_DAYS = 3


@dataclass(frozen=True)
class BudgetStatus:
    budget_amount: Money | None
    budgeted_spend: Money
    total_days: int
    elapsed_days: int
    remaining_days: int
    date_progress: Decimal
    projected_month_end: Money
    is_projection_reliable: bool
    remaining_budget: Money | None = None
    daily_allowance: Money | None = None
    spend_progress: Decimal | None = None
    pace_ratio: Decimal | None = None
    is_over_budget: bool = False

    @property
    def has_budget(self) -> bool:
        return self.budget_amount is not None


def evaluate_budget(
    *,
    budget_amount: Money | None,
    budgeted_spend: Money,
    period: BudgetPeriod,
    today: date,
) -> BudgetStatus:
    progress = period.progress(today)
    projected = budgeted_spend.divide(progress.date_progress)
    base = BudgetStatus(
        budget_amount=budget_amount,
        budgeted_spend=budgeted_spend,
        total_days=progress.total_days,
        elapsed_days=progress.elapsed_days,
        remaining_days=progress.remaining_days,
        date_progress=progress.date_progress,
        projected_month_end=projected,
        is_projection_reliable=progress.elapsed_days >= MIN_PROJECTION_ELAPSED_DAYS,
    )
    if budget_amount is None:
        return base

    remaining = budget_amount - budgeted_spend
    # 마지막 날에도 하루가 남은 것으로 보고 0 으로 나누지 않는다.
    divisor = max(1, progress.remaining_days)
    spend_progress = ratio(budgeted_spend, budget_amount)
    pace = spend_progress / progress.date_progress if spend_progress is not None else None
    return BudgetStatus(
        budget_amount=base.budget_amount,
        budgeted_spend=base.budgeted_spend,
        total_days=base.total_days,
        elapsed_days=base.elapsed_days,
        remaining_days=base.remaining_days,
        date_progress=base.date_progress,
        projected_month_end=base.projected_month_end,
        is_projection_reliable=base.is_projection_reliable,
        remaining_budget=remaining,
        daily_allowance=remaining.clamped_to_zero().divide_floor(divisor),
        spend_progress=spend_progress,
        pace_ratio=pace,
        is_over_budget=remaining.is_negative,
    )
