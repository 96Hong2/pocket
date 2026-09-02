"""목표 계산. 남은 금액과 필요 월저축액, 지금 페이스로 언제 닿는지를 낸다."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.domain.money import Money, periods_needed

__all__ = ["GoalInput", "GoalStatus", "evaluate_goal", "months_left"]


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
        is_achieved=achieved,
        is_overdue=overdue,
        months_left=left,
        required_monthly_saving=required,
        eta_months=eta,
    )
