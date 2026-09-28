"""공유 가계부 리포트의 「자세히 보기」. DB 도 HTTP 도 모른다.

개인 리포트와 같은 규칙을 쓴다. 지난달과는 같은 날짜까지만 견주고(`same_day_window`),
가장 많이 늘어난 분류는 결산과 같은 판정(`closing.largest_increase`)을 쓴다.
두 곳에서 따로 정하면 같은 돈을 두고 개인 화면과 공유 화면이 다른 말을 한다.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date

from app.domain import aggregation as agg
from app.domain.budget import MIN_PROJECTION_ELAPSED_DAYS
from app.domain.closing import largest_increase
from app.domain.money import Money
from app.domain.period import BudgetPeriod, same_day_window

__all__ = [
    "MAX_CATEGORY_CHANGES",
    "BookInsight",
    "CategoryDelta",
    "build_insight",
    "category_changes",
]

# 도넛 목록과 같은 여덟 줄.
MAX_CATEGORY_CHANGES = 8


@dataclass(frozen=True)
class CategoryDelta:
    category_id: str | None
    current: Money
    previous: Money
    # 이번 - 지난. 음수면 줄었다.
    delta: Money


@dataclass(frozen=True)
class BookInsight:
    previous_spent_same_window: Money
    # 이번 창 - 지난 창.
    compare_delta: Money
    # 이번 창의 끝. 이번 달이면 오늘, 지난 달이면 말일이다.
    compare_window_end: date
    largest_increase: CategoryDelta | None
    category_changes: list[CategoryDelta]
    projected_month_end: Money | None
    is_projection_reliable: bool


def build_insight(
    rows: Sequence[agg.TransactionInput], period: BudgetPeriod, today: date
) -> BookInsight:
    """`rows` 는 지난달 1일부터 이 달 말일까지의 공유 기록이다."""
    previous = period.previous_period()
    if period.contains(today):
        current_window = same_day_window(period, today)
        previous_window = same_day_window(previous, today)
    else:
        # 지난 달끼리는 통째로 견준다. 자를 이유가 없다.
        current_window, previous_window = period, previous

    now = agg.aggregate_period(rows, current_window)
    before = agg.aggregate_period(rows, previous_window)
    grown = largest_increase(now.category_spend, before.category_spend)
    projected, reliable = _projection(rows, period, today)

    return BookInsight(
        previous_spent_same_window=before.month_expense,
        compare_delta=now.month_expense - before.month_expense,
        compare_window_end=current_window.end,
        largest_increase=(
            CategoryDelta(grown.category_id, grown.current, grown.previous, grown.delta)
            if grown is not None
            else None
        ),
        category_changes=category_changes(now.category_spend, before.category_spend),
        projected_month_end=projected,
        is_projection_reliable=reliable,
    )


def category_changes(
    current: Mapping[str | None, Money], previous: Mapping[str | None, Money]
) -> list[CategoryDelta]:
    """두 창 중 한쪽이라도 쓴 분류. 변화가 큰 것부터 여덟 개.

    결산과 달리 이번 달에 처음 쓴 분류도 넣는다. 여기는 「무엇이 늘었나」 판정이 아니라
    분류마다 이번 달 얼마, 지난달보다 얼마를 늘어놓는 목록이다.
    """
    keys = {key for key, value in current.items() if value.is_positive} | {
        key for key, value in previous.items() if value.is_positive
    }
    rows = [
        CategoryDelta(
            category_id=key,
            current=current.get(key, Money.zero()),
            previous=previous.get(key, Money.zero()),
            delta=current.get(key, Money.zero()) - previous.get(key, Money.zero()),
        )
        for key in keys
    ]
    # 같은 크기면 id 순으로 못 박는다. 새로 고칠 때마다 순서가 바뀌면 안 된다.
    rows.sort(key=lambda row: (-abs(row.delta).amount, row.category_id or ""))
    return rows[:MAX_CATEGORY_CHANGES]


def _projection(
    rows: Sequence[agg.TransactionInput], period: BudgetPeriod, today: date
) -> tuple[Money | None, bool]:
    """이번 달만 월말을 내다본다. 지난 달은 이미 끝나 예상할 것이 없다."""
    if not period.contains(today):
        return None, False
    spent = agg.aggregate_period(rows, period).month_expense
    progress = period.progress(today)
    projected = spent.scale(progress.total_days).divide(progress.elapsed_days)
    return projected, progress.elapsed_days >= MIN_PROJECTION_ELAPSED_DAYS
