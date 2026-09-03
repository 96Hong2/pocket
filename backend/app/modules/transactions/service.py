"""거래 저장·수정·조회와 저장 직후 피드백 판정.

숫자는 전부 app.domain 이 계산한다. 여기서 산식을 다시 쓰지 않는다.
기간 합계와 시간대는 app.modules.ledger, 예산 조회는 app.modules.budgets 가 맡는다.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.errors import ApiError, ErrorCode
from app.domain import aggregation as agg
from app.domain.budget import BudgetStatus
from app.domain.feedback import (
    FeedbackInput,
    FeedbackKind,
    FeedbackResult,
    SavedTransaction,
    evaluate_feedback,
)
from app.domain.money import Money
from app.domain.period import BudgetPeriod
from app.models import Category, Transaction, User
from app.modules import ledger
from app.modules.budgets import service as budgets

logger = logging.getLogger(__name__)

__all__ = [
    "UNDO_WINDOW",
    "SaveOutcome",
    "create_transaction",
    "delete_transaction",
    "evaluate",
    "list_transactions",
    "undo_deadline",
    "undo_transaction",
    "update_transaction",
]

# 저장 직후 이 시간 안에는 되돌릴 수 있다. 화면 스낵바가 이 값을 그대로 쓴다.
UNDO_WINDOW = timedelta(seconds=8)
# 왕복 지연과 사용자 반응 시간을 감안한 여유. 화면에 보인 시간 안에 눌렀는데 거절되면 안 된다.
UNDO_GRACE = timedelta(seconds=3)


@dataclass(frozen=True)
class SaveOutcome:
    """저장·수정 직후 화면에 돌려줄 것. 판정이 실패하면 budget_status 가 None 이다."""

    feedback: FeedbackResult
    period: BudgetPeriod
    budget_status: BudgetStatus | None


# ── 검증 ────────────────────────────────────────────────


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
        raise ApiError(ErrorCode.INVALID_CATEGORY, "카테고리를 찾지 못했어요.", status_code=422)


def _require_refund_target(session: Session, user: User, tx_id: uuid.UUID | None) -> None:
    """환불은 내 지출에만 연결한다."""
    if tx_id is None:
        return
    target = _get_owned(session, user, tx_id)
    if target.type is not agg.TransactionType.EXPENSE:
        raise ApiError(
            ErrorCode.INVALID_REFUND_TARGET, "지출 기록에만 환불을 연결할 수 있어요.", 422
        )


def _normalized(data: dict) -> dict:
    """저장 형태로 맞춘다. 시각은 항상 UTC 다. 월 귀속은 조회할 때 사용자 시간대로 다시 본다."""
    payload = dict(data)
    occurred_at = payload.get("occurred_at")
    if occurred_at is not None:
        payload["occurred_at"] = occurred_at.astimezone(UTC)
    return payload


# ── 판정 ────────────────────────────────────────────────


def evaluate(session: Session, user: User, tx: Transaction, today: date) -> SaveOutcome:
    """피드백 판정이 실패해도 저장은 성공이다.

    저장을 commit 한 뒤에 판정하므로, 여기서 예외가 새면 '행은 남았는데 500' 이 된다.
    클라이언트가 재시도하면 같은 거래가 두 번 저장된다. 그래서 흡수한다.
    흡수했을 때는 예산 상태를 만들 수 없어 None 이다. 화면은 홈을 다시 불러 채운다.
    """
    tz = ledger.user_tz(user)
    period = ledger.period_for(user, ledger.local_date(tx.occurred_at, tz))
    try:
        totals = ledger.load_period_totals(session, user, period)
        status = budgets.budget_status(session, user, period, totals, today)
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
                category_budget_amount=budgets.category_budget_amount(
                    session, user, period, tx.category_id
                ),
                category_budgeted_spend=totals.category_budgeted_spend.get(cat_key),
            )
        )
    except Exception:
        logger.exception("피드백 판정에 실패했다. 저장은 유지한다 transaction_id=%s", tx.id)
        return SaveOutcome(FeedbackResult(kind=FeedbackKind.MONTH_FACT), period, None)
    return SaveOutcome(result, period, status)


# ── 저장 ────────────────────────────────────────────────


def create_transaction(
    session: Session, user: User, data: dict, *, today: date | None = None
) -> tuple[Transaction, SaveOutcome]:
    _require_category(session, user, data.get("category_id"))
    _require_refund_target(session, user, data.get("refund_of_transaction_id"))

    tx = Transaction(user_id=user.id, **_normalized(data))
    session.add(tx)
    session.commit()
    session.refresh(tx)

    return tx, evaluate(session, user, tx, today or ledger.today_for(user))


def update_transaction(
    session: Session, user: User, tx_id: uuid.UUID, data: dict, *, today: date | None = None
) -> tuple[Transaction, SaveOutcome]:
    """피드백 화면에서 카테고리를 눌러 고치는 동선이 쓴다.

    검증과 시각 정규화는 저장과 같은 것을 쓴다. 여기서 규칙을 다시 쓰면 두 경로가 어긋난다.
    """
    tx = _get_owned(session, user, tx_id)
    payload = _normalized(data)

    if "category_id" in payload:
        _require_category(session, user, payload["category_id"])
    if "amount" in payload and tx.source is agg.TransactionSource.NO_SPEND:
        # 무지출일 기록은 금액이 0 이라는 것 자체가 의미다.
        raise ApiError(ErrorCode.INVALID_REQUEST, "무지출일 기록의 금액은 바꿀 수 없어요.", 422)

    for field, value in payload.items():
        setattr(tx, field, value)
    session.commit()
    session.refresh(tx)

    return tx, evaluate(session, user, tx, today or ledger.today_for(user))


# ── 조회 ────────────────────────────────────────────────


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
        start, end = ledger.period_bounds(period, ledger.user_tz(user))
        stmt = stmt.where(Transaction.occurred_at >= start, Transaction.occurred_at < end)
    stmt = stmt.order_by(Transaction.occurred_at.desc()).limit(limit)
    return list(session.scalars(stmt))


# ── 삭제·되돌리기 ───────────────────────────────────────


def _age(created_at: datetime) -> timedelta:
    """저장된 지 얼마나 지났나. DB 에 따라 시간대가 없을 수 있어 맞춰 준다."""
    return datetime.now(UTC) - ledger.as_utc(created_at)


def undo_deadline(tx: Transaction) -> datetime:
    """되돌리기 마감 시각(UTC). 백그라운드에 다녀온 화면이 남은 시간을 보정하는 데 쓴다."""
    return ledger.as_utc(tx.created_at) + UNDO_WINDOW


def _get_owned(session: Session, user: User, tx_id: uuid.UUID) -> Transaction:
    tx = session.get(Transaction, tx_id)
    if tx is None or tx.user_id != user.id or tx.deleted_at is not None:
        raise ApiError(ErrorCode.NOT_FOUND, "거래를 찾지 못했어요.", status_code=404)
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
        raise ApiError(ErrorCode.UNDO_EXPIRED, "되돌릴 수 있는 시간이 지났어요.", status_code=409)
    tx.deleted_at = datetime.now(UTC)
    session.commit()
