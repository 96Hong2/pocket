"""거래 저장·조회와 저장 직후 피드백 판정.

숫자는 전부 app.domain 이 계산한다. 여기서 산식을 다시 쓰지 않는다.

시간대 규칙(중요): 저장은 UTC 로 정규화하고, 월 경계와 '오늘'은 사용자 시간대
(`users.timezone`, 기본 Asia/Seoul)로 판단한다. UTC 로 날짜를 뽑으면 한국에서
자정부터 아침 9시까지 저장한 거래가 전달로 집계된다.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.domain import aggregation as agg
from app.domain.budget import BudgetStatus, evaluate_budget
from app.domain.feedback import (
    FeedbackInput,
    FeedbackKind,
    FeedbackResult,
    SavedTransaction,
    evaluate_feedback,
)
from app.domain.money import Money
from app.domain.period import BudgetPeriod
from app.models import Budget, Category, CategoryBudget, Transaction, User

logger = logging.getLogger(__name__)

__all__ = [
    "UNDO_WINDOW",
    "create_transaction",
    "delete_transaction",
    "list_transactions",
    "load_period_totals",
    "period_for",
    "today_for",
    "undo_transaction",
]

# 저장 직후 이 시간 안에는 되돌릴 수 있다. 화면 스낵바가 이 값을 그대로 쓴다.
UNDO_WINDOW = timedelta(seconds=8)
# 왕복 지연과 사용자 반응 시간을 감안한 여유. 화면에 보인 시간 안에 눌렀는데 거절되면 안 된다.
UNDO_GRACE = timedelta(seconds=3)

DEFAULT_TIMEZONE = "Asia/Seoul"


# ── 시간대 ──────────────────────────────────────────────


def user_tz(user: User) -> ZoneInfo:
    """사용자 시간대. 값이 깨져 있어도 앱이 죽지 않게 기본값으로 떨어진다."""
    try:
        return ZoneInfo(user.timezone or DEFAULT_TIMEZONE)
    except (ZoneInfoNotFoundError, ValueError):
        logger.warning("알 수 없는 시간대라 기본값을 쓴다 timezone=%s", user.timezone)
        return ZoneInfo(DEFAULT_TIMEZONE)


def _as_utc(value: datetime) -> datetime:
    """DB 가 시간대 없는 값을 돌려주면(SQLite) UTC 로 본다. PostgreSQL 은 그대로다."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def _local_date(value: datetime, tz: ZoneInfo) -> date:
    return _as_utc(value).astimezone(tz).date()


def today_for(user: User) -> date:
    """사용자 기준 오늘. 서버가 UTC 로 돌아도 한국 사용자에게는 KST 날짜다."""
    return datetime.now(user_tz(user)).date()


def period_for(user: User, day: date) -> BudgetPeriod:
    del user  # 기간은 달력 월 고정이다. 사용자별 시작일은 없다(ADR-0007 전제).
    return BudgetPeriod.containing(day)


def _period_bounds(period: BudgetPeriod, tz: ZoneInfo) -> tuple[datetime, datetime]:
    """기간의 [시작, 끝+1일) 을 사용자 시간대 자정 기준으로 만들어 UTC 로 넘긴다."""
    start = datetime.combine(period.start, time.min, tzinfo=tz).astimezone(UTC)
    end = datetime.combine(period.end + timedelta(days=1), time.min, tzinfo=tz).astimezone(UTC)
    return start, end


# ── 조회 ────────────────────────────────────────────────


def _to_domain(tx: Transaction, tz: ZoneInfo) -> agg.TransactionInput:
    return agg.TransactionInput(
        occurred_on=_local_date(tx.occurred_at, tz),
        amount=Money(tx.amount),
        type=tx.type,
        category_id=str(tx.category_id) if tx.category_id else None,
        excluded_from_budget=tx.excluded_from_budget,
        is_deleted=tx.deleted_at is not None,
    )


def _period_transactions(session: Session, user: User, period: BudgetPeriod) -> list[Transaction]:
    start, end = _period_bounds(period, user_tz(user))
    stmt = (
        select(Transaction)
        .where(
            Transaction.user_id == user.id,
            Transaction.deleted_at.is_(None),
            Transaction.occurred_at >= start,
            Transaction.occurred_at < end,
        )
        .order_by(Transaction.occurred_at.desc())
    )
    return list(session.scalars(stmt))


def load_period_totals(session: Session, user: User, period: BudgetPeriod) -> agg.PeriodTotals:
    tz = user_tz(user)
    rows = _period_transactions(session, user, period)
    return agg.aggregate_period([_to_domain(t, tz) for t in rows], period)


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


# ── 저장 ────────────────────────────────────────────────


