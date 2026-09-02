from datetime import date

from app.domain.aggregation import (
    PeriodTotals,
    TransactionInput,
    TransactionType,
    aggregate_period,
)
from app.domain.money import Money, won
from app.domain.period import BudgetPeriod

PERIOD = BudgetPeriod.of_month(2026, 9)


def tx(
    amount: int,
    type: TransactionType,
    *,
    day: int = 10,
    category_id: str | None = "food",
    excluded: bool = False,
    deleted: bool = False,
) -> TransactionInput:
    return TransactionInput(
        occurred_on=date(2026, 9, day),
        amount=won(amount),
        type=type,
        category_id=category_id,
        excluded_from_budget=excluded,
        is_deleted=deleted,
    )


def totals(*transactions: TransactionInput) -> PeriodTotals:
    return aggregate_period(transactions, PERIOD)


def test_지출은_지출_차액_예산_카테고리에_모두_반영된다():
    result = totals(tx(12_000, TransactionType.EXPENSE))
    assert result.month_expense == won(12_000)
    assert result.budgeted_spend == won(12_000)
    assert result.monthly_delta == won(-12_000)
    assert result.category_spend["food"] == won(12_000)
    assert result.category_budgeted_spend["food"] == won(12_000)


def test_수입은_수입과_차액에만_들어가고_예산과_카테고리에는_없다():
    result = totals(tx(3_000_000, TransactionType.INCOME, category_id="salary"))
    assert result.month_income == won(3_000_000)
    assert result.monthly_delta == won(3_000_000)
    assert result.month_expense == Money.zero()
    assert result.budgeted_spend == Money.zero()
    assert result.category_spend == {}


def test_이체는_지출_수입_차액_예산_카테고리_어디에도_안_들어간다():
    result = totals(
        tx(500_000, TransactionType.TRANSFER, category_id="saving"),
        tx(10_000, TransactionType.EXPENSE),
    )
    assert result.month_expense == won(10_000)
    assert result.month_income == Money.zero()
    assert result.monthly_delta == won(-10_000)
    assert result.budgeted_spend == won(10_000)
    assert "saving" not in result.category_spend
    assert "saving" not in result.category_budgeted_spend


def test_환불은_지출과_예산과_카테고리를_깎고_수입에는_안_들어간다():
    result = totals(
        tx(50_000, TransactionType.EXPENSE),
        tx(20_000, TransactionType.REFUND),
    )
    assert result.month_expense == won(30_000)
    assert result.budgeted_spend == won(30_000)
    assert result.month_income == Money.zero()
    assert result.monthly_delta == won(-30_000)
    assert result.category_spend["food"] == won(30_000)


def test_예산제외_지출은_예산에서만_빠지고_리포트에는_남는다():
    result = totals(
        tx(10_000, TransactionType.EXPENSE),
        tx(200_000, TransactionType.EXPENSE, category_id="health", excluded=True),
    )
    assert result.month_expense == won(210_000)
    assert result.budgeted_spend == won(10_000)
    assert result.category_spend["health"] == won(200_000)
    assert "health" not in result.category_budgeted_spend


def test_예산제외_환불은_예산도_되돌리지_않는다():
    result = totals(
        tx(200_000, TransactionType.EXPENSE, category_id="health", excluded=True),
        tx(50_000, TransactionType.REFUND, category_id="health", excluded=True),
    )
    assert result.month_expense == won(150_000)
    assert result.budgeted_spend == Money.zero()
    assert result.category_spend["health"] == won(150_000)


def test_삭제되었거나_기간_밖이면_집계하지_않는다():
    outside = TransactionInput(
        occurred_on=date(2026, 8, 31),
        amount=won(99_000),
        type=TransactionType.EXPENSE,
    )
    result = aggregate_period(
        [
            tx(10_000, TransactionType.EXPENSE),
            tx(70_000, TransactionType.EXPENSE, deleted=True),
            outside,
        ],
        PERIOD,
    )
    assert result.month_expense == won(10_000)
    assert result.budgeted_spend == won(10_000)


def test_카테고리가_없으면_미분류로_모인다():
    result = totals(tx(4_000, TransactionType.EXPENSE, category_id=None))
    assert result.category_spend[None] == won(4_000)


def test_환불이_지출보다_크면_카테고리_지출이_음수가_된다():
    result = totals(
        tx(10_000, TransactionType.EXPENSE),
        tx(30_000, TransactionType.REFUND),
    )
    assert result.category_spend["food"] == won(-20_000)
    assert result.budgeted_spend == won(-20_000)
    assert result.monthly_delta == won(20_000)
