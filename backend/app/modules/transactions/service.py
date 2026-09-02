"""거래 저장·조회와 저장 직후 피드백 판정.

숫자는 전부 app.domain 이 계산한다. 여기서 산식을 다시 쓰지 않는다.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.domain import aggregation as agg
from app.domain.budget import BudgetStatus, evaluate_budget
from app.domain.feedback import (
    FeedbackInput,
    FeedbackResult,
    SavedTransaction,
    evaluate_feedback,
)
from app.domain.money import Money
from app.domain.period import BudgetPeriod
from app.models import Budget, CategoryBudget, Transaction, User

__all__ = [
    "UNDO_WINDOW",
    "create_transaction",
    "delete_transaction",
    "list_transactions",
    "load_period_totals",
    "undo_transaction",
]

# 저장 직후 이 시간 안에는 되돌릴 수 있다.
UNDO_WINDOW = timedelta(seconds=8)


def _to_domain(tx: Transaction) -> agg.TransactionInput:
    return agg.TransactionInput(
        occurred_on=tx.occurred_at.date(),
        amount=Money(tx.amount),
        type=agg.TransactionType(tx.type.value if hasattr(tx.type, "value") else tx.type),
        category_id=str(tx.category_id) if tx.category_id else None,
        excluded_from_budget=tx.excluded_from_budget,
        is_deleted=tx.deleted_at is not None,
    )


def _period_transactions(session: Session, user: User, period: BudgetPeriod) -> list[Transaction]:
    stmt = (
        select(Transaction)
        .where(
            Transaction.user_id == user.id,
            Transaction.deleted_at.is_(None),
            Transaction.occurred_at >= datetime.combine(period.start, datetime.min.time()),
            Transaction.occurred_at
            < datetime.combine(period.end + timedelta(days=1), datetime.min.time()),
        )
        .order_by(Transaction.occurred_at.desc())
    )
    return list(session.scalars(stmt))


def load_period_totals(session: Session, user: User, period: BudgetPeriod) -> agg.PeriodTotals:
    rows = _period_transactions(session, user, period)
    return agg.aggregate_period([_to_domain(t) for t in rows], period)


def _budget_status(
    session: Session, user: User, period: BudgetPeriod, totals: agg.PeriodTotals, today: date
) -> BudgetStatus:
    budget = session.scalar(
        select(Budget).where(
            Budget.user_id == user.id,
            Budget.period_start == period.start,
            Budget.deleted_at.is_(None),
        )
    )
    return evaluate_budget(
        budget_amount=Money(budget.amount) if budget else None,
        budgeted_spend=totals.budgeted_spend,
        period=period,
        today=today,
    )


def _category_budget(
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


def create_transaction(
    session: Session, user: User, data: dict, *, today: date | None = None
) -> tuple[Transaction, FeedbackResult]:
    tx = Transaction(user_id=user.id, **data)
    session.add(tx)
    session.commit()
    session.refresh(tx)

    today = today or datetime.now(UTC).date()
    period = BudgetPeriod.containing(tx.occurred_at.date())
    totals = load_period_totals(session, user, period)
    status = _budget_status(session, user, period, totals, today)

    cat_key = str(tx.category_id) if tx.category_id else None
    feedback = evaluate_feedback(
        FeedbackInput(
            saved=SavedTransaction(
                amount=Money(tx.amount),
                type=agg.TransactionType(tx.type.value if hasattr(tx.type, "value") else tx.type),
                category_id=cat_key,
                excluded_from_budget=tx.excluded_from_budget,
            ),
            month_expense=totals.month_expense,
            budget_status=status if status.has_budget else None,
            category_budget_amount=_category_budget(session, user, period, tx.category_id),
            category_budgeted_spend=totals.category_budgeted_spend.get(cat_key),
        )
    )
    return tx, feedback


def list_transactions(
    session: Session,
    user: User,
    *,
    period: BudgetPeriod | None = None,
    limit: int = 50,
) -> list[Transaction]:
    stmt = select(Transaction).where(
        Transaction.user_id == user.id, Transaction.deleted_at.is_(None)
    )
    if period is not None:
        stmt = stmt.where(
            Transaction.occurred_at >= datetime.combine(period.start, datetime.min.time()),
            Transaction.occurred_at
            < datetime.combine(period.end + timedelta(days=1), datetime.min.time()),
        )
    stmt = stmt.order_by(Transaction.occurred_at.desc()).limit(limit)
    return list(session.scalars(stmt))


def _age(created_at: datetime) -> timedelta:
    """저장된 지 얼마나 지났나. DB 에 따라 시간대가 없을 수 있어 맞춰 준다."""
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    return datetime.now(UTC) - created_at


def _get_owned(session: Session, user: User, tx_id: uuid.UUID) -> Transaction:
    tx = session.get(Transaction, tx_id)
    if tx is None or tx.user_id != user.id or tx.deleted_at is not None:
        raise ApiError("NOT_FOUND", "거래를 찾지 못했어요.", status_code=404)
    return tx


def delete_transaction(session: Session, user: User, tx_id: uuid.UUID) -> None:
    """실제로 지우지 않고 표시만 남긴다. 되돌려도 합계가 맞아야 한다."""
    tx = _get_owned(session, user, tx_id)
    tx.deleted_at = datetime.now(UTC)
    session.commit()


def undo_transaction(session: Session, user: User, tx_id: uuid.UUID) -> None:
    """방금 저장한 것을 되돌린다. 저장 직후 짧은 시간에만 허용한다."""
    tx = _get_owned(session, user, tx_id)
    if _age(tx.created_at) > UNDO_WINDOW:
        raise ApiError("UNDO_EXPIRED", "되돌릴 수 있는 시간이 지났어요.", status_code=409)
    tx.deleted_at = datetime.now(UTC)
    session.commit()
