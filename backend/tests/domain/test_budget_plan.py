"""목표에서 거꾸로 낸 생활비 제안.

제안을 낼 수 없는 경우에 0 이나 어림값을 만들지 않는 것이 여기 있는 검사의 핵심이다.
근거 없는 금액이 나오면 사용자가 그것을 그대로 예산으로 굳힌다.
"""

from __future__ import annotations

from app.domain.budget_plan import (
    GoalSavingBasis,
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


def test_목표가_없으면_제안하지_않고_이유를_남긴다():
    result = suggest_living_budget(
        take_home=won(3_000_000),
        fixed_costs=won(900_000),
        goal=None,
        is_period_open=True,
    )

    assert result.available is False
    assert result.suggested is None
    assert result.goal_saving is None
    assert result.reason is SuggestionBlocker.NO_GOAL


def test_기한이_없는_목표는_한_달_몫을_나눌_수_없어_제안하지_않는다():
    result = suggest_living_budget(
        take_home=won(3_000_000),
        fixed_costs=won(900_000),
        goal=GoalSavingBasis(has_deadline=False, monthly_saving=None),
        is_period_open=True,
    )

    assert result.available is False
    assert result.reason is SuggestionBlocker.NO_DEADLINE


def test_기한은_있는데_이번_달_몫이_없으면_기한_탓으로_돌리지_않는다():
    """이미 다 모았거나 기한이 지난 목표다. '기한이 없다' 와 다른 상황이라 이유도 다르다."""
    result = suggest_living_budget(
        take_home=won(3_000_000),
        fixed_costs=won(900_000),
        goal=deadline_goal(None),
        is_period_open=True,
    )

    assert result.available is False
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
