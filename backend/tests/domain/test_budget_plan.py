"""목표에서 거꾸로 낸 생활비 제안.

제안을 낼 수 없는 경우에 0 이나 어림값을 만들지 않는 것이 여기 있는 검사의 핵심이다.
근거 없는 금액이 나오면 사용자가 그것을 그대로 예산으로 굳힌다.
"""

from __future__ import annotations

from app.domain.budget_plan import (
    GoalSavingBasis,
    SavingSource,
    SuggestionBlocker,
    suggest_living_budget,
)
from app.domain.money import Money, won


def deadline_goal(monthly: int | None = 1_000_000) -> GoalSavingBasis:
    return GoalSavingBasis(
        has_deadline=True, monthly_saving=None if monthly is None else won(monthly)
    )


def test_실수령에서_목표저축과_고정비를_뺀_값이_제안이다():
    result = suggest_living_budget(
        take_home=won(3_000_000),
        fixed_costs=won(900_000),
        goal=deadline_goal(1_000_000),
        is_period_open=True,
    )

    assert result.available is True
    assert result.goal_saving == won(1_000_000)
    assert result.suggested == won(1_100_000)
    assert result.reason is None


def test_목표와_고정비가_실수령보다_크면_0_이지_음수가_아니다():
    """마이너스로 살라는 뜻이 아니라 생활비로 쓸 돈이 없다는 뜻이다."""
    result = suggest_living_budget(
        take_home=won(1_000_000),
        fixed_costs=won(900_000),
        goal=deadline_goal(500_000),
        is_period_open=True,
    )

    assert result.suggested == Money.zero()


def test_목표가_없으면_목표저축_0_으로_제안하고_이유를_남긴다():
    """목표부터 만들라는 말이 되면 예산을 정하러 온 사람이 돌아간다. 0 으로 두고 적게 한다."""
    result = suggest_living_budget(
        take_home=won(3_000_000),
        fixed_costs=won(900_000),
        goal=None,
        is_period_open=True,
    )

    assert result.available is True
    assert result.suggested == won(2_100_000)
    assert result.goal_saving == Money.zero()
    assert result.saving_source is SavingSource.NONE
    assert result.reason is SuggestionBlocker.NO_GOAL


def test_기한이_없는_목표는_한_달_몫을_나눌_수_없어_0_으로_두고_이유를_남긴다():
    result = suggest_living_budget(
        take_home=won(3_000_000),
        fixed_costs=won(900_000),
        goal=GoalSavingBasis(has_deadline=False, monthly_saving=None),
        is_period_open=True,
    )

    assert result.available is True
    assert result.goal_saving == Money.zero()
    assert result.saving_source is SavingSource.NONE
    assert result.reason is SuggestionBlocker.NO_DEADLINE


def test_기한은_있는데_이번_달_몫이_없으면_기한_탓으로_돌리지_않는다():
    """이미 다 모았거나 기한이 지난 목표다. '기한이 없다' 와 다른 상황이라 이유도 다르다."""
    result = suggest_living_budget(
        take_home=won(3_000_000),
        fixed_costs=won(900_000),
        goal=deadline_goal(None),
        is_period_open=True,
    )

    assert result.available is True
    assert result.goal_saving == Money.zero()
    assert result.reason is SuggestionBlocker.NO_MONTHLY_SAVING


def test_끝난_달은_목표가_있어도_제안하지_않는다():
    """지난달 예산은 이제 정할 수 없다. 다른 이유를 말해 봐야 화면이 할 일이 없다."""
    result = suggest_living_budget(
        take_home=won(3_000_000),
        fixed_costs=won(900_000),
        goal=deadline_goal(1_000_000),
        is_period_open=False,
    )

    assert result.available is False
    assert result.reason is SuggestionBlocker.CLOSED_PERIOD


def test_목표저축을_직접_주면_목표가_없어도_제안한다():
    """목표부터 만들라는 말이 되면 예산을 정하러 온 사람이 돌아간다."""
    result = suggest_living_budget(
        take_home=won(3_000_000),
        fixed_costs=won(900_000),
        goal=None,
        is_period_open=True,
        saving=won(500_000),
    )

    assert result.available is True
    assert result.goal_saving == won(500_000)
    assert result.saving_source is SavingSource.GIVEN
    assert result.suggested == won(1_600_000)


def test_직접_준_목표저축이_목표의_몫보다_앞선다():
    result = suggest_living_budget(
        take_home=won(3_000_000),
        fixed_costs=won(900_000),
        goal=deadline_goal(1_000_000),
        is_period_open=True,
        saving=won(0),
    )

    assert result.goal_saving == Money.zero()
    assert result.saving_source is SavingSource.GIVEN
    assert result.suggested == won(2_100_000)


def test_목표에서_옮긴_몫은_출처가_goal_이다():
    result = suggest_living_budget(
        take_home=won(3_000_000),
        fixed_costs=won(900_000),
        goal=deadline_goal(1_000_000),
        is_period_open=True,
    )

    assert result.saving_source is SavingSource.GOAL
