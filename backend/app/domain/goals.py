"""목표 계산. 남은 금액과 필요 월저축액, 지금 페이스로 언제 닿는지를 낸다."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.domain.money import Money, periods_needed, ratio

__all__ = [
    "GoalInput",
    "GoalStatus",
    "evaluate_goal",
    "monthly_pace",
    "months_left",
    "months_spanned",
]


@dataclass(frozen=True)
class GoalInput:
    target_amount: Money
    current_amount: Money
    today: date
    target_date: date | None = None
    # 최근 페이스. 기여 이력이 없으면 None 이고 도달 예상도 내지 않는다.
    monthly_contribution: Money | None = None


@dataclass(frozen=True)
class GoalStatus:
    remaining: Money
    # 0~1. 목표를 넘겨도 1 에서 멈춘다. 게이지에 100% 를 넘겨 그릴 자리가 없다.
    progress: Decimal
    is_achieved: bool
    is_overdue: bool
    months_left: int | None = None
    required_monthly_saving: Money | None = None
    eta_months: int | None = None


def months_left(today: date, target_date: date) -> int:
    """이번 달을 포함해 남은 달 수. 기한이 지났으면 0."""
    if target_date < today:
        return 0
    return (target_date.year - today.year) * 12 + (target_date.month - today.month) + 1


def months_spanned(first: date, last: date) -> int:
    """두 날이 걸친 달 수. 양쪽 끝을 포함하고 최소 1 이다.

    같은 달이면 1 이고, `first` 가 `last` 보다 뒤여도 1 이다. 앞날짜로 적어 둔 기여
    한 건 때문에 0 이나 음수로 나누는 일이 없어야 한다.
    """
    months = (last.year - first.year) * 12 + (last.month - first.month) + 1
    return max(1, months)


def monthly_pace(contributions: Sequence[tuple[date, Money]], today: date) -> Money | None:
    """지금 페이스. 한 달에 얼마씩 모으고 있나.

    기여가 없으면 None 이고, 그때는 도달 예상도 내지 않는다. 있으면
    `기여 합 ÷ 첫 기여 달부터 이번 달까지의 달 수`(양쪽 끝 포함, 최소 1)다.

    내림으로 낸다. 올리면 실제보다 빠른 속도가 되어 아직 못 닿을 시점을 닿는다고 말한다.
    """
    if not contributions:
        return None
    first = min(day for day, _ in contributions)
    total = Money.total(amount for _, amount in contributions)
    return total.divide_floor(months_spanned(first, today))


def evaluate_goal(goal: GoalInput) -> GoalStatus:
    remaining = (goal.target_amount - goal.current_amount).clamped_to_zero()
    achieved = remaining.is_zero
    left = months_left(goal.today, goal.target_date) if goal.target_date is not None else None
    overdue = goal.target_date is not None and goal.target_date < goal.today and not achieved

    required = None
    if not achieved and left is not None and left > 0:
        required = remaining.divide_ceil(left)

    eta = (
        None
        if goal.monthly_contribution is None
        else periods_needed(remaining, goal.monthly_contribution)
    )

    return GoalStatus(
        remaining=remaining,
        progress=_progress(goal),
        is_achieved=achieved,
        is_overdue=overdue,
        months_left=left,
        required_monthly_saving=required,
        eta_months=eta,
    )


def _progress(goal: GoalInput) -> Decimal:
    """게이지 비율. 목표를 넘겨도 1 에서 멈추고, 모은 돈이 음수여도 0 아래로 가지 않는다."""
    filled = ratio(goal.current_amount, goal.target_amount)
    if filled is None:
        return Decimal(0)
    return min(Decimal(1), max(Decimal(0), filled))
