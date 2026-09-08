"""월간 결산 판정.

여기서 지키는 것은 하나다. **근거가 있는 것만 말한다.** 예산을 안 정한 사람에게
"예산 안에서 마쳤어요" 를 만들지 않고, 지난달과 견줄 것이 없는 사람에게 변화를
지어내지 않는다. 억지 칭찬은 다음 달 칭찬까지 값을 잃게 한다.
"""

from __future__ import annotations

from datetime import date

from app.domain import aggregation as agg
from app.domain.closing import (
    ClosingFacts,
    DayCounts,
    HighlightKind,
    NextStepKind,
    build_closing,
    count_days,
)
from app.domain.money import Money, won
from app.domain.period import BudgetPeriod

LAST_MONTH = BudgetPeriod.of_month(2026, 8)
TODAY = date(2026, 9, 8)

FOOD = "11111111-1111-1111-1111-111111111111"
CAFE = "22222222-2222-2222-2222-222222222222"


def _totals(
    *,
    spend: dict[str | None, int] | None = None,
    expense: int = 0,
    income: int = 0,
    transfer: int = 0,
) -> agg.PeriodTotals:
    """분류별 예산 반영 지출을 손으로 놓은 합계. 집계 자체는 test_aggregation 이 본다."""
    by_category = {key: won(value) for key, value in (spend or {}).items()}
    total = Money.total(by_category.values()) if by_category else won(expense)
    return agg.PeriodTotals(
        budgeted_spend=total,
        month_expense=won(expense) if expense else total,
        month_income=won(income),
        monthly_delta=won(income) - (won(expense) if expense else total),
        month_transfer=won(transfer),
        category_spend=by_category,
        category_budgeted_spend=by_category,
        category_income={},
    )


def _facts(
    *,
    totals: agg.PeriodTotals | None = None,
    previous: agg.PeriodTotals | None = None,
    days: DayCounts = DayCounts(recorded_days=10, no_spend_days=0),
    budget: int | None = None,
    goal: int = 0,
    today: date = TODAY,
) -> ClosingFacts:
    return ClosingFacts(
        period=LAST_MONTH,
        today=today,
        totals=totals or _totals(),
        previous_totals=previous or _totals(),
        days=days,
        budget_amount=None if budget is None else won(budget),
        goal_contribution=won(goal),
        has_any_transaction=True,
    )


def test_예산_안에서_마쳤으면_남긴_돈을_함께_말한다():
    result = build_closing(_facts(totals=_totals(spend={FOOD: 240_000}), budget=300_000))

    highlight = result.highlights[0]
    assert highlight.kind is HighlightKind.WITHIN_BUDGET
    # 남긴 돈을 화면이 빼서 만들지 않게 서버가 낸다.
    assert highlight.amount == won(60_000)


def test_예산을_안_정했으면_예산_이야기를_아예_안_한다():
    """지출이 0 원이어도 마찬가지다. 정하지 않은 예산을 지켰다고 말할 수 없다."""
    result = build_closing(_facts(totals=_totals(spend={FOOD: 240_000})))

    assert [item.kind for item in result.highlights] == []


def test_예산을_넘겼으면_잘한_것에_안_들어간다():
    result = build_closing(_facts(totals=_totals(spend={FOOD: 340_000}), budget=300_000))

    assert [item.kind for item in result.highlights] == []


def test_가장_많이_줄인_분류를_줄인_금액과_함께_말한다():
    result = build_closing(
        _facts(
            totals=_totals(spend={FOOD: 200_000, CAFE: 50_000}),
            previous=_totals(spend={FOOD: 300_000, CAFE: 60_000}),
        )
    )

    highlight = result.highlights[0]
    assert highlight.kind is HighlightKind.CATEGORY_DECREASE
    assert highlight.category_id == FOOD
    assert highlight.amount == won(100_000)
    assert highlight.previous == won(300_000)


def test_지난달에_없던_분류는_줄지도_늘지도_않은_것으로_본다():
    """이번 달에 처음 쓴 것을 변화라고 하면 매달 다른 분류를 가리킨다."""
    result = build_closing(_facts(totals=_totals(spend={FOOD: 200_000})))

    assert result.change is None
    assert [item.kind for item in result.highlights] == []


def test_안_쓴_날은_날_수로만_말하고_없으면_말하지_않는다():
    with_days = build_closing(_facts(days=DayCounts(recorded_days=20, no_spend_days=3)))
    without = build_closing(_facts(days=DayCounts(recorded_days=20, no_spend_days=0)))

    assert with_days.highlights[0].kind is HighlightKind.NO_SPEND_DAYS
    assert with_days.highlights[0].count == 3
    assert [item.kind for item in without.highlights] == []


