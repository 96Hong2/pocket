"""예산 상태 계산.

remainingBudget  = budget.amount - budgetedSpend
dailyAllowance   = max(0, remainingBudget) / max(1, remainingDays)   내림
weeklyAllowance  = dailyAllowance × weekDaysLeft
spendProgress    = budgetedSpend / budget.amount
paceRatio        = spendProgress / dateProgress
projected        = budgetedSpend / dateProgress

주간 가용액 정의는 ADR-0011 이다. 한 주는 월~일이고, 남은 날은 이번 기간 안에 있는 날만 센다.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.domain.money import Money, ratio
from app.domain.period import BudgetPeriod, week_containing

__all__ = [
    "MIN_PROJECTION_ELAPSED_DAYS",
    "BudgetStatus",
    "evaluate_budget",
    "week_days_left",
]

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
    # 오늘이 속한 주(월~일). 화면이 요일을 다시 세지 않게 창을 함께 준다.
    week_start: date
    week_end: date
    # 오늘 포함 이번 주에 남은 날 중 이 기간 안에 있는 날 수. 달 마지막 주에는 잘린다.
    week_days_left: int
    remaining_budget: Money | None = None
    daily_allowance: Money | None = None
    weekly_allowance: Money | None = None
    spend_progress: Decimal | None = None
    pace_ratio: Decimal | None = None
    is_over_budget: bool = False

    @property
    def has_budget(self) -> bool:
        return self.budget_amount is not None


def week_days_left(period: BudgetPeriod, today: date) -> int:
    """오늘 포함 이번 주에 남은 날 중 이 기간 안에 있는 날 수.

    기간 밖을 보고 있으면 0 이다. 달 마지막 주는 말일에서 잘리는데, 그 덕분에 주간 가용액이
    남은 예산을 넘지 않는다. 잘라 주지 않으면 다음 달로 넘어가는 날까지 세어, 마지막 주에
    "이번 주 쓸 수 있는 돈" 이 "남은 예산" 보다 커진다.
    """
    if not period.contains(today):
        return 0
    last = min(week_containing(today).end, period.end)
    return (last - today).days + 1


def evaluate_budget(
    *,
    budget_amount: Money | None,
    budgeted_spend: Money,
    period: BudgetPeriod,
    today: date,
) -> BudgetStatus:
    progress = period.progress(today)
    projected = budgeted_spend.divide(progress.date_progress)
    week = week_containing(today)
    days_left = week_days_left(period, today)
    base = BudgetStatus(
        budget_amount=budget_amount,
        budgeted_spend=budgeted_spend,
        total_days=progress.total_days,
        elapsed_days=progress.elapsed_days,
        remaining_days=progress.remaining_days,
        date_progress=progress.date_progress,
        projected_month_end=projected,
        is_projection_reliable=progress.elapsed_days >= MIN_PROJECTION_ELAPSED_DAYS,
        week_start=week.start,
        week_end=week.end,
        week_days_left=days_left,
    )
    if budget_amount is None:
        return base

    remaining = budget_amount - budgeted_spend
    # 마지막 날에도 하루가 남은 것으로 보고 0 으로 나누지 않는다.
    divisor = max(1, progress.remaining_days)
    daily = remaining.clamped_to_zero().divide_floor(divisor)
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
        week_start=base.week_start,
        week_end=base.week_end,
        week_days_left=base.week_days_left,
        remaining_budget=remaining,
        daily_allowance=daily,
        # 하루치를 남은 날 수만큼 곱한다. 남은 예산을 다시 나누지 않는다. 두 번 나누면
        # 하루치와 주간 값이 서로 안 맞아 화면의 두 줄이 다른 말을 한다.
        weekly_allowance=daily.scale(days_left),
        spend_progress=spend_progress,
        pace_ratio=pace,
        is_over_budget=remaining.is_negative,
    )
