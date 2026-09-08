"""목표에서 거꾸로 낸 생활비 제안.

실수령에서 이번 달 목표 몫과 고정비를 먼저 떼고 남는 만큼을 생활비로 잡는다.
저장하지 않는 제안이라 여기서 나오는 값은 화면이 보여주는 데까지만 쓴다.

**제안을 낼 수 없는 경우를 숫자로 메우지 않는다.** 목표가 없거나 이번 달 몫을 낼 수 없으면
0 이나 어림값을 만들지 않고 이유만 남긴다. 근거 없는 금액을 예산으로 굳히게 하지 않는다.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from app.domain.money import Money

__all__ = [
    "GoalSavingBasis",
    "LivingBudgetPlan",
    "SuggestionAmount",
    "SuggestionBlocker",
    "suggest_living_budget",
]


class SuggestionBlocker(StrEnum):
    """제안을 낼 수 없는 이유. 화면은 이 값을 보고 카드를 아예 그리지 않는다."""

    # 그 달이 이미 끝났다. 지난달 예산은 지금 정할 수 없으므로 제안할 것도 없다.
    CLOSED_PERIOD = "closed_period"
    NO_GOAL = "no_goal"
    # 기한이 없어 한 달에 얼마씩인지 나눌 수가 없다.
    NO_DEADLINE = "no_deadline"
    # 기한은 있는데 이번 달 몫이 없다. 이미 다 모았거나 기한이 지났을 때다.
    NO_MONTHLY_SAVING = "no_monthly_saving"


@dataclass(frozen=True)
class GoalSavingBasis:
    """목표에서 가져오는 것. 판정은 목표 쪽이 이미 끝냈고 여기서 다시 세지 않는다."""

    has_deadline: bool
    # 기한까지 닿으려면 이번 달에 떼어 둘 돈. 낼 수 없으면 None 이다.
    monthly_saving: Money | None


@dataclass(frozen=True)
class SuggestionAmount:
    """제안식의 한 칸. 값과 그 값이 어디서 왔는지를 함께 들고 있다."""

    amount: Money
    # 사용자가 화면에서 고쳐 보낸 값인가. 아니면 지난달에서 어림한 값이다.
    is_given: bool


@dataclass(frozen=True)
class LivingBudgetPlan:
    available: bool
    # 실수령 − 목표저축 − 고정비. 낼 수 없으면 None 이고 0 으로 메우지 않는다.
    suggested: Money | None
    goal_saving: Money | None
    reason: SuggestionBlocker | None


def _blocked(reason: SuggestionBlocker) -> LivingBudgetPlan:
    return LivingBudgetPlan(available=False, suggested=None, goal_saving=None, reason=reason)


def suggest_living_budget(
    *,
    take_home: Money,
    fixed_costs: Money,
    goal: GoalSavingBasis | None,
    is_period_open: bool,
) -> LivingBudgetPlan:
    """생활비 제안 하나. 목표가 정한 몫을 먼저 떼고 남는 만큼이다.

    끝난 달을 먼저 거른다. 목표가 어떻든 그 달 예산은 이제 정할 수 없어서, 다른 이유를
    말해 봐야 화면이 할 수 있는 일이 없다.

    음수는 0 으로 붙인다. 실수령보다 목표와 고정비가 크면 생활비로 쓸 돈이 없다는 뜻이지
    마이너스로 살라는 뜻이 아니다.
    """
    if not is_period_open:
        return _blocked(SuggestionBlocker.CLOSED_PERIOD)
    if goal is None:
        return _blocked(SuggestionBlocker.NO_GOAL)
    if not goal.has_deadline:
        return _blocked(SuggestionBlocker.NO_DEADLINE)
    saving = goal.monthly_saving
    if saving is None:
        return _blocked(SuggestionBlocker.NO_MONTHLY_SAVING)

    return LivingBudgetPlan(
        available=True,
        suggested=(take_home - saving - fixed_costs).clamped_to_zero(),
        goal_saving=saving,
        reason=None,
    )
