"""월간 결산 판정.

카드 넉 장에 실을 것을 한 번에 낸다: 잘한 것 · 돈 흐름 · 살펴볼 변화 · 다음 달 하나만.

**근거가 없으면 아무 말도 만들지 않는다.** 잘한 것이 하나도 없으면 빈 목록이고, 지난달과
견줄 것이 없으면 변화도 다음 달 제안도 없다. 억지로 채우면 칭찬도 조언도 값을 잃는다.

여기서 나오는 것은 종류와 숫자뿐이다. 문장은 화면이 만든다.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from app.domain import aggregation as agg
from app.domain.money import Money
from app.domain.period import BudgetPeriod

__all__ = [
    "CAP_UNIT",
    "MAX_HIGHLIGHTS",
    "CategoryChange",
    "Closing",
    "ClosingFacts",
    "ClosingFlow",
    "DayCounts",
    "Highlight",
    "HighlightKind",
    "NextStep",
    "NextStepKind",
    "build_closing",
    "count_days",
]

# 잘한 것 카드에 싣는 최대 개수. 넉 장짜리 카드 한 장에 들어갈 만큼이다.
MAX_HIGHLIGHTS = 3

# 다음 달 한도를 다듬는 단위. 947,300원 같은 값을 그대로 권하면 지킬 수 있는 수로 안 읽힌다.
CAP_UNIT = 1000


class HighlightKind(StrEnum):
    """잘한 것의 종류. **선언 순서가 곧 카드에 실리는 순서다.**"""

    # 예산을 정했고 그 안에서 마쳤다.
    WITHIN_BUDGET = "within_budget"
    # 지난달보다 가장 많이 줄인 분류.
    CATEGORY_DECREASE = "category_decrease"
    # 기록은 했는데 지출이 없던 날.
    NO_SPEND_DAYS = "no_spend_days"
    # 그 달에 목표로 옮긴 돈.
    GOAL_CONTRIBUTION = "goal_contribution"


class NextStepKind(StrEnum):
    """다음 달에 해 볼 것 하나. 지금은 분류 한도 하나뿐이다."""

    CATEGORY_CAP = "category_cap"


@dataclass(frozen=True)
class Highlight:
    """잘한 것 하나.

    `amount` 는 **그 문장이 그대로 읽을 숫자**다. 예산 안에서 마친 것이면 남긴 돈,
    분류를 줄인 것이면 줄인 돈, 목표면 옮긴 돈이다. 화면이 빼거나 더하지 않는다.
    """

    kind: HighlightKind
    amount: Money | None = None
    category_id: str | None = None
    count: int | None = None
    # 견준 지난달 금액. 줄인 것을 말할 때 어디서 어디로 왔는지 함께 적으라고 싣는다.
    previous: Money | None = None


@dataclass(frozen=True)
class ClosingFlow:
    """그 달에 돈이 어떻게 드나들었나. 남은 예산과 다른 이야기다."""

    income: Money
    expense: Money
    # 옮긴 돈. 지출도 수입도 아니라 차액에 안 들어간다.
    transfer: Money
    # 수입 - 지출. 순자산도 남은 예산도 아니다.
    delta: Money
    recorded_days: int
    total_days: int


@dataclass(frozen=True)
class CategoryChange:
    """지난달과 견준 분류 하나. 늘어난 쪽·줄어든 쪽 모두 이 모양이다."""

    category_id: str
    current: Money
    previous: Money
    # 이번 - 지난. 음수면 줄었다는 뜻이다.
    delta: Money


@dataclass(frozen=True)
class NextStep:
    kind: NextStepKind
    category_id: str
    # 다음 달에 그 분류에 걸어 볼 한도. 지난달 수준으로 돌아가 보자는 뜻이다.
    suggested_cap: Money


@dataclass(frozen=True)
class DayCounts:
    """그 달에 며칠 적었고 그중 며칠은 안 썼나."""

    recorded_days: int
    no_spend_days: int


@dataclass(frozen=True)
class ClosingFacts:
    """판정에 쓰는 재료. 모으는 일은 서비스가 하고 판정은 여기서만 한다."""

    period: BudgetPeriod
    today: date
    totals: agg.PeriodTotals
    previous_totals: agg.PeriodTotals
    days: DayCounts
    # 그 달에 정해 둔 예산. 안 정했으면 None 이고 그때 예산 이야기는 아예 안 한다.
    budget_amount: Money | None
    # 그 달에 목표로 옮긴 돈.
    goal_contribution: Money
    has_any_transaction: bool


@dataclass(frozen=True)
class Closing:
    # 그 달이 끝났나. 아직 지나는 중인 달의 결산은 만들지 않는다.
    is_closed: bool
    has_any_transaction: bool
    highlights: list[Highlight]
    flow: ClosingFlow
    # 지난달보다 가장 많이 늘어난 분류. 견줄 것이 없으면 None.
    change: CategoryChange | None
    next_step: NextStep | None


def count_days(rows: Iterable[agg.TransactionInput], period: BudgetPeriod) -> DayCounts:
    """그 달에 기록한 날 수와, 그중 지출이 없던 날 수.

    '안 쓴 날' 은 **기록이 있는데 지출이 없는 날**이다. 아예 안 적은 날은 세지 않는다.
    안 쓴 것과 안 적은 것은 다르고, 안 적은 날을 칭찬하면 근거 없는 칭찬이 된다.
    (`ledger._no_spend_streak` 과 같은 정의다. 저기는 오늘부터 이어진 날을 세고
    여기는 그 달 전체를 센다.)

    이체만 있는 날도 기록한 날이다. 집계에서 빠지는 것과 적지 않은 것은 다르다.
    """
    live = [row for row in rows if not row.is_deleted and period.contains(row.occurred_on)]
    spend = {total.day: total.expense for total in agg.aggregate_days(live, period)}
    recorded = {row.occurred_on for row in live}
    return DayCounts(
        recorded_days=len(recorded),
        no_spend_days=sum(1 for day in recorded if not spend.get(day, Money.zero()).is_positive),
    )


def build_closing(facts: ClosingFacts) -> Closing:
    """카드 넉 장에 실을 것을 한 번에 낸다."""
    change = _largest_increase(
        facts.totals.category_budgeted_spend, facts.previous_totals.category_budgeted_spend
    )
    return Closing(
        # 아직 지나는 중인 달은 결산할 수 없다. 마지막 날 저녁에 쓴 돈이 아직 안 적혔다.
        is_closed=facts.period.end < facts.today,
        has_any_transaction=facts.has_any_transaction,
        highlights=_highlights(facts),
        flow=ClosingFlow(
            income=facts.totals.month_income,
            expense=facts.totals.month_expense,
            transfer=facts.totals.month_transfer,
            delta=facts.totals.monthly_delta,
            recorded_days=facts.days.recorded_days,
            total_days=facts.period.total_days,
        ),
        change=change,
        next_step=_next_step(change),
    )


def _highlights(facts: ClosingFacts) -> list[Highlight]:
    """근거가 있는 것만, 선언 순서대로, 세 개까지."""
    found: list[Highlight] = []

    budget = facts.budget_amount
    if budget is not None and facts.totals.budgeted_spend <= budget:
        found.append(
            Highlight(HighlightKind.WITHIN_BUDGET, amount=budget - facts.totals.budgeted_spend)
        )

    decrease = _largest_decrease(
        facts.totals.category_budgeted_spend, facts.previous_totals.category_budgeted_spend
    )
    if decrease is not None:
        found.append(
            Highlight(
                HighlightKind.CATEGORY_DECREASE,
                category_id=decrease.category_id,
                # 줄인 돈. 화면이 두 금액을 빼서 만들지 않게 여기서 낸다.
                amount=-decrease.delta,
                previous=decrease.previous,
            )
        )

    if facts.days.no_spend_days > 0:
        found.append(Highlight(HighlightKind.NO_SPEND_DAYS, count=facts.days.no_spend_days))

    if facts.goal_contribution.is_positive:
        found.append(Highlight(HighlightKind.GOAL_CONTRIBUTION, amount=facts.goal_contribution))

    return found[:MAX_HIGHLIGHTS]


def _changes(
    current: Mapping[str | None, Money], previous: Mapping[str | None, Money]
) -> list[CategoryChange]:
    """양쪽 달에 다 있는 분류만 견준다.

    분류를 안 정한 줄(`None`)은 뺀다. 이름 없이 "분류 없음이 늘었어요" 는 무엇을 보라는
    말인지 알 수 없다. 한쪽에만 있는 분류도 뺀다. 이번 달에 처음 쓴 것을 '늘었다' 고 하면
    지난달에 없던 항목이 전부 증가로 잡혀 매달 다른 분류를 가리킨다.
    """
    return [
        CategoryChange(
            category_id=key,
            current=current[key],
            previous=previous[key],
            delta=current[key] - previous[key],
        )
        for key in current
        if key is not None
        and current[key].is_positive
        and previous.get(key, Money.zero()).is_positive
    ]


def _largest_increase(
    current: Mapping[str | None, Money], previous: Mapping[str | None, Money]
) -> CategoryChange | None:
    """가장 많이 늘어난 분류. 늘어난 것이 없으면 None.

    같은 금액이 둘이면 id 순으로 못 박는다. 안 그러면 새로 고칠 때마다 다른 분류를 가리켜
    사용자가 본 화면과 다시 본 화면이 서로 다른 말을 한다.
    """
    grown = [item for item in _changes(current, previous) if item.delta.is_positive]
    if not grown:
        return None
    return min(grown, key=lambda item: (-item.delta.amount, item.category_id))


def _largest_decrease(
    current: Mapping[str | None, Money], previous: Mapping[str | None, Money]
) -> CategoryChange | None:
    """가장 많이 줄어든 분류. 줄어든 것이 없으면 None."""
    cut = [item for item in _changes(current, previous) if item.delta.is_negative]
    if not cut:
        return None
    return min(cut, key=lambda item: (item.delta.amount, item.category_id))


def _next_step(change: CategoryChange | None) -> NextStep | None:
    """다음 달에 해 볼 것 하나. 늘어난 분류가 없으면 권할 것도 없다.

    한도는 **지난달 금액**을 1,000원 단위로 올린 값이다. 이번 달 금액에서 조금 깎으면
    늘어난 자리를 그대로 굳히는 셈이고, 지난달에 이미 그만큼으로 살아 봤다는 근거가 있다.
    """
    if change is None:
        return None
    return NextStep(
        kind=NextStepKind.CATEGORY_CAP,
        category_id=change.category_id,
        suggested_cap=change.previous.divide_ceil(CAP_UNIT).scale(CAP_UNIT),
    )
