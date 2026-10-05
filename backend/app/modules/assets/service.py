"""자산 스냅샷 조회·저장.

**하루에 스냅샷 하나다.** 같은 날 다시 저장하면 그 날 스냅샷의 항목을 갈아 끼우고,
날이 바뀌면 새 스냅샷을 만든다. 저장할 때마다 새로 쌓으면 하루에 세 번 고친 사람의
순자산 추이가 같은 날에 세 점이 되어, 나중에 추이를 그릴 때 날짜별 값이 정해지지 않는다.

**항목 값의 정본은 장부다(ADR-0044).** 장부가 있는 항목을 손으로 고치면 set 줄을 남기고
다시 접는다. 장부 쓰기와 접기는 `entries` 한 곳에 있다.

합계는 `app.domain.assets` 가 낸다. 여기서 자산에서 부채를 빼는 산식을 다시 쓰지 않는다.

`AssetItem` 이 도메인 값 객체와 ORM 모델 둘 다에 있어, 이 파일에서는 ORM 쪽을
`AssetItemRow` 로 별칭해 둔다. 같은 이름 두 개를 한 파일에서 쓰면 어느 쪽인지 읽히지 않는다.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.amounts import MAX_AMOUNT
from app.api.errors import ApiError, ErrorCode
from app.domain import assets as domain
from app.domain.asset_ledger import EntrySide, Holding, holding_of
from app.domain.money import Money
from app.domain.period import BudgetPeriod
from app.models import User
from app.models.asset import AssetItem as AssetItemRow, AssetSnapshot, AssetSource
from app.modules import ledger
from app.modules.assets import entries
from app.modules.assets.entries import latest_snapshot, live_rows
from app.modules.assets.schemas import AssetItemIn, ItemOutValues

_ONE_DAY = timedelta(days=1)

__all__ = [
    "MonthPoint",
    "checkin",
    "item_values",
    "latest_snapshot",
    "live_items",
    "live_rows",
    "month_end_points",
    "replace_items",
    "summarize",
]


def live_items(snapshot: AssetSnapshot | None) -> list[tuple[domain.AssetGroup, Money]]:
    """그 스냅샷의 살아 있는 항목의 (그룹, 금액). 합계를 낼 때 쓴다."""
    return [(row.group, Money(row.amount)) for row in live_rows(snapshot)]


def summarize(
    items: Sequence[tuple[domain.AssetGroup, Money]],
) -> tuple[domain.AssetSummary, dict[domain.AssetGroup, Money]]:
    """순자산과 그룹 소계. 둘 다 같은 목록에서 나온다."""
    values = [domain.AssetItem(group=group, amount=amount) for group, amount in items]
    return domain.summarize_assets(values), domain.total_by_group(values)


def item_values(
    session: Session, user: User, snapshot: AssetSnapshot | None
) -> list[ItemOutValues]:
    """응답에 실을 항목 줄. 장부가 있는 항목은 실현 수익과 수익률을 함께 센다."""
    rows = live_rows(snapshot)
    figures = entries.item_figures(session, user, rows)
    values = []
    for row in rows:
        figure = figures.get(row.item_key) if row.item_key is not None else None
        realized = None
        if figure is not None and figure.state.sell_count > 0:
            realized = figure.state.realized
        values.append(
            ItemOutValues(
                group=row.group,
                label=row.label,
                amount=Money(row.amount),
                item_key=row.item_key,
                kind=row.kind,
                monthly_amount=row.monthly_amount,
                quantity=row.quantity,
                cost_basis=row.cost_basis,
                unit_price=row.unit_price,
                price_noted_on=row.price_noted_on,
                realized=realized,
                rate=figure.rate if figure is not None else None,
                rate_kind=figure.rate_kind if figure is not None else None,
            )
        )
    return values


# ── PUT: item_key 이어 받기 ─────────────────────────────


def _match(
    item: AssetItemIn, unmatched: list[AssetItemRow], by_key: dict[uuid.UUID, AssetItemRow]
) -> AssetItemRow | None:
    """item_key 가 오면 그 행, 없으면 같은 (group, label) 의 아직 안 맞춘 첫 행."""
    if item.item_key is not None:
        row = by_key.get(item.item_key)
        if row is not None and row in unmatched:
            return row
    return next(
        (row for row in unmatched if row.group is item.group and row.label == item.label), None
    )


def _pick(item: AssetItemIn, name: str, previous: AssetItemRow | None) -> object:
    """보낸 칸은 보낸 값, 안 보낸 칸은 기존 값. 옛 번들은 새 칸을 안 보낸다."""
    if name in item.model_fields_set:
        return getattr(item, name)
    return getattr(previous, name) if previous is not None else None


@dataclass
class _Merged:
    row: AssetItemRow
    previous: AssetItemRow | None


def _fill(row: AssetItemRow, item: AssetItemIn, previous: AssetItemRow | None, today: date) -> None:
    kind = _pick(item, "kind", previous)
    row.group = item.group
    row.label = item.label
    # 투자가 아닌 그룹으로 옮기면 종류는 뜻이 없다.
    row.kind = kind if item.group is domain.AssetGroup.INVESTMENT else None  # type: ignore[assignment]
    row.monthly_amount = _pick(item, "monthly_amount", previous)  # type: ignore[assignment]
    row.confidence = 1.0
    holding = holding_of(row.group, row.kind)

    unit_price = _pick(item, "unit_price", previous)
    noted = _pick(item, "price_noted_on", previous)
    price_changed = previous is None or unit_price != previous.unit_price
    sent = item.model_fields_set
    if "unit_price" in sent and "price_noted_on" not in sent and price_changed and unit_price:
        noted = today

    if holding is Holding.QUANTITY:
        quantity = _pick(item, "quantity", previous)
        cost = _pick(item, "cost_basis", previous)
        row.quantity = quantity if quantity is not None else Decimal(0)  # type: ignore[assignment]
        row.cost_basis = cost if cost is not None else Decimal(0)  # type: ignore[assignment]
        row.unit_price = unit_price  # type: ignore[assignment]
        # 옛 모양 PUT 의 amount 는 무시한다. 값은 수량과 1주 가격, 없으면 넣은 돈이다.
        row.amount = _quantity_value(row)
    else:
        if "quantity" in item.model_fields_set and item.quantity is not None:
            raise ApiError(ErrorCode.INVALID_REQUEST, "이 항목은 수량을 적지 않아요.", 422)
        row.quantity = None
        row.unit_price = None
        row.amount = item.amount
        if holding is Holding.AMOUNT:
            cost = _pick(item, "cost_basis", previous)
            row.cost_basis = cost if cost is not None else item.amount  # type: ignore[assignment]
        else:
            row.cost_basis = None
    row.price_noted_on = noted  # type: ignore[assignment]


def _quantity_value(row: AssetItemRow) -> Decimal:
    if row.unit_price is None or row.quantity is None:
        return row.cost_basis or Decimal(0)
    value = (row.quantity * row.unit_price).quantize(Decimal(1))
    if value > MAX_AMOUNT:
        raise ApiError(ErrorCode.INVALID_REQUEST, "금액이 너무 커요.", 422)
    return value


def _changed(previous: AssetItemRow, row: AssetItemRow, holding: Holding) -> bool:
    if holding is Holding.QUANTITY:
        return previous.quantity != row.quantity or previous.cost_basis != row.cost_basis
    if holding is Holding.AMOUNT:
        return previous.amount != row.amount or previous.cost_basis != row.cost_basis
    return previous.amount != row.amount


def replace_items(
    session: Session,
    user: User,
    today: date,
    items: Sequence[AssetItemIn],
    *,
    source: AssetSource | None = None,
) -> AssetSnapshot:
    """오늘 스냅샷의 항목을 보낸 목록으로 갈아 끼운다. 없으면 오늘 스냅샷을 만든다.

    같은 항목은 item_key 를 이어 받는다. 키가 없으면 같은 (group, label) 에 맞추고,
    보내지 않은 새 칸은 기존 값을 지킨다. 맞는 행이 없을 때만 새 키를 준다.
    장부가 있는 항목은 값이 바뀐 줄만 set 장부 줄을 남기고 다시 접는다.
    """
    previous_rows = live_rows(latest_snapshot(session, user))
    snapshot = entries.snapshot_on(session, user, today)
    if snapshot is None:
        snapshot = AssetSnapshot(
            user_id=user.id, effective_on=today, source=source or AssetSource.MANUAL
        )
        session.add(snapshot)
    elif source is not None:
        snapshot.source = source

    by_key = {row.item_key: row for row in previous_rows if row.item_key is not None}
    unmatched = list(previous_rows)
    merged: list[_Merged] = []
    # 비교할 기존 값은 행을 고치기 전에 떼어 둔다. 같은 날이면 그 행을 그대로 고쳐 쓴다.
    for index, item in enumerate(items):
        previous = _match(item, unmatched, by_key)
        before = None
        if previous is not None:
            unmatched.remove(previous)
            before = entries.copy_row(previous, previous.sort_order)
            before.item_key = previous.item_key
        if previous is not None and previous.snapshot_id == snapshot.id:
            row = previous
        else:
            row = AssetItemRow(item_key=previous.item_key if previous is not None else None)
        if row.item_key is None:
            row.item_key = uuid.uuid4()
        row.sort_order = index
        _fill(row, item, before, today)
        merged.append(_Merged(row=row, previous=before))

    # delete-orphan 이 걸려 있어 목록에서 빠진 행은 그대로 사라진다.
    snapshot.items = [entry.row for entry in merged]
    session.flush()

    for entry in merged:
        key = entry.row.item_key
        if entry.previous is None or key is None or not entries.has_ledger(session, user, key):
            continue
        holding = holding_of(entry.row.group, entry.row.kind)
        if holding is not holding_of(entry.previous.group, entry.previous.kind):
            raise ApiError(
                ErrorCode.INVALID_REQUEST,
                "기록이 있는 항목은 종류나 그룹을 이렇게 바꿀 수 없어요.",
                422,
            )
        if _changed(entry.previous, entry.row, holding):
            amount, quantity, cost = entries.set_line_values(entry.row)
            entries.add_entry(
                session,
                user,
                key,
                side=EntrySide.SET,
                amount=amount,
                quantity=quantity,
                cost_basis=cost,
                occurred_on=today,
            )
        entries.refold(session, user, today, [key])

    session.commit()
    session.refresh(snapshot)
    return snapshot


# ── 체크인과 월말 점 ─────────────────────────────────────


def checkin(session: Session, user: User, today: date) -> AssetSnapshot | None:
    """「그대로예요」: 최신 목록을 오늘로 복사한다. 오늘 것이 있으면 그대로 둔다."""
    if latest_snapshot(session, user) is None:
        return None
    snapshot = entries.ensure_today_snapshot(session, user, today)
    session.commit()
    session.refresh(snapshot)
    return snapshot


@dataclass(frozen=True)
class MonthPoint:
    month: BudgetPeriod
    effective_on: date
    summary: domain.AssetSummary
    # 그룹 소계. 분석의 그룹별 지난달 대비가 쓴다.
    groups: dict[domain.AssetGroup, Money] = field(default_factory=dict)


def month_end_points(session: Session, user: User, today: date, months: int) -> list[MonthPoint]:
    """오래된 달부터 달마다 월말 점. 그 달 마지막 날(이번 달은 오늘) 이하의 가장 늦은 스냅샷.

    첫 스냅샷보다 앞 달은 점이 없다. 분석의 지난달 대비와 결산 연속 판정이 같은 함수를 쓴다.
    """
    periods: list[BudgetPeriod] = []
    period = ledger.period_for(user, today)
    for _ in range(months):
        periods.append(period)
        period = ledger.period_for(user, period.start.replace(day=1) - _ONE_DAY)
    periods.reverse()

    heads = session.execute(
        select(AssetSnapshot.id, AssetSnapshot.effective_on, AssetSnapshot.created_at)
        .where(
            AssetSnapshot.user_id == user.id,
            AssetSnapshot.deleted_at.is_(None),
            AssetSnapshot.effective_on >= periods[0].start,
            AssetSnapshot.effective_on <= today,
        )
        .order_by(AssetSnapshot.effective_on, AssetSnapshot.created_at)
    ).all()
    earlier = session.execute(
        select(AssetSnapshot.id, AssetSnapshot.effective_on)
        .where(
            AssetSnapshot.user_id == user.id,
            AssetSnapshot.deleted_at.is_(None),
            AssetSnapshot.effective_on < periods[0].start,
        )
        .order_by(AssetSnapshot.effective_on.desc(), AssetSnapshot.created_at.desc())
        .limit(1)
    ).first()

    chosen: list[tuple[BudgetPeriod, uuid.UUID, date]] = []
    carry = (earlier[0], earlier[1]) if earlier is not None else None
    index = 0
    for month in periods:
        end = min(month.end, today)
        while index < len(heads) and heads[index][1] <= end:
            carry = (heads[index][0], heads[index][1])
            index += 1
        if carry is not None:
            chosen.append((month, carry[0], carry[1]))

    ids = {snapshot_id for _, snapshot_id, _ in chosen}
    loaded: dict[uuid.UUID, AssetSnapshot] = {}
    if ids:
        query = (
            select(AssetSnapshot)
            .where(AssetSnapshot.id.in_(ids))
            .options(selectinload(AssetSnapshot.items))
        )
        loaded = {snapshot.id: snapshot for snapshot in session.scalars(query).all()}
    points = []
    for month, snapshot_id, effective_on in chosen:
        summary, groups = summarize(live_items(loaded[snapshot_id]))
        points.append(
            MonthPoint(month=month, effective_on=effective_on, summary=summary, groups=groups)
        )
    return points
