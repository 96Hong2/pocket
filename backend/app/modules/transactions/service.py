"""거래 저장·수정·조회와 저장 직후 피드백 판정.

숫자는 전부 app.domain 이 계산한다. 여기서 산식을 다시 쓰지 않는다.
기간 합계와 시간대는 app.modules.ledger, 예산 조회는 app.modules.budgets 가 맡는다.
"""

from __future__ import annotations

import base64
import binascii
import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import and_, func, or_, select
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
from app.domain.fingerprint import build_fingerprint
from app.domain.money import Money
from app.domain.period import BudgetPeriod
from app.models import Category, Transaction, User
from app.modules import ledger
from app.modules.budgets import service as budgets
from app.modules.categories import service as categories

logger = logging.getLogger(__name__)

__all__ = [
    "SEARCH_MAX_LENGTH",
    "UNDO_WINDOW",
    "SaveOutcome",
    "TransactionPage",
    "create_transaction",
    "delete_transaction",
    "evaluate",
    "list_transactions",
    "undo_deadline",
    "undo_transaction",
    "update_transaction",
]

# 검색어 상한. 스키마와 같은 값을 쓰라고 여기 한 곳에 둔다.
SEARCH_MAX_LENGTH = 60

# 저장 직후 이 시간 안에는 되돌릴 수 있다. 화면 스낵바가 이 값을 그대로 쓴다.
UNDO_WINDOW = timedelta(seconds=8)
# 왕복 지연과 사용자 반응 시간을 감안한 여유. 화면에 보인 시간 안에 눌렀는데 거절되면 안 된다.
UNDO_GRACE = timedelta(seconds=3)


@dataclass(frozen=True)
class SaveOutcome:
    """저장·수정 직후 화면에 돌려줄 것. 판정이 실패하면 budget_status 가 None 이다.

    today 를 함께 담는 이유: 예산 블록의 '지금 고칠 수 있나' 는 사용자 시간대의 오늘로
    정해진다. 응답을 만드는 라우터가 시각을 다시 구하면 두 값이 갈릴 수 있다.
    """

    feedback: FeedbackResult
    period: BudgetPeriod
    today: date
    budget_status: BudgetStatus | None
    is_auto_carried: bool = False


# ── 검증 ────────────────────────────────────────────────


def _refund_target(
    session: Session, user: User, tx_id: uuid.UUID | None, amount: Decimal | None
) -> Transaction | None:
    """환불 대상을 확인해 돌려준다. 환불이 아니면 None.

    막는 것이 셋이다.
    - 내 것이 아니거나 지출이 아닌 것에 붙이기
    - 대상 금액보다 많이 되돌리기
    - 같은 지출을 여러 번 되돌려 합계가 대상 금액을 넘기기
    셋 다 막지 않으면 환불이 지출 취소가 아니라 수입이 되어 남은 예산이 예산 총액보다 커진다.
    """
    if tx_id is None:
        return None

    target = _get_owned(session, user, tx_id)
    if target.type is not agg.TransactionType.EXPENSE:
        raise ApiError(
            ErrorCode.INVALID_REFUND_TARGET, "지출 기록에만 환불을 연결할 수 있어요.", 422
        )

    already = _refunded_total(session, target.id)
    if already + Decimal(amount or 0) > target.amount:
        raise ApiError(
            ErrorCode.INVALID_REFUND_TARGET, "환불 금액이 원래 지출보다 클 수 없어요.", 422
        )
    return target


def _refunded_total(
    session: Session, target_id: uuid.UUID, *, without: uuid.UUID | None = None
) -> Decimal:
    """그 지출에 이미 붙어 있는 환불 합계. 되돌린 환불은 세지 않는다."""
    stmt = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        Transaction.refund_of_transaction_id == target_id,
        Transaction.deleted_at.is_(None),
    )
    if without is not None:
        stmt = stmt.where(Transaction.id != without)
    return Decimal(session.scalar(stmt) or 0)


