from app.domain.carryover import (
    BudgetSnapshot,
    CarryoverDecision,
    CategoryBudgetInput,
    decide_carryover,
)
from app.domain.money import won
from app.domain.period import BudgetPeriod

THIS_MONTH = BudgetPeriod.of_month(2026, 9)
LAST_MONTH = BudgetPeriod.of_month(2026, 8)

PREVIOUS = BudgetSnapshot(
    period=LAST_MONTH,
    amount=won(600_000),
    category_budgets=(
        CategoryBudgetInput("food", won(300_000)),
        CategoryBudgetInput("cafe", won(100_000)),
    ),
)


def test_현재_기간에_예산이_있으면_아무것도_하지_않는다():
    result = decide_carryover(
        current_budget=BudgetSnapshot(period=THIS_MONTH, amount=won(500_000)),
        previous_budget=PREVIOUS,
        auto_carryover_enabled=True,
        has_tombstone=False,
    )
    assert result.decision is CarryoverDecision.ALREADY_EXISTS
    assert result.should_copy is False
    assert result.amount is None


def test_자동_이어쓰기를_껐으면_복사하지_않는다():
    result = decide_carryover(
        current_budget=None,
        previous_budget=PREVIOUS,
        auto_carryover_enabled=False,
        has_tombstone=False,
    )
    assert result.decision is CarryoverDecision.DISABLED_BY_USER
    assert result.should_copy is False


def test_직전_기간에_예산이_없으면_만들지_않는다():
    result = decide_carryover(
        current_budget=None,
        previous_budget=None,
        auto_carryover_enabled=True,
        has_tombstone=False,
    )
    assert result.decision is CarryoverDecision.NO_PREVIOUS_BUDGET
    assert result.should_copy is False


def test_직전_예산과_카테고리_예산을_그대로_복사한다():
    result = decide_carryover(
        current_budget=None,
        previous_budget=PREVIOUS,
        auto_carryover_enabled=True,
        has_tombstone=False,
    )
    assert result.decision is CarryoverDecision.COPY
    assert result.should_copy is True
    assert result.amount == won(600_000)
    assert result.category_budgets == PREVIOUS.category_budgets
    assert result.is_auto_carried is True


def test_사용자가_자동_복사분을_지웠으면_다시_복사하지_않는다():
    result = decide_carryover(
        current_budget=None,
        previous_budget=PREVIOUS,
        auto_carryover_enabled=True,
        has_tombstone=True,
    )
    assert result.decision is CarryoverDecision.DELETED_BY_USER
    assert result.should_copy is False
    assert result.category_budgets == ()
