"""자산 장부 줄 쓰기와 다시 접기(ADR-0045).

항목 값의 정본은 장부(`asset_entries`)를 들어온 순서로 접은 결과이고, 오늘 스냅샷 행은 그 사본이다.
거래 쓰기 네 길(저장, 고치기, 지우기, 되돌리기)과 PUT /assets 가 이 파일의 함수만 지나 장부를
바꾼다. commit 은 부르는 쪽이 한다. 그래야 거래와 장부가 같은 commit 에 묶인다.

**거래가 바꾸는 것은 늘 오늘 스냅샷이다.** 오늘 스냅샷이 없으면 최신을 오늘로 복사한 뒤 적는다.
지난 날짜의 스냅샷(월말 점)은 고치지 않는다.
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.amounts import MAX_AMOUNT
from app.api.errors import ApiError, ErrorCode
from app.domain.aggregation import TransactionType
from app.domain.asset_ledger import (
    EntrySide,
    Holding,
    InvestKind,
    LedgerError,
    LedgerFold,
    LedgerLine,
    LedgerState,
    RateKind,
    SellOutcome,
    fold,
    holding_of,
    item_rate,
    item_value,
)
from app.domain.assets import AssetGroup
from app.domain.money import Money
from app.domain.period import BudgetPeriod
from app.models import Transaction, User
from app.models.asset import AssetEntry, AssetItem as AssetItemRow, AssetSnapshot, AssetSource
from app.modules import ledger
from app.modules.assets.schemas import MAX_ITEMS

logger = logging.getLogger(__name__)

__all__ = [
    "AssetResult",
    "ItemFigures",
    "add_entry",
    "add_item",
    "asset_labels",
    "asset_result",
    "copy_row",
    "ensure_today_snapshot",
    "has_ledger",
    "item_figures",
    "latest_snapshot",
    "ledger_error",
    "live_rows",
    "month_saved",
    "refold",
    "row_for_key",
    "snapshot_on",
    "start_line_if_new",
    "sync_transaction",
]

# 같은 commit 에서 두 줄이 생겨도 순서가 갈리게 앞 줄보다 이만큼 늦게 찍는다.
_STAMP_STEP = timedelta(microseconds=1)

_LEDGER_MESSAGES = {
    "over_sell": "가진 것보다 많이 팔 수 없어요.",
    "over_repay": "남은 금액보다 많이 갚을 수 없어요.",
    "sell_not_allowed": "이 항목은 팔았어요로 적을 수 없어요.",
    "quantity_required": "주식, ETF, 코인은 수량을 적어 주세요.",
    "quantity_not_allowed": "이 항목은 수량을 적지 않아요.",
}


def ledger_error(error: LedgerError) -> ApiError:
    return ApiError(
        ErrorCode.INVALID_REQUEST,
        _LEDGER_MESSAGES.get(error.code, "장부를 맞출 수 없어요."),
        422,
    )


# ── 스냅샷 ────────────────────────────────────────────────


def latest_snapshot(session: Session, user: User) -> AssetSnapshot | None:
    """가장 최근 스냅샷 한 건. 없으면 None 이고 그것이 정상 상태다.

    기준일이 같은 것이 둘 있으면 나중에 만든 것을 쓴다. 동시에 두 요청이 들어와 둘 다
    만들었을 때 조회가 늘 같은 답을 주게 순서를 못 박는다.
    """
    return session.scalar(
        select(AssetSnapshot)
        .where(AssetSnapshot.user_id == user.id, AssetSnapshot.deleted_at.is_(None))
        .order_by(AssetSnapshot.effective_on.desc(), AssetSnapshot.created_at.desc())
        .options(selectinload(AssetSnapshot.items))
        .limit(1)
    )


def snapshot_on(session: Session, user: User, day: date) -> AssetSnapshot | None:
    return session.scalar(
        select(AssetSnapshot)
        .where(
            AssetSnapshot.user_id == user.id,
            AssetSnapshot.effective_on == day,
            AssetSnapshot.deleted_at.is_(None),
        )
        .order_by(AssetSnapshot.created_at.desc())
        .options(selectinload(AssetSnapshot.items))
        .limit(1)
    )


def live_rows(snapshot: AssetSnapshot | None) -> list[AssetItemRow]:
    if snapshot is None:
        return []
    rows = [row for row in snapshot.items if row.deleted_at is None]
    rows.sort(key=lambda row: row.sort_order)
    return rows


def row_for_key(snapshot: AssetSnapshot | None, key: uuid.UUID) -> AssetItemRow | None:
    return next((row for row in live_rows(snapshot) if row.item_key == key), None)


def copy_row(row: AssetItemRow, sort_order: int) -> AssetItemRow:
    """다른 날 스냅샷으로 옮길 사본. 키가 비어 있던 옛 행이면 여기서 키를 준다."""
    return AssetItemRow(
        group=row.group,
        label=row.label,
        amount=row.amount,
        confidence=row.confidence,
        sort_order=sort_order,
        item_key=row.item_key or uuid.uuid4(),
        kind=row.kind,
        monthly_amount=row.monthly_amount,
        quantity=row.quantity,
        cost_basis=row.cost_basis,
        unit_price=row.unit_price,
        price_noted_on=row.price_noted_on,
    )


def ensure_today_snapshot(session: Session, user: User, today: date) -> AssetSnapshot:
    """오늘 스냅샷. 없으면 최신 목록을 오늘로 복사해 만든다(하루 하나)."""
    snapshot = snapshot_on(session, user, today)
    if snapshot is not None:
        return snapshot
    rows = live_rows(latest_snapshot(session, user))
    snapshot = AssetSnapshot(user_id=user.id, effective_on=today, source=AssetSource.MANUAL)
    snapshot.items = [copy_row(row, index) for index, row in enumerate(rows)]
    session.add(snapshot)
    session.flush()
    return snapshot


def add_item(
    session: Session,
    user: User,
    today: date,
    *,
    group: AssetGroup,
    kind: InvestKind | str | None,
    label: str | None,
) -> uuid.UUID:
    """기록 흐름에서 고른 새 항목을 오늘 스냅샷 끝에 붙인다. 같은 그룹·종류·이름이 있으면 그 키."""
    invest_kind = InvestKind(kind) if kind is not None else None
    snapshot = ensure_today_snapshot(session, user, today)
    rows = live_rows(snapshot)
    for row in rows:
        if row.group is group and row.kind == invest_kind and row.label == label:
            if row.item_key is None:
                row.item_key = uuid.uuid4()
            return row.item_key
    if len(rows) >= MAX_ITEMS:
        raise ApiError(ErrorCode.INVALID_REQUEST, "자산 항목이 너무 많아요.", 422)
    holding = holding_of(group, invest_kind)
    row = AssetItemRow(
        group=group,
        label=label,
        amount=Decimal(0),
        confidence=1.0,
        sort_order=(rows[-1].sort_order + 1) if rows else 0,
        item_key=uuid.uuid4(),
        kind=invest_kind,
        quantity=Decimal(0) if holding is Holding.QUANTITY else None,
        cost_basis=Decimal(0) if holding in (Holding.QUANTITY, Holding.AMOUNT) else None,
    )
    snapshot.items.append(row)
    session.flush()
    assert row.item_key is not None
    return row.item_key


def asset_labels(
    session: Session, user: User, keys: Iterable[uuid.UUID | None]
) -> dict[uuid.UUID, str | None]:
    """키마다 최신 스냅샷의 이름. 거래 목록의 「어디에」 글씨가 쓴다."""
    wanted = {key for key in keys if key is not None}
    if not wanted:
        return {}
    return {
        row.item_key: row.label
        for row in live_rows(latest_snapshot(session, user))
        if row.item_key in wanted
    }


# ── 장부 ────────────────────────────────────────────────


def _entries(session: Session, user: User, keys: Iterable[uuid.UUID]) -> list[AssetEntry]:
    wanted = list(set(keys))
    if not wanted:
        return []
    rows = session.scalars(
        select(AssetEntry).where(
            AssetEntry.user_id == user.id,
            AssetEntry.item_key.in_(wanted),
            AssetEntry.deleted_at.is_(None),
        )
    ).all()
    return sorted(rows, key=lambda entry: (ledger.as_utc(entry.created_at), str(entry.id)))


def has_ledger(session: Session, user: User, key: uuid.UUID) -> bool:
    found = session.scalar(
        select(AssetEntry.id)
        .where(
            AssetEntry.user_id == user.id,
            AssetEntry.item_key == key,
            AssetEntry.deleted_at.is_(None),
        )
        .limit(1)
    )
    return found is not None


def _next_stamp(session: Session, user: User, key: uuid.UUID) -> datetime:
    last = session.scalar(
        select(func.max(AssetEntry.created_at)).where(
            AssetEntry.user_id == user.id, AssetEntry.item_key == key
        )
    )
    now = datetime.now(UTC)
    if last is None:
        return now
    return max(now, ledger.as_utc(last) + _STAMP_STEP)


def add_entry(
    session: Session,
    user: User,
    key: uuid.UUID,
    *,
    side: EntrySide,
    amount: Decimal,
    occurred_on: date,
    quantity: Decimal | None = None,
    cost_basis: Decimal | None = None,
    transaction_id: uuid.UUID | None = None,
) -> AssetEntry:
    entry = AssetEntry(
        user_id=user.id,
        item_key=key,
        side=side,
        amount=amount,
        quantity=quantity,
        cost_basis=cost_basis,
        transaction_id=transaction_id,
        occurred_on=occurred_on,
        created_at=_next_stamp(session, user, key),
    )
    session.add(entry)
    session.flush()
    return entry


def set_line_values(
    row: AssetItemRow,
) -> tuple[Decimal, Decimal | None, Decimal | None]:
    """스냅샷 행의 지금 값을 set 줄 (금액, 수량, 넣은 돈) 으로. 수량 종목의 금액은 넣은 돈이다."""
    holding = holding_of(row.group, row.kind)
    if holding is Holding.QUANTITY:
        cost = row.cost_basis if row.cost_basis is not None else row.amount
        quantity = row.quantity if row.quantity is not None else Decimal(0)
        return cost, quantity, cost
    if holding is Holding.AMOUNT:
        cost = row.cost_basis if row.cost_basis is not None else row.amount
        return row.amount, None, cost
    return row.amount, None, None


def start_line_if_new(session: Session, user: User, row: AssetItemRow, today: date) -> None:
    """처음 장부가 생기는 항목은 지금 값으로 set 시작 줄을 먼저 남긴다."""
    assert row.item_key is not None
    if has_ledger(session, user, row.item_key):
        return
    amount, quantity, cost = set_line_values(row)
    add_entry(
        session,
        user,
        row.item_key,
        side=EntrySide.SET,
        amount=amount,
        quantity=quantity,
        cost_basis=cost,
        occurred_on=today,
    )


def _line(entry: AssetEntry) -> LedgerLine:
    return LedgerLine(
        ref=entry.id,
        side=entry.side,
        amount=Money(entry.amount),
        quantity=entry.quantity,
        cost_basis=Money(entry.cost_basis) if entry.cost_basis is not None else None,
    )


def _fold(holding: Holding, entries: Sequence[AssetEntry]) -> LedgerFold:
    try:
        return fold(holding, [_line(entry) for entry in entries])
    except LedgerError as error:
        raise ledger_error(error) from error


def _write(row: AssetItemRow, holding: Holding, state: LedgerState) -> None:
    unit_price = Money(row.unit_price) if row.unit_price is not None else None
    value = item_value(holding, state, unit_price).amount
    if value > MAX_AMOUNT:
        raise ApiError(ErrorCode.INVALID_REQUEST, "금액이 너무 커요.", 422)
    row.amount = value
    row.quantity = state.quantity
    row.cost_basis = state.cost_basis.amount if state.cost_basis is not None else None


def refold(session: Session, user: User, today: date, keys: Iterable[uuid.UUID]) -> None:
    """장부를 처음부터 다시 접어 오늘 스냅샷 행에 적는다. 음수 보유가 되면 422."""
    wanted = set(keys)
    if not wanted:
        return
    snapshot = ensure_today_snapshot(session, user, today)
    grouped: dict[uuid.UUID, list[AssetEntry]] = defaultdict(list)
    for entry in _entries(session, user, wanted):
        grouped[entry.item_key].append(entry)
    for key in wanted:
        row = row_for_key(snapshot, key)
        if row is None:
            # 항목이 목록에서 지워졌다. 장부는 남아도 적을 자리가 없다.
            continue
        holding = holding_of(row.group, row.kind)
        result = _fold(holding, grouped.get(key, []))
        if grouped.get(key):
            _write(row, holding, result.state)
    session.flush()


# ── 거래 ────────────────────────────────────────────────


def _transaction_entry(session: Session, tx: Transaction) -> AssetEntry | None:
    return session.scalar(
        select(AssetEntry)
        .where(AssetEntry.transaction_id == tx.id, AssetEntry.deleted_at.is_(None))
        .limit(1)
    )


def _wants_entry(tx: Transaction) -> bool:
    return (
        tx.deleted_at is None
        and tx.type is TransactionType.TRANSFER
        and tx.asset_item_key is not None
    )


def sync_transaction(session: Session, user: User, tx: Transaction, today: date) -> None:
    """거래 한 건의 장부 줄을 거래 칸에 맞추고, 닿은 항목을 다시 접는다.

    같은 항목 안에서 금액·수량·날짜만 바뀌면 줄은 자기 자리(들어온 순서)를 지킨다.
    항목이 바뀌면 옛 줄을 지우고 새 항목 장부 끝에 붙인다. 그 항목의 손 수정 뒤에 놓여야
    넣은 돈이 손 수정에 먹히지 않는다.
    """
    entry = _transaction_entry(session, tx)
    touched: set[uuid.UUID] = set()
    now = datetime.now(UTC)

    if entry is not None:
        touched.add(entry.item_key)
        if not _wants_entry(tx) or entry.item_key != tx.asset_item_key:
            entry.deleted_at = now
            entry = None

    if _wants_entry(tx):
        key = tx.asset_item_key
        assert key is not None
        side = tx.asset_side or EntrySide.BUY
        occurred_on = ledger.local_date(tx.occurred_at, ledger.user_tz(user))
        if entry is None:
            row = row_for_key(ensure_today_snapshot(session, user, today), key)
            if row is None:
                raise ApiError(ErrorCode.INVALID_REQUEST, "그 자산 항목을 찾지 못했어요.", 422)
            start_line_if_new(session, user, row, today)
            add_entry(
                session,
                user,
                key,
                side=side,
                amount=tx.amount,
                quantity=tx.asset_quantity,
                occurred_on=occurred_on,
                transaction_id=tx.id,
            )
        else:
            entry.side = side
            entry.amount = tx.amount
            entry.quantity = tx.asset_quantity
            entry.occurred_on = occurred_on
        touched.add(key)

    session.flush()
    refold(session, user, today, touched)


def month_saved(session: Session, user: User, period: BudgetPeriod) -> Money:
    """그 달 모은 돈: 이체 중 「어디에」 가 있고 판 것이 아닌 합. 사용자 시간대의 달이다."""
    start, end = ledger.period_bounds(period, ledger.user_tz(user))
    total = session.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_id == user.id,
            Transaction.deleted_at.is_(None),
            Transaction.type == TransactionType.TRANSFER,
            Transaction.asset_item_key.is_not(None),
            or_(Transaction.asset_side.is_(None), Transaction.asset_side != EntrySide.SELL),
            Transaction.occurred_at >= start,
            Transaction.occurred_at < end,
        )
    )
    return Money(Decimal(total or 0))


# ── 읽기 ────────────────────────────────────────────────


@dataclass(frozen=True)
class ItemFigures:
    """항목 한 줄의 셈. 장부가 없으면 스냅샷 값 그대로다."""

    holding: Holding
    state: LedgerState
    value: Money
    rate: Decimal | None
    rate_kind: RateKind | None
    sells: dict[uuid.UUID, SellOutcome]


def _state_from_row(row: AssetItemRow, holding: Holding) -> LedgerState:
    amount, quantity, cost = set_line_values(row)
    if holding is Holding.QUANTITY:
        return LedgerState(amount=Money(amount), quantity=quantity, cost_basis=Money(amount))
    return LedgerState(
        amount=Money(row.amount),
        quantity=None,
        cost_basis=Money(cost) if cost is not None else None,
    )


def item_figures(
    session: Session, user: User, rows: Sequence[AssetItemRow]
) -> dict[uuid.UUID, ItemFigures]:
    """항목마다 실현 수익과 수익률. 장부 줄을 한 번에 읽어 항목별로 접는다."""
    keys = [row.item_key for row in rows if row.item_key is not None]
    grouped: dict[uuid.UUID, list[AssetEntry]] = defaultdict(list)
    for entry in _entries(session, user, keys):
        grouped[entry.item_key].append(entry)

    figures: dict[uuid.UUID, ItemFigures] = {}
    for row in rows:
        if row.item_key is None:
            continue
        holding = holding_of(row.group, row.kind)
        state = _state_from_row(row, holding)
        sells: dict[uuid.UUID, SellOutcome] = {}
        if grouped.get(row.item_key):
            try:
                result = fold(holding, [_line(entry) for entry in grouped[row.item_key]])
            except LedgerError as error:
                # 쓰는 길이 막아 두어 생기면 안 된다. 화면은 스냅샷 값으로 그린다.
                logger.warning("자산 장부를 접지 못했다 code=%s", error.code)
            else:
                state = result.state
                sells = {uuid.UUID(str(ref)): outcome for ref, outcome in result.sells.items()}
        unit_price = Money(row.unit_price) if row.unit_price is not None else None
        rate, rate_kind = item_rate(
            holding, state, unit_price=unit_price, price_noted=row.price_noted_on is not None
        )
        figures[row.item_key] = ItemFigures(
            holding=holding,
            state=state,
            value=Money(row.amount),
            rate=rate,
            rate_kind=rate_kind,
            sells=sells,
        )
    return figures


@dataclass(frozen=True)
class AssetResult:
    """저장·고치기 응답의 자산 블록."""

    item_key: uuid.UUID
    label: str | None
    item_amount: Money
    quantity: Decimal | None
    month_saved: Money
    realized: Money | None
    rate: Decimal | None


def asset_result(session: Session, user: User, tx: Transaction) -> AssetResult | None:
    """거래가 닿은 항목의 지금 값. 팔았으면 그 판 기록의 실현 수익과 수익률."""
    if not _wants_entry(tx) or tx.asset_item_key is None:
        return None
    row = row_for_key(latest_snapshot(session, user), tx.asset_item_key)
    if row is None:
        return None
    figures = item_figures(session, user, [row]).get(tx.asset_item_key)
    realized: Money | None = None
    rate: Decimal | None = None
    entry = _transaction_entry(session, tx)
    if figures is not None and entry is not None and entry.id in figures.sells:
        outcome = figures.sells[entry.id]
        realized, rate = outcome.realized, outcome.rate
    tz = ledger.user_tz(user)
    period = ledger.period_for(user, ledger.local_date(tx.occurred_at, tz))
    return AssetResult(
        item_key=tx.asset_item_key,
        label=row.label,
        item_amount=Money(row.amount),
        quantity=row.quantity,
        month_saved=month_saved(session, user, period),
        realized=realized,
        rate=rate,
    )