def _require_refund_consistency(session: Session, tx: Transaction, payload: dict) -> None:
    """수정이 환불 규칙을 깨지 않게 한다.

    저장 경로에서만 검사하면 수정으로 우회된다. 환불이 걸린 지출을 수입으로 바꾸면
    대상이 지출이 아니게 되고, 환불 금액을 올리면 원래 지출보다 커진다.
    """
    next_type = payload.get("type", tx.type)

    if tx.type is agg.TransactionType.EXPENSE and next_type is not agg.TransactionType.EXPENSE:
        attached = session.scalar(
            select(Transaction.id)
            .where(
                Transaction.refund_of_transaction_id == tx.id,
                Transaction.deleted_at.is_(None),
            )
            .limit(1)
        )
        if attached is not None:
            raise ApiError(
                ErrorCode.INVALID_REFUND_TARGET, "환불이 걸린 지출은 종류를 바꿀 수 없어요.", 422
            )

    if tx.refund_of_transaction_id is None:
        return

    if next_type is not agg.TransactionType.REFUND:
        raise ApiError(ErrorCode.INVALID_REFUND_TARGET, "환불 기록의 종류는 바꿀 수 없어요.", 422)

    target = session.get(Transaction, tx.refund_of_transaction_id)
    if target is None:
        return

    others = _refunded_total(session, target.id, without=tx.id)
    if others + Decimal(payload.get("amount", tx.amount)) > target.amount:
        raise ApiError(
            ErrorCode.INVALID_REFUND_TARGET, "환불 금액이 원래 지출보다 클 수 없어요.", 422
        )


def _normalized(data: dict) -> dict:
    """저장 형태로 맞춘다. 시각은 항상 UTC 다. 월 귀속은 조회할 때 사용자 시간대로 다시 본다."""
    payload = dict(data)
    occurred_at = payload.get("occurred_at")
    if occurred_at is not None:
        payload["occurred_at"] = occurred_at.astimezone(UTC)
    return payload


def _stamp_identity(tx: Transaction, user: User) -> None:
    """상호 정규화와 지문을 채운다.

    입력 경로가 달라도 같은 거래는 같은 지문이어야 한다. 그래야 줄글·캡처가
    이미 적은 것을 다시 올리지 않는다. 지문은 저장할 때 한 번만 만든다.
    """
    tz = ledger.user_tz(user)
    fingerprint = build_fingerprint(
        occurred_on=ledger.local_date(tx.occurred_at, tz),
        amount=Money(tx.amount),
        type=tx.type,
        merchant=tx.merchant,
    )
    tx.merchant_normalized = fingerprint.merchant_normalized or None
    tx.fingerprint = fingerprint.value


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
        carried = budgets.is_carried(session, user, period)
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
        return SaveOutcome(FeedbackResult(kind=FeedbackKind.MONTH_FACT), period, today, None)
    return SaveOutcome(result, period, today, status, is_auto_carried=carried)


# ── 저장 ────────────────────────────────────────────────


def create_transaction(
    session: Session, user: User, data: dict, *, today: date | None = None
) -> tuple[Transaction, SaveOutcome]:
    categories.require_owned(session, user, data.get("category_id"))
    target = _refund_target(session, user, data.get("refund_of_transaction_id"), data.get("amount"))

    payload = _normalized(data)
    if target is not None:
        # 환불의 예산 반영 여부와 분류는 되돌리는 지출이 정한다. 요청 본문 값을 믿지 않는다.
        # 예산에서 뺀 지출을 환불하면서 예산 제외를 안 붙이면 그 돈이 예산으로 되돌아온다.
        payload["excluded_from_budget"] = target.excluded_from_budget
        payload["category_id"] = target.category_id

    tx = Transaction(user_id=user.id, **payload)
    _stamp_identity(tx, user)
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
        categories.require_owned(session, user, payload["category_id"])
    if "amount" in payload and tx.source is agg.TransactionSource.NO_SPEND:
        # 무지출일 기록은 금액이 0 이라는 것 자체가 의미다.
        raise ApiError(ErrorCode.INVALID_REQUEST, "무지출일 기록의 금액은 바꿀 수 없어요.", 422)
    if "type" in payload and tx.source is agg.TransactionSource.NO_SPEND:
        raise ApiError(ErrorCode.INVALID_REQUEST, "무지출일 기록의 종류는 바꿀 수 없어요.", 422)

    _require_refund_consistency(session, tx, payload)

    for field, value in payload.items():
        setattr(tx, field, value)
    _stamp_identity(tx, user)
    session.commit()
    session.refresh(tx)

    return tx, evaluate(session, user, tx, today or ledger.today_for(user))


