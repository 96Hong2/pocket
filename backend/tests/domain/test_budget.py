from datetime import date
from decimal import Decimal

from app.domain.budget import BudgetStatus, evaluate_budget
from app.domain.money import Money, won
from app.domain.period import BudgetPeriod

PERIOD = BudgetPeriod.of_month(2026, 9)


def status(
    *, budget: int | None, spend: int, day: int = 10, period: BudgetPeriod = PERIOD
) -> BudgetStatus:
    return evaluate_budget(
        budget_amount=None if budget is None else won(budget),
        budgeted_spend=won(spend),
        period=period,
        today=date(2026, 9, day),
    )


def test_예산이_없으면_남은_예산과_하루_가용액을_말하지_않는다():
    result = status(budget=None, spend=200_000)
    assert not result.has_budget
    assert result.remaining_budget is None
    assert result.daily_allowance is None
    assert result.spend_progress is None
    assert result.pace_ratio is None
    assert result.is_over_budget is False
    # 예측은 예산이 없어도 낼 수 있다
    assert result.projected_month_end == won(600_000)


def test_페이스대로_쓰면_비율이_1_이_된다():
    result = status(budget=600_000, spend=200_000)
    assert result.remaining_budget == won(400_000)
    assert result.date_progress == Decimal(10) / Decimal(30)
    assert result.pace_ratio == Decimal(1)
    assert result.projected_month_end == won(600_000)
    assert result.is_over_budget is False


def test_하루_가용액은_남은_예산을_남은_일수로_나눈_내림이다():
    result = status(budget=600_000, spend=200_000)
    assert result.remaining_days == 21
    assert result.daily_allowance == won(19_047)


def test_남은_예산이_음수면_하루_가용액은_0_이다():
    result = status(budget=300_000, spend=500_000)
    assert result.remaining_budget == won(-200_000)
    assert result.is_over_budget is True
    assert result.daily_allowance == Money.zero()


def test_말일에도_0_으로_나누지_않는다():
    result = status(budget=600_000, spend=300_000, day=30)
    assert result.remaining_days == 1
    assert result.daily_allowance == won(300_000)


def test_기간이_지나_남은_일수가_0_이어도_계산이_깨지지_않는다():
    result = evaluate_budget(
        budget_amount=won(600_000),
        budgeted_spend=won(300_000),
        period=PERIOD,
        today=date(2026, 10, 3),
    )
    assert result.remaining_days == 0
    assert result.daily_allowance == won(300_000)


def test_초반_사흘_전에는_예측을_믿을_수_없다고_표시한다():
    assert status(budget=600_000, spend=100_000, day=2).is_projection_reliable is False
    assert status(budget=600_000, spend=100_000, day=3).is_projection_reliable is True


def test_예산이_0_이면_진행률_대신_초과만_말한다():
    result = status(budget=0, spend=10_000)
    assert result.spend_progress is None
    assert result.pace_ratio is None
    assert result.remaining_budget == won(-10_000)
    assert result.is_over_budget is True


def test_2월_같은_짧은_달도_그대로_계산한다():
    february = BudgetPeriod.of_month(2024, 2)
    result = evaluate_budget(
        budget_amount=won(290_000),
        budgeted_spend=won(100_000),
        period=february,
        today=date(2024, 2, 29),
    )
    assert result.total_days == 29
    assert result.elapsed_days == 29
    assert result.remaining_days == 1
    assert result.daily_allowance == won(190_000)
