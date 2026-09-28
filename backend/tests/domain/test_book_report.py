"""공유 가계부 리포트의 자세히 보기.

이번 달은 지난달 같은 날짜까지만 견준다. 달 전체와 견주면 이번 달은 늘 줄어든 것처럼 보인다.
"""

from datetime import date

from app.domain.aggregation import TransactionInput, TransactionType
from app.domain.book_report import build_insight
from app.domain.money import won
from app.domain.period import BudgetPeriod

SEPT = BudgetPeriod.of_month(2026, 9)


def spent(day: date, amount: int, category: str | None = "groceries") -> TransactionInput:
    return TransactionInput(
        occurred_on=day, amount=won(amount), type=TransactionType.EXPENSE, category_id=category
    )


def test_이번_달은_지난달_같은_날짜까지만_견준다():
    """9월 10일에 본다. 8월은 1~10일의 30,000 만 견주고 20일의 90,000 은 뺀다."""
    rows = [
        spent(date(2026, 8, 5), 30_000),
        spent(date(2026, 8, 20), 90_000),
        spent(date(2026, 9, 3), 50_000),
    ]

    insight = build_insight(rows, SEPT, date(2026, 9, 10))

    assert insight.previous_spent_same_window == won(30_000)
    assert insight.compare_delta == won(20_000)
    assert insight.compare_window_end == date(2026, 9, 10)


def test_월말_예상은_이번_달만_내고_사흘이_지나야_믿는다():
    """9월 2일까지 20,000 이면 하루 10,000 꼴이고 30일이면 300,000 이다. 이틀째라 아직 못 믿는다."""
    rows = [spent(date(2026, 9, 1), 20_000)]

    early = build_insight(rows, SEPT, date(2026, 9, 2))
    assert (early.projected_month_end, early.is_projection_reliable) == (won(300_000), False)

    later = build_insight(rows, SEPT, date(2026, 9, 3))
    # 20,000 × 30 ÷ 3 = 200,000.
    assert (later.projected_month_end, later.is_projection_reliable) == (won(200_000), True)

    past = build_insight(rows, BudgetPeriod.of_month(2026, 8), date(2026, 9, 3))
    assert (past.projected_month_end, past.is_projection_reliable) == (None, False)


def test_늘어난_분류는_양쪽_달에_다_있는_것만_치고_목록에는_새_분류도_든다():
    rows = [
        spent(date(2026, 8, 3), 10_000, "groceries"),
        spent(date(2026, 9, 3), 25_000, "groceries"),
        spent(date(2026, 9, 4), 40_000, "dining"),
    ]

    insight = build_insight(rows, SEPT, date(2026, 9, 30))

    assert insight.largest_increase is not None
    assert (insight.largest_increase.category_id, insight.largest_increase.delta) == (
        "groceries",
        won(15_000),
    )
    assert [(row.category_id, row.delta) for row in insight.category_changes] == [
        ("dining", won(40_000)),
        ("groceries", won(15_000)),
    ]