def _require_category(session: Session, user: User, category_id: uuid.UUID | None) -> None:
    """내 카테고리이거나 기본 카테고리(user_id NULL)여야 한다."""
    if category_id is None:
        return
    found = session.scalar(
        select(Category.id).where(
            Category.id == category_id,
            Category.deleted_at.is_(None),
            # NULL 은 IN 으로 못 잡는다. 기본 카테고리(user_id NULL)를 놓치지 않게 따로 쓴다.
            or_(Category.user_id == user.id, Category.user_id.is_(None)),
        )
    )
    if found is None:
        raise ApiError("INVALID_CATEGORY", "카테고리를 찾지 못했어요.", status_code=422)


def _require_refund_target(session: Session, user: User, tx_id: uuid.UUID | None) -> None:
    """환불은 내 지출에만 연결한다."""
    if tx_id is None:
        return
    target = _get_owned(session, user, tx_id)
    if target.type is not agg.TransactionType.EXPENSE:
        raise ApiError("INVALID_REFUND_TARGET", "지출 기록에만 환불을 연결할 수 있어요.", 422)


def _safe_feedback(
    session: Session, user: User, tx: Transaction, today: date
) -> tuple[FeedbackResult, BudgetPeriod]:
    """피드백 판정이 실패해도 저장은 성공이다.

    저장을 commit 한 뒤에 판정하므로, 여기서 예외가 새면 '행은 남았는데 500' 이 된다.
    클라이언트가 재시도하면 같은 거래가 두 번 저장된다. 그래서 흡수한다.
    """
    tz = user_tz(user)
    period = period_for(user, _local_date(tx.occurred_at, tz))
    try:
        totals = load_period_totals(session, user, period)
        status = _budget_status(session, user, period, totals, today)
        cat_key = str(tx.category_id) if tx.category_id else None
        result = evaluate_feedback(
            FeedbackInput(
                saved=SavedTransaction(
                    amount=Money(tx.amount),
                    type=tx.type,
                    category_id=cat_key,
                    excluded_from_budget=tx.excluded_from_budget,
                ),
                month_expense=totals.month_expense,
                budget_status=status if status.has_budget else None,
                category_budget_amount=_category_budget(session, user, period, tx.category_id),
                category_budgeted_spend=totals.category_budgeted_spend.get(cat_key),
            )
        )
    except Exception:
        logger.exception("피드백 판정에 실패했다. 저장은 유지한다 transaction_id=%s", tx.id)
        return FeedbackResult(kind=FeedbackKind.MONTH_FACT), period
    return result, period


def create_transaction(
    session: Session, user: User, data: dict, *, today: date | None = None
) -> tuple[Transaction, FeedbackResult]:
    _require_category(session, user, data.get("category_id"))
    _require_refund_target(session, user, data.get("refund_of_transaction_id"))

    payload = dict(data)
    # 저장은 항상 UTC 로 맞춘다. 월 귀속은 조회할 때 사용자 시간대로 다시 계산한다.
    payload["occurred_at"] = payload["occurred_at"].astimezone(UTC)

    tx = Transaction(user_id=user.id, **payload)
    session.add(tx)
    session.commit()
    session.refresh(tx)

    feedback, _ = _safe_feedback(session, user, tx, today or today_for(user))
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
        start, end = _period_bounds(period, user_tz(user))
        stmt = stmt.where(Transaction.occurred_at >= start, Transaction.occurred_at < end)
    stmt = stmt.order_by(Transaction.occurred_at.desc()).limit(limit)
    return list(session.scalars(stmt))


def _age(created_at: datetime) -> timedelta:
    """저장된 지 얼마나 지났나. DB 에 따라 시간대가 없을 수 있어 맞춰 준다."""
    return datetime.now(UTC) - _as_utc(created_at)


def undo_deadline(tx: Transaction) -> datetime:
    """되돌리기 마감 시각(UTC). 응답에 실어 화면이 절대 시각으로 세게 한다."""
    return _as_utc(tx.created_at) + UNDO_WINDOW


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
    """방금 저장한 것을 되돌린다. 저장 직후 짧은 시간에만 허용한다.

    판정에 UNDO_GRACE 를 더하는 이유: 화면에는 UNDO_WINDOW 초가 보이는데
    왕복 지연 때문에 그보다 늦게 도착한다. 보인 시간 안에 눌렀으면 통과해야 한다.
    """
    tx = _get_owned(session, user, tx_id)
    if _age(tx.created_at) > UNDO_WINDOW + UNDO_GRACE:
        raise ApiError("UNDO_EXPIRED", "되돌릴 수 있는 시간이 지났어요.", status_code=409)
    tx.deleted_at = datetime.now(UTC)
    session.commit()
