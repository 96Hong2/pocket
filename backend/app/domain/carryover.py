"""예산 자동 이어쓰기 판단. 새 기간을 처음 조회할 때 한 번 부른다.

현재 기간에 예산이 있으면 그대로 두고, 사용자가 자동 복사를 껐거나 이미 지운 적이
있으면 복사하지 않는다. 직전 기간(바로 앞 1개)에만 기대고 더 거슬러 올라가지 않는다.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from app.domain.money import Money
from app.domain.period import BudgetPeriod

__all__ = [
    "BudgetSnapshot",
    "CarryoverDecision",
    "CarryoverResult",
    "CategoryBudgetInput",
    "decide_carryover",
]


class CarryoverDecision(StrEnum):
    ALREADY_EXISTS = "already_exists"
    DISABLED_BY_USER = "disabled_by_user"
    DELETED_BY_USER = "deleted_by_user"
    NO_PREVIOUS_BUDGET = "no_previous_budget"
    COPY = "copy"


@dataclass(frozen=True)
class CategoryBudgetInput:
    category_id: str
    amount: Money


@dataclass(frozen=True)
class BudgetSnapshot:
    period: BudgetPeriod
    amount: Money
    category_budgets: tuple[CategoryBudgetInput, ...] = ()
    is_auto_carried: bool = False


@dataclass(frozen=True)
class CarryoverResult:
    decision: CarryoverDecision
    amount: Money | None = None
    category_budgets: tuple[CategoryBudgetInput, ...] = ()
    is_auto_carried: bool = False

    @property
    def should_copy(self) -> bool:
        return self.decision is CarryoverDecision.COPY


def decide_carryover(
    *,
    current_budget: BudgetSnapshot | None,
    previous_budget: BudgetSnapshot | None,
    auto_carryover_enabled: bool,
    has_tombstone: bool,
) -> CarryoverResult:
    """복사 여부와 복사할 값을 돌려준다. 저장은 호출자가 한다."""
    if current_budget is not None:
        return CarryoverResult(CarryoverDecision.ALREADY_EXISTS)
    if not auto_carryover_enabled:
        return CarryoverResult(CarryoverDecision.DISABLED_BY_USER)
    # 자동 복사분을 지운 기간에는 다시 만들지 않는다.
    if has_tombstone:
        return CarryoverResult(CarryoverDecision.DELETED_BY_USER)
    if previous_budget is None:
        return CarryoverResult(CarryoverDecision.NO_PREVIOUS_BUDGET)
    return CarryoverResult(
        decision=CarryoverDecision.COPY,
        amount=previous_budget.amount,
        category_budgets=tuple(previous_budget.category_budgets),
        is_auto_carried=True,
    )