def test_잘한_것은_정해진_순서로_세_개까지만_싣는다():
    result = build_closing(
        _facts(
            totals=_totals(spend={FOOD: 200_000}),
            previous=_totals(spend={FOOD: 300_000}),
            days=DayCounts(recorded_days=20, no_spend_days=2),
            budget=300_000,
            goal=500_000,
        )
    )

    # 목표 기여가 넷째라 잘린다. 순서가 흔들리면 매달 다른 것이 잘려 나간다.
    assert [item.kind for item in result.highlights] == [
        HighlightKind.WITHIN_BUDGET,
        HighlightKind.CATEGORY_DECREASE,
        HighlightKind.NO_SPEND_DAYS,
    ]


def test_가장_많이_늘어난_분류를_다음_달_한도로_이어_준다():
    result = build_closing(
        _facts(
            totals=_totals(spend={FOOD: 400_000, CAFE: 90_000}),
            previous=_totals(spend={FOOD: 300_000, CAFE: 47_300}),
        )
    )

    assert result.change is not None
    assert result.change.category_id == FOOD
    assert result.change.delta == won(100_000)
    assert result.next_step is not None
    assert result.next_step.kind is NextStepKind.CATEGORY_CAP
    assert result.next_step.category_id == FOOD
    # 지난달 금액을 1,000원 단위로 올린다. 이번 달 금액에서 깎으면 늘어난 자리를 굳힌다.
    assert result.next_step.suggested_cap == won(300_000)


def test_늘어난_분류가_없으면_다음_달에_권할_것도_없다():
    result = build_closing(
        _facts(
            totals=_totals(spend={FOOD: 200_000}),
            previous=_totals(spend={FOOD: 300_000}),
        )
    )

    assert result.change is None
    assert result.next_step is None


def test_한도는_1000원_단위로_올린다():
    result = build_closing(
        _facts(
            totals=_totals(spend={FOOD: 400_000}),
            previous=_totals(spend={FOOD: 47_300}),
        )
    )

    assert result.next_step is not None
    assert result.next_step.suggested_cap == won(48_000)


def test_돈_흐름에는_옮긴_돈이_따로_실린다():
    """이체는 지출도 수입도 아니라 차액에 안 들어간다. 그래서 따로 적을 자리가 필요하다."""
    result = build_closing(
        _facts(totals=_totals(expense=500_000, income=3_000_000, transfer=1_000_000))
    )

    assert result.flow.income == won(3_000_000)
    assert result.flow.expense == won(500_000)
    assert result.flow.transfer == won(1_000_000)
    assert result.flow.delta == won(2_500_000)
    assert result.flow.total_days == 31


def test_아직_지나는_중인_달은_결산하지_않는다():
    ongoing = build_closing(_facts(today=date(2026, 8, 20)))
    done = build_closing(_facts(today=date(2026, 9, 1)))

    assert ongoing.is_closed is False
    assert done.is_closed is True


def test_안_쓴_날은_적은_날_중에서만_센다():
    """안 적은 날까지 세면 앱을 안 연 달이 가장 잘한 달이 된다."""
    rows = [
        agg.TransactionInput(
            occurred_on=date(2026, 8, 3), amount=won(10_000), type=agg.TransactionType.EXPENSE
        ),
        agg.TransactionInput(
            occurred_on=date(2026, 8, 4),
            amount=Money.zero(),
            type=agg.TransactionType.EXPENSE,
            source=agg.TransactionSource.NO_SPEND,
        ),
        # 수입만 적은 날도 '쓰지 않은 날' 이다. 기록은 있고 지출이 없다.
        agg.TransactionInput(
            occurred_on=date(2026, 8, 5), amount=won(50_000), type=agg.TransactionType.INCOME
        ),
        # 이체만 있는 날도 적은 날로 센다. 집계에서 빠지는 것과 안 적은 것은 다르다.
        agg.TransactionInput(
            occurred_on=date(2026, 8, 6), amount=won(70_000), type=agg.TransactionType.TRANSFER
        ),
    ]

    counts = count_days(rows, LAST_MONTH)

    assert counts.recorded_days == 4
    assert counts.no_spend_days == 3


def test_기간_밖과_지운_거래는_날_수에_안_들어간다():
    rows = [
        agg.TransactionInput(
            occurred_on=date(2026, 9, 1), amount=won(10_000), type=agg.TransactionType.EXPENSE
        ),
        agg.TransactionInput(
            occurred_on=date(2026, 8, 9),
            amount=won(10_000),
            type=agg.TransactionType.EXPENSE,
            is_deleted=True,
        ),
    ]

    assert count_days(rows, LAST_MONTH) == DayCounts(recorded_days=0, no_spend_days=0)
