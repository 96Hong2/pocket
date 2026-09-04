"""예산 조회·저장과 예산 상태 계산.

산식은 전부 `app.domain.budget.evaluate_budget` 이 갖고 있다. 이어쓰기 판단은
`app.domain.carryover.decide_carryover` 가 갖고 있다. 여기서 둘 다 다시 쓰지 않는다.

이 모듈은 거래 모듈을 부르지 않는다. 필요한 기간 합계는 인자로 받는다.
거래 저장이 예산 상태를 돌려줘야 해서, 반대 방향으로도 부르면 순환이 된다.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.errors import ApiError, ErrorCode
from app.core.config import get_settings
from app.domain import aggregation as agg
from app.domain.budget import BudgetStatus, evaluate_budget
from app.domain.carryover import BudgetSnapshot, CategoryBudgetInput, decide_carryover
from app.domain.money import Money
from app.domain.period import BudgetPeriod
from app.models import Budget, Category, CategoryBudget, User, UserPreference
from app.modules.categories import service as categories

__all__ = [
    "budget_status",
    "category_budget_amount",
    "delete_budget",
    "delete_category_budget",
    "ensure_carryover",
    "find_budget",
    "is_carried",
    "is_period_editable",
    "list_category_budgets",
    "require_open_period",
    "upsert_budget",
    "upsert_category_budget",
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


def is_carried(session: Session, user: User, period: BudgetPeriod) -> bool:
    """직전 기간에서 자동 복사된 예산인가. 화면 배너를 띄우는 근거다."""
    row = find_budget(session, user, period)
    return row is not None and row.is_auto_carried


def is_period_editable(period: BudgetPeriod, today: date) -> bool:
    """이 기간을 지금 고칠 수 있나. 끝난 달은 보기만 한다."""
    return period.end >= today


def require_open_period(period: BudgetPeriod, today: date) -> None:
    """끝난 기간의 예산은 바꾸지 않는다.

    화면에서만 막으면 API 로 직접 보낸 요청이 지난달 예산을 조용히 바꾼다.
    그러면 이미 본 지난달 게이지와 리포트가 나중에 달라져 숫자를 믿을 수 없게 된다.

    화면 검증 스택은 이 잠금을 열어 둔다. 자동 이어쓰기를 화면으로 보려면 지난달 예산이
    이미 있어야 하는데 만들 길이 그것뿐이다. 스위치는 local 에서만 켜진다.
    """
    if get_settings().allow_past_period_budget_write:
        return
    if not is_period_editable(period, today):
        raise ApiError(
            ErrorCode.PERIOD_CLOSED, "지난 기간의 예산은 바꿀 수 없어요.", status_code=422
        )


def budget_status(
    session: Session,
    user: User,
    period: BudgetPeriod,
    totals: agg.PeriodTotals,
    today: date,
) -> BudgetStatus:
    """예산 상태. 예산을 정하지 않았어도 진행도와 예측은 나온다.

    예산 블록을 싣는 네 응답이 전부 여기를 지난다. 그래서 이어쓰기도 여기서 한 번 확인한다.
    """
    ensure_carryover(session, user, period, today)
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


def delete_budget(session: Session, user: User, period: BudgetPeriod) -> None:
    """예산과 딸린 카테고리 예산을 지운다. 예산이 없으면 아무것도 하지 않는다.

    행을 남기고 표시만 하는 이유가 둘이다. 되돌려도 합계가 맞아야 하고, 남은 행이
    자동 이어쓰기가 방금 지운 예산을 다시 만들어 놓는 것을 막는다.
    """
    row = find_budget(session, user, period)
    if row is None:
        return
    now = datetime.now(UTC)
    row.deleted_at = now
    for item in _live_category_budgets(session, row):
        item.deleted_at = now
    session.commit()


# ── 카테고리 예산 ───────────────────────────────────────


def _live_category_budgets(session: Session, budget: Budget) -> list[CategoryBudget]:
    """그 예산에 살아 있는 카테고리 예산 행 전부."""
    return list(
        session.scalars(
            select(CategoryBudget).where(
                CategoryBudget.budget_id == budget.id,
                CategoryBudget.deleted_at.is_(None),
            )
        )
    )


def _visible_category_budgets(session: Session, budget: Budget) -> list[CategoryBudget]:
    """화면에 그릴 카테고리 예산. 카테고리 목록과 같은 순서로 준다.

    지운 카테고리에 걸린 줄은 뺀다. 이름도 아이콘도 없어 화면이 그릴 수 없다.
    """
    stmt = (
        select(CategoryBudget)
        .join(Category, Category.id == CategoryBudget.category_id)
        .where(
            CategoryBudget.budget_id == budget.id,
            CategoryBudget.deleted_at.is_(None),
            Category.deleted_at.is_(None),
        )
        .order_by(Category.sort_order, Category.name)
    )
    return list(session.scalars(stmt))


def list_category_budgets(
    session: Session, user: User, period: BudgetPeriod
) -> list[CategoryBudget]:
    """전체 예산이 없으면 빈 목록이다. 카테고리 예산은 전체 예산에 딸린다."""
    budget = find_budget(session, user, period)
    return _visible_category_budgets(session, budget) if budget is not None else []


def _category_budget_row(
    session: Session, budget: Budget, category_id: uuid.UUID
) -> CategoryBudget | None:
    """소프트 삭제한 행까지 포함해 찾는다. unique 자리를 그 행이 지키고 있다."""
    return session.scalar(
        select(CategoryBudget).where(
            CategoryBudget.budget_id == budget.id,
            CategoryBudget.category_id == category_id,
        )
    )


def _require_budget(session: Session, user: User, period: BudgetPeriod) -> Budget:
    budget = find_budget(session, user, period)
    if budget is None:
        raise ApiError(ErrorCode.INVALID_REQUEST, "전체 예산을 먼저 정해 주세요.", status_code=422)
    return budget


def upsert_category_budget(
    session: Session,
    user: User,
    period: BudgetPeriod,
    category_id: uuid.UUID,
    amount: Decimal,
) -> CategoryBudget:
    """카테고리 한도를 정한다. 같은 값을 몇 번 보내도 결과가 같다.

    (budget_id, category_id) 가 unique 이고 소프트 삭제한 행도 그 자리를 지킨다.
    그래서 지웠던 카테고리를 다시 정하면 그 행을 되살린다. 예산 저장과 같은 방식이다.
    """
    budget = _require_budget(session, user, period)
    categories.require_owned(session, user, category_id)

    row = _category_budget_row(session, budget, category_id)
    if row is None:
        row = CategoryBudget(budget_id=budget.id, category_id=category_id, amount=amount)
        session.add(row)
        try:
            session.commit()
        except IntegrityError:
            # 같은 카테고리를 동시에 저장했다. 진 쪽은 되돌리고 이긴 행에 값을 덮는다.
            session.rollback()
            row = _category_budget_row(session, budget, category_id)
            if row is None:
                raise
        else:
            session.refresh(row)
            return row

    row.amount = amount
    row.deleted_at = None
    session.commit()
    session.refresh(row)
    return row


def delete_category_budget(
    session: Session, user: User, period: BudgetPeriod, category_id: uuid.UUID
) -> None:
    """없으면 아무것도 하지 않는다. 두 번 눌러도 같은 결과다.

    지울 때도 저장과 같은 소유 판정을 지난다. 한쪽만 검사하면 같은 자원에 규칙이 둘이 되어,
    없는 카테고리나 남의 카테고리로 보낸 요청이 저장에서는 422 인데 삭제에서는 204 로
    성공처럼 보인다. 전체 예산이 없는 것은 다르다. 지울 것 자체가 없으니 그대로 204 다.
    """
    categories.require_owned(session, user, category_id)
    budget = find_budget(session, user, period)
    if budget is None:
        return
    row = _category_budget_row(session, budget, category_id)
    if row is None or row.deleted_at is not None:
        return
    row.deleted_at = datetime.now(UTC)
    session.commit()


# ── 자동 이어쓰기 ───────────────────────────────────────


def _auto_carryover_enabled(session: Session, user: User) -> bool:
    """설정 행이 아직 없으면 켜진 것으로 본다. 그게 기본값이다."""
    value = session.scalar(
        select(UserPreference.budget_auto_carryover).where(UserPreference.user_id == user.id)
    )
    return True if value is None else bool(value)


def _snapshot(session: Session, period: BudgetPeriod, row: Budget | None) -> BudgetSnapshot | None:
    if row is None:
        return None
    return BudgetSnapshot(
        period=period,
        amount=Money(row.amount),
        category_budgets=tuple(
            CategoryBudgetInput(str(item.category_id), Money(item.amount))
            for item in _visible_category_budgets(session, row)
        ),
        is_auto_carried=row.is_auto_carried,
    )


def _copy_into(
    session: Session,
    user: User,
    period: BudgetPeriod,
    amount: Money,
    category_budgets: tuple[CategoryBudgetInput, ...],
) -> None:
    row = Budget(
        user_id=user.id,
        period_start=period.start,
        period_end=period.end,
        amount=amount.amount,
        is_auto_carried=True,
    )
    session.add(row)
    try:
        session.flush()
        for item in category_budgets:
            session.add(
                CategoryBudget(
                    budget_id=row.id,
                    category_id=uuid.UUID(item.category_id),
                    amount=item.amount.amount,
                )
            )
        session.commit()
    except IntegrityError:
        # 다른 요청이 먼저 만들었다. 이긴 행을 그대로 쓴다.
        session.rollback()


def ensure_carryover(session: Session, user: User, period: BudgetPeriod, today: date) -> None:
    """새 기간을 처음 열 때 직전 기간 예산을 그대로 이어 쓴다.

    조회가 쓰기를 하는 유일한 자리다. 달이 바뀌었다는 것을 알려 줄 사용자 동작이 따로 없어서,
    예산 상태를 만들기 직전이 이어쓰기를 확인할 수 있는 유일한 시점이다.

    오늘이 속한 기간에만 만든다. 지난달이나 다음달을 넘겨보는 것만으로 유령 예산이 생기면
    없던 예산이 생겼다 사라지는 것처럼 보이고, 과거 기간은 지금 고칠 수도 없다.
    """
    if not period.contains(today) or not period.is_full_month:
        return

    if find_budget(session, user, period) is not None:
        # decide_carryover 가 ALREADY_EXISTS 로 답할 자리를 앞당겨 끊는다. 판단을 다시
        # 하는 것이 아니라, 답이 정해진 경우에 넘길 값을 모으는 일을 그만두는 것이다.
        # 지난 기간 예산·양쪽 카테고리 예산·설정 조회 넷이 전부 버려지는데, 예산 블록을
        # 싣는 응답이 모두 여기를 지나서 기록 직후 응답도 같이 느려진다.
        # 나머지 분기(껐는지·지웠는지·지난달이 있는지)는 그대로 도메인 함수가 판단한다.
        return

    previous = period.previous_period()
    result = decide_carryover(
        current_budget=None,
        previous_budget=_snapshot(session, previous, find_budget(session, user, previous)),
        auto_carryover_enabled=_auto_carryover_enabled(session, user),
        # 지운 적이 있으면 소프트 삭제한 행이 남아 있다. 그 표시가 다시 만드는 것을 막는다.
        has_tombstone=_any_budget_row(session, user, period) is not None,
    )
    if not result.should_copy or result.amount is None:
        return
    _copy_into(session, user, period, result.amount, result.category_budgets)
