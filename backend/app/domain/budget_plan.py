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
    "SavingSource",
    "SuggestionAmount",
    "SuggestionBlocker",
    "suggest_living_budget",
]


class SuggestionBlocker(StrEnum):
    """제안을 낼 수 없거나(끝난 달) 목표에서 몫을 못 낸 이유.

    끝난 달만 `available` 을 끈다. 나머지 셋은 목표저축을 0 으로 두고 제안은 낸다.
    화면은 이 값으로 목표저축 칸 아래 한 줄을 고른다.
    """

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
    # 화면이 「어느 목표의 몫인지」 적을 때 쓴다. 산식에는 안 들어간다.
    title: str = ""


class SavingSource(StrEnum):
    """목표저축 칸의 출처. 목표에서 옮긴 값인지, 사용자가 직접 적은 값인지, 낼 수 없어 0 인지."""

    GOAL = "goal"
    GIVEN = "given"
    # 목표가 없거나 몫을 낼 수 없어 0 으로 두었다. 왜인지는 `reason` 이 함께 말한다.
    NONE = "none"


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
    saving_source: SavingSource | None
    reason: SuggestionBlocker | None


def _blocked(reason: SuggestionBlocker) -> LivingBudgetPlan:
    return LivingBudgetPlan(
        available=False, suggested=None, goal_saving=None, saving_source=None, reason=reason
    )


def suggest_living_budget(
    *,
    take_home: Money,
    fixed_costs: Money,
    goal: GoalSavingBasis | None,
    is_period_open: bool,
    saving: Money | None = None,
) -> LivingBudgetPlan:
    """생활비 제안 하나. 목표가 정한 몫을 먼저 떼고 남는 만큼이다.

    끝난 달을 먼저 거른다. 목표가 어떻든 그 달 예산은 이제 정할 수 없어서, 다른 이유를
    말해 봐야 화면이 할 수 있는 일이 없다.

    **`saving` 을 직접 주면 목표를 보지 않는다.** 목표가 없거나 기한이 없는 사람도
    「매달 모을 돈」을 손으로 적어 생활비를 낼 수 있어야 한다. 목표가 없다고 계산기 자체를
    막으면, 목표부터 만들라는 말이 되어 예산을 정하러 온 사람이 돌아간다.

    **목표에서 몫을 낼 수 없으면 0 으로 두고 이유를 함께 준다.** 화면은 그 이유로 칸 아래
    한 줄을 고르고, 사람은 모을 만큼 적어 넣는다. 끝난 달만 진짜로 막는다.

    음수는 0 으로 붙인다. 실수령보다 목표와 고정비가 크면 생활비로 쓸 돈이 없다는 뜻이지
    마이너스로 살라는 뜻이 아니다.
    """
    if not is_period_open:
        return _blocked(SuggestionBlocker.CLOSED_PERIOD)

    if saving is not None:
        return _plan(take_home, fixed_costs, saving, SavingSource.GIVEN, None)

    if goal is None:
        return _plan(
            take_home, fixed_costs, Money.zero(), SavingSource.NONE, SuggestionBlocker.NO_GOAL
        )
    if not goal.has_deadline:
        return _plan(
            take_home, fixed_costs, Money.zero(), SavingSource.NONE, SuggestionBlocker.NO_DEADLINE
        )
    monthly = goal.monthly_saving
    if monthly is None:
        return _plan(
            take_home,
            fixed_costs,
            Money.zero(),
            SavingSource.NONE,
            SuggestionBlocker.NO_MONTHLY_SAVING,
        )

    return _plan(take_home, fixed_costs, monthly, SavingSource.GOAL, None)


def _plan(
    take_home: Money,
    fixed_costs: Money,
    saving: Money,
    source: SavingSource,
    reason: SuggestionBlocker | None,
) -> LivingBudgetPlan:
    return LivingBudgetPlan(
        available=True,
        suggested=(take_home - saving - fixed_costs).clamped_to_zero(),
        goal_saving=saving,
        saving_source=source,
        reason=reason,
    )
