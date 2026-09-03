"""예산 조회·저장과 예산 상태 계산.

산식은 전부 `app.domain.budget.evaluate_budget` 이 갖고 있다. 여기서 다시 쓰지 않는다.

이 모듈은 거래 모듈을 부르지 않는다. 필요한 기간 합계는 인자로 받는다.
거래 저장이 예산 상태를 돌려줘야 해서, 반대 방향으로도 부르면 순환이 된다.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain import aggregation as agg
from app.domain.budget import BudgetStatus, evaluate_budget
from app.domain.money import Money
from app.domain.period import BudgetPeriod
from app.models import Budget, CategoryBudget, User

__all__ = [
    "budget_status",
    "category_budget_amount",
    "find_budget",
    "upsert_budget",
]


def find_budget(session: Session, user: User, period: BudgetPeriod) -> Budget | None:
    """살아 있는 예산 한 건. 소프트 삭제한 행은 '예산 없음'으로 본다."""
    return session.scalar(
        select(Budget).where(
            Budget.user_id == user.id,
            Budget.period_start == period.start,
            Budget.deleted_at.is_(None),
        )
    )


def _any_budget_row(session: Session, user: User, period: BudgetPeriod) -> Budget | None:
    """소프트 삭제한 행까지 포함해 찾는다. unique 자리를 그 행이 지키고 있다."""
    return session.scalar(
        select(Budget).where(Budget.user_id == user.id, Budget.period_start == period.start)
    )


def budget_status(
    session: Session,
    user: User,
    period: BudgetPeriod,
    totals: agg.PeriodTotals,
    today: date,
) -> BudgetStatus:
    """예산 상태. 예산을 정하지 않았어도 진행도와 예측은 나온다."""
    budget = find_budget(session, user, period)
    return evaluate_budget(
        budget_amount=Money(budget.amount) if budget else None,
        budgeted_spend=totals.budgeted_spend,
        period=period,
        today=today,
    )


def category_budget_amount(
    session: Session, user: User, period: BudgetPeriod, category_id: uuid.UUID | None
) -> Money | None:
    if category_id is None:
        return None
    row = session.scalar(
        select(CategoryBudget)
        .join(Budget, CategoryBudget.budget_id == Budget.id)
        .where(
            Budget.user_id == user.id,
            Budget.period_start == period.start,
            Budget.deleted_at.is_(None),
            CategoryBudget.category_id == category_id,
            CategoryBudget.deleted_at.is_(None),
        )
    )
    return Money(row.amount) if row else None


def upsert_budget(session: Session, user: User, period: BudgetPeriod, amount: Decimal) -> Budget:
    """같은 기간에 몇 번을 저장해도 결과가 같다.

    (user_id, period_start) 가 unique 이고 소프트 삭제한 행도 그 자리를 지킨다.
    그래서 새로 만들지 않고 있던 행을 덮어쓴다. 지웠던 기간을 사용자가 다시 정하면
    tombstone 을 되살린다. 자동 이어쓰기를 막으려고 남긴 표시이지, 직접 정하는 것까지
    막으려던 것이 아니다.
    """
    row = _any_budget_row(session, user, period)
    if row is None:
        row = Budget(
            user_id=user.id,
            period_start=period.start,
            period_end=period.end,
            amount=amount,
        )
        session.add(row)
        try:
            session.commit()
        except IntegrityError:
            # 같은 기간을 동시에 저장했다. 진 쪽은 되돌리고 이긴 행에 값을 덮는다.
            session.rollback()
            row = _any_budget_row(session, user, period)
            if row is None:
                raise
        else:
            session.refresh(row)
            return row

    row.amount = amount
    row.period_end = period.end
    row.deleted_at = None
    # 사용자가 직접 정했으니 자동 복사 표시를 지운다. 안내 배너의 근거가 된다.
    row.is_auto_carried = False
    session.commit()
    session.refresh(row)
    return row
