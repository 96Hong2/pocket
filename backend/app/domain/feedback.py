"""저장 직후 즉시 피드백 판정.

우선순위는 초과 > 주의 > 큰 지출 > 성취 > 적정 이고 한 번에 한 단계만 고른다.
초과는 실제로 넘었을 때만 잡는다. 예측만으로는 초과라고 하지 않는다.
결과는 문구가 아니라 종류와 숫자다. 문장 조립은 표현 계층이 한다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum

from app.domain.aggregation import TransactionType
from app.domain.budget import BudgetStatus
from app.domain.money import Money, won

__all__ = [
    "FORBIDDEN_WORDS",
    "LARGE_EXPENSE_BUDGET_RATE",
    "LARGE_EXPENSE_FLOOR",
    "LARGE_EXPENSE_MEDIAN_MULTIPLIER",
    "PACE_WARNING_RATIO",
    "AchievementEvidence",
    "AchievementKind",
    "FeedbackInput",
    "FeedbackKind",
    "FeedbackResult",
    "SavedTransaction",
    "ensure_no_forbidden_words",
    "evaluate_feedback",
    "find_forbidden_words",
    "large_expense_threshold",
]

PACE_WARNING_RATIO = Decimal("1.2")
MIN_PACE_ELAPSED_DAYS = 3
LARGE_EXPENSE_FLOOR = 30_000
LARGE_EXPENSE_MEDIAN_MULTIPLIER = 3
LARGE_EXPENSE_BUDGET_RATE = Decimal("0.10")

# 사용자를 탓하는 말은 쓰지 않는다.
FORBIDDEN_WORDS: tuple[str, ...] = ("과소비", "낭비", "실패", "벌써", "또", "망함")
# "또는", "또한" 은 접속사라 걸지 않는다.
_WORD_PATTERNS: dict[str, re.Pattern[str]] = {"또": re.compile("또(?!는|한)")}


class FeedbackKind(StrEnum):
    OVER_BUDGET = "over_budget"
    PACE_WARNING = "pace_warning"
    LARGE_EXPENSE = "large_expense"
    ACHIEVEMENT = "achievement"
    ON_TRACK = "on_track"
    MONTH_FACT = "month_fact"


class AchievementKind(StrEnum):
    WEEKLY_DECREASE = "weekly_decrease"
    NO_SPEND_STREAK = "no_spend_streak"
    PROJECTED_WITHIN_BUDGET = "projected_within_budget"


@dataclass(frozen=True)
class AchievementEvidence:
    """실제 데이터로 확인된 성취만 넘긴다. 없으면 None."""

    kind: AchievementKind
    decreased_amount: Money | None = None
    no_spend_days: int | None = None


@dataclass(frozen=True)
class SavedTransaction:
    amount: Money
    type: TransactionType
    category_id: str | None = None
    excluded_from_budget: bool = False


@dataclass(frozen=True)
class FeedbackInput:
    saved: SavedTransaction
    month_expense: Money
    budget_status: BudgetStatus | None = None
    category_budget_amount: Money | None = None
    category_budgeted_spend: Money | None = None
    category_median_90d: Money | None = None
    achievement: AchievementEvidence | None = None


@dataclass(frozen=True)
class FeedbackResult:
    kind: FeedbackKind
    budget_amount: Money | None = None
    remaining_budget: Money | None = None
    over_amount: Money | None = None
    over_category_id: str | None = None
    category_budget_amount: Money | None = None
    category_spend: Money | None = None
    daily_allowance: Money | None = None
    remaining_days: int | None = None
    pace_ratio: Decimal | None = None
    projected_month_end: Money | None = None
    saved_amount: Money | None = None
    large_expense_threshold: Money | None = None
    achievement: AchievementEvidence | None = None
    month_expense: Money | None = None


def large_expense_threshold(
    *, budget_amount: Money | None, category_median_90d: Money | None
) -> Money:
    """30,000원 · 카테고리 90일 중앙값 3배 · 예산 10% 중 가장 큰 값."""
    candidates = [won(LARGE_EXPENSE_FLOOR)]
    if category_median_90d is not None and category_median_90d.is_positive:
        candidates.append(category_median_90d.scale(LARGE_EXPENSE_MEDIAN_MULTIPLIER))
    if budget_amount is not None and budget_amount.is_positive:
        candidates.append(budget_amount.scale(LARGE_EXPENSE_BUDGET_RATE))
    return max(candidates)


def evaluate_feedback(data: FeedbackInput) -> FeedbackResult:
    status = data.budget_status
    budgeted = status if status is not None and status.budget_amount is not None else None

    if budgeted is not None:
        over = _over_budget(data, budgeted)
        if over is not None:
            return over
        warning = _pace_warning(budgeted)
        if warning is not None:
            return warning

    large = _large_expense(data)
    if large is not None:
        return large

    if data.achievement is not None:
        return FeedbackResult(
            kind=FeedbackKind.ACHIEVEMENT,
            achievement=data.achievement,
            month_expense=data.month_expense,
        )

    if budgeted is not None:
        return FeedbackResult(
            kind=FeedbackKind.ON_TRACK,
            budget_amount=budgeted.budget_amount,
            remaining_budget=budgeted.remaining_budget,
            daily_allowance=budgeted.daily_allowance,
            remaining_days=budgeted.remaining_days,
            pace_ratio=budgeted.pace_ratio,
        )

    # 예산이 없으면 사실 문장만 남긴다.
    return FeedbackResult(kind=FeedbackKind.MONTH_FACT, month_expense=data.month_expense)


def _over_budget(data: FeedbackInput, status: BudgetStatus) -> FeedbackResult | None:
    remaining = status.remaining_budget
    if remaining is not None and remaining.is_negative:
        return FeedbackResult(
            kind=FeedbackKind.OVER_BUDGET,
            budget_amount=status.budget_amount,
            remaining_budget=remaining,
            over_amount=abs(remaining),
            daily_allowance=status.daily_allowance,
            remaining_days=status.remaining_days,
        )

    limit = data.category_budget_amount
    spent = data.category_budgeted_spend
    if limit is not None and spent is not None and spent > limit:
        return FeedbackResult(
            kind=FeedbackKind.OVER_BUDGET,
            budget_amount=status.budget_amount,
            remaining_budget=remaining,
            over_amount=spent - limit,
            over_category_id=data.saved.category_id,
            category_budget_amount=limit,
            category_spend=spent,
            remaining_days=status.remaining_days,
        )
    return None


def _pace_warning(status: BudgetStatus) -> FeedbackResult | None:
    if status.elapsed_days < MIN_PACE_ELAPSED_DAYS:
        return None
    budget_amount = status.budget_amount
    pace = status.pace_ratio
    fast_pace = pace is not None and pace >= PACE_WARNING_RATIO
    over_projection = budget_amount is not None and status.projected_month_end > budget_amount
    if not (fast_pace or over_projection):
        return None
    return FeedbackResult(
        kind=FeedbackKind.PACE_WARNING,
        budget_amount=budget_amount,
        remaining_budget=status.remaining_budget,
        daily_allowance=status.daily_allowance,
        remaining_days=status.remaining_days,
        pace_ratio=pace,
        projected_month_end=status.projected_month_end,
    )


def _large_expense(data: FeedbackInput) -> FeedbackResult | None:
    if data.saved.type is not TransactionType.EXPENSE:
        return None
    status = data.budget_status
    budget_amount = status.budget_amount if status is not None else None
    threshold = large_expense_threshold(
        budget_amount=budget_amount, category_median_90d=data.category_median_90d
    )
    if data.saved.amount < threshold:
        return None
    return FeedbackResult(
        kind=FeedbackKind.LARGE_EXPENSE,
        saved_amount=data.saved.amount,
        large_expense_threshold=threshold,
        budget_amount=budget_amount,
        remaining_budget=status.remaining_budget if status is not None else None,
        remaining_days=status.remaining_days if status is not None else None,
        month_expense=data.month_expense,
    )


def find_forbidden_words(text: str) -> tuple[str, ...]:
    """문구에 들어간 금지어를 찾는다."""
    hits = []
    for word in FORBIDDEN_WORDS:
        pattern = _WORD_PATTERNS.get(word)
        found = pattern.search(text) is not None if pattern else word in text
        if found:
            hits.append(word)
    return tuple(hits)


def ensure_no_forbidden_words(text: str) -> str:
    hits = find_forbidden_words(text)
    if hits:
        raise ValueError(f"쓰면 안 되는 표현이 있다: {', '.join(hits)}")
    return text