# ── 조회 ────────────────────────────────────────────────


@dataclass(frozen=True)
class TransactionPage:
    """한 페이지. next_cursor 가 None 이면 끝이다."""

    items: list[Transaction]
    next_cursor: str | None


def _like_pattern(text: str) -> str:
    """부분일치 패턴. 사용자가 넣은 % 와 _ 를 글자로 취급한다."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _encode_cursor(tx: Transaction) -> str:
    """정렬 키를 그대로 실어 보낸다. 페이지 번호가 아니라 '여기 다음' 이다."""
    raw = f"{ledger.as_utc(tx.occurred_at).isoformat()}|{tx.id}"
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def _decode_cursor(value: str) -> tuple[datetime, uuid.UUID]:
    """커서를 정렬 키로 되돌린다. 손으로 고친 값이 500 이 되지 않게 422 로 막는다."""
    try:
        padded = value + "=" * (-len(value) % 4)
        raw = base64.urlsafe_b64decode(padded.encode()).decode()
        at_text, id_text = raw.split("|", 1)
        at = datetime.fromisoformat(at_text)
        return (at if at.tzinfo is not None else at.replace(tzinfo=UTC)), uuid.UUID(id_text)
    except (ValueError, binascii.Error, UnicodeDecodeError) as exc:
        raise ApiError(ErrorCode.INVALID_REQUEST, "목록을 이어서 받지 못했어요.", 422) from exc


def list_transactions(
    session: Session,
    user: User,
    *,
    period: BudgetPeriod | None = None,
    day: date | None = None,
    query: str | None = None,
    limit: int = 50,
    cursor: str | None = None,
) -> TransactionPage:
    """최근 것이 앞에 오는 목록.

    정렬 키가 시각 하나면 같은 시각의 거래에서 페이지 경계가 흔들려 행이 빠지거나 겹친다.
    캡처로 한 번에 여러 건을 넣으면 시각이 실제로 같아진다. 그래서 (시각, id) 로 정렬한다.

    검색은 상호와 카테고리 이름을 함께 본다. 화면의 안내 문구가 그렇게 적혀 있다.

    기간과 날짜는 함께 걸린다(AND). 달력 화면은 그 달을 보면서 그 안의 한 날을 고르므로
    둘이 어긋날 일이 없고, 어긋나게 부르면 결과가 비는 것이 맞다.
    """
    tz = ledger.user_tz(user)
    stmt = select(Transaction).where(
        Transaction.user_id == user.id, Transaction.deleted_at.is_(None)
    )
    if period is not None:
        start, end = ledger.period_bounds(period, tz)
        stmt = stmt.where(Transaction.occurred_at >= start, Transaction.occurred_at < end)
    if day is not None:
        day_start, day_end = ledger.day_bounds(day, tz)
        stmt = stmt.where(Transaction.occurred_at >= day_start, Transaction.occurred_at < day_end)

    # 공백만 들어오면 검색하지 않는다. 패턴이 '%%' 가 되면 상호도 카테고리도 없는 행이
    # NULL ILIKE 때문에 조용히 탈락해, 검색이 아니라 목록을 줄이는 일이 된다.
    keyword = (query or "").strip()
    if keyword:
        pattern = _like_pattern(keyword)
        stmt = stmt.outerjoin(Category, Category.id == Transaction.category_id).where(
            or_(
                Transaction.merchant.ilike(pattern, escape="\\"),
                Category.name.ilike(pattern, escape="\\"),
            )
        )

    if cursor is not None:
        at, tx_id = _decode_cursor(cursor)
        stmt = stmt.where(
            or_(
                Transaction.occurred_at < at,
                and_(Transaction.occurred_at == at, Transaction.id < tx_id),
            )
        )

    # 한 건 더 받아 본다. 그 한 건이 있으면 다음 페이지가 있다는 뜻이다.
    stmt = stmt.order_by(Transaction.occurred_at.desc(), Transaction.id.desc()).limit(limit + 1)
    rows = list(session.scalars(stmt))

    if len(rows) <= limit:
        return TransactionPage(items=rows, next_cursor=None)
    page = rows[:limit]
    return TransactionPage(items=page, next_cursor=_encode_cursor(page[-1]))


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
