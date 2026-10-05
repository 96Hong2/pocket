"""「내 자산 분석」 셈. 도넛, 투자 수익률, 지난달 대비, 저축률, 지문을 여기서 다 낸다.

광고 잠금은 서버 표 없이 화면이 {scope: fingerprint} 를 기기에 둔다. 지문은 분석 숫자를 바꾸는
칸만 먹는다. 날짜, 스냅샷 id, 순서, 가격 적은 날은 빼서 체크인 복사만으로는 안 바뀐다.

비율과 수익률은 % 로 소수 첫째 자리(ROUND_HALF_UP)다. 분모가 0 이면 None 이다.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from enum import StrEnum

from app.domain.asset_ledger import (
    QUANTITY_PLACES,
    Holding,
    InvestKind,
    holding_of,
    rate_percent,
)
from app.domain.assets import AssetGroup, AssetItem, AssetSummary, summarize_assets, total_by_group
from app.domain.money import Money

__all__ = [
    "STOCK_KINDS",
    "Analysis",
    "AnalysisItem",
    "AnalysisScope",
    "Bundle",
    "GroupChange",
    "GroupSlice",
    "ItemSlice",
    "MonthChange",
    "ReturnRow",
    "Returns",
    "SavingRate",
    "build_analysis",
    "bundles",
    "fingerprint",
    "group_slices",
    "in_scope",
    "investment_returns",
    "item_slices",
    "month_change",
    "saving_rate",
    "scope_of",
]


class AnalysisScope(StrEnum):
    ALL = "all"
    STOCK = "stock"
    CASH = "cash"


# 주식 분석 묶음. 코인은 전체 분석(도넛과 수익률)에서만 본다.
STOCK_KINDS = frozenset({InvestKind.STOCK, InvestKind.ETF, InvestKind.FUND, InvestKind.BOND})


@dataclass(frozen=True)
class AnalysisItem:
    """항목 한 줄의 분석 재료. value 는 순자산에 드는 값(스냅샷 금액)이다."""

    key: str
    group: AssetGroup
    kind: InvestKind | None
    label: str | None
    value: Money
    quantity: Decimal | None = None
    cost_basis: Money | None = None
    unit_price: Money | None = None
    monthly_amount: Money | None = None
    price_noted: bool = False
    realized: Money = field(default_factory=Money.zero)
    sold_cost: Money = field(default_factory=Money.zero)
    received: Money = field(default_factory=Money.zero)
    sell_count: int = 0

    @property
    def holding(self) -> Holding:
        return holding_of(self.group, self.kind)


def scope_of(item: AnalysisItem) -> AnalysisScope | None:
    """종류별 묶음. 어느 묶음에도 안 드는 항목(코인, 연금, 보증금, 부채)은 None."""
    if item.group is AssetGroup.INVESTMENT and item.kind in STOCK_KINDS:
        return AnalysisScope.STOCK
    if item.group is AssetGroup.CASH:
        return AnalysisScope.CASH
    return None


def in_scope(items: Iterable[AnalysisItem], scope: AnalysisScope) -> list[AnalysisItem]:
    if scope is AnalysisScope.ALL:
        return list(items)
    return [item for item in items if scope_of(item) is scope]


# ── 지문 ────────────────────────────────────────────────


def _won(value: Money | None) -> str | None:
    return None if value is None else str(int(value.amount))


def _quantity(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return format(value.quantize(QUANTITY_PLACES).normalize(), "f")


def fingerprint(items: Iterable[AnalysisItem]) -> str:
    """item_key 순으로 숫자 칸만 묶은 sha256. 항목이 늘거나 빠져도 바뀐다."""
    rows = [
        [
            item.key,
            item.group.value,
            item.kind.value if item.kind is not None else None,
            _won(item.value),
            _quantity(item.quantity),
            _won(item.cost_basis),
            _won(item.unit_price),
            item.sell_count,
            _won(item.received),
            _won(item.realized),
        ]
        for item in sorted(items, key=lambda item: item.key)
    ]
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# ── 도넛 ────────────────────────────────────────────────


@dataclass(frozen=True)
class GroupSlice:
    group: AssetGroup
    amount: Money
    # 자산 합(연금 포함) 대비 %.
    ratio: Decimal | None
    # 연금을 뺀 자산 합 대비 %. 연금 조각은 None.
    ratio_without_pension: Decimal | None


def _summary(items: Iterable[AnalysisItem]) -> AssetSummary:
    return summarize_assets(AssetItem(group=item.group, amount=item.value) for item in items)


def _group_totals(items: Iterable[AnalysisItem]) -> dict[AssetGroup, Money]:
    return total_by_group(AssetItem(group=item.group, amount=item.value) for item in items)


def group_slices(items: Sequence[AnalysisItem]) -> list[GroupSlice]:
    """부채를 뺀 그룹 조각. 금액이 있는 그룹만, 그룹 선언 순서대로."""
    totals = _group_totals(items)
    assets = _summary(items).total_assets
    without = assets - totals[AssetGroup.PENSION]
    return [
        GroupSlice(
            group=group,
            amount=totals[group],
            ratio=rate_percent(totals[group], assets),
            ratio_without_pension=(
                None if group is AssetGroup.PENSION else rate_percent(totals[group], without)
            ),
        )
        for group in AssetGroup
        if group is not AssetGroup.DEBT and totals[group].is_positive
    ]


@dataclass(frozen=True)
class ItemSlice:
    key: str
    group: AssetGroup
    kind: InvestKind | None
    label: str | None
    amount: Money
    ratio: Decimal | None
    monthly_amount: Money | None


def item_slices(items: Sequence[AnalysisItem]) -> list[ItemSlice]:
    """종류별 화면의 항목 조각. 큰 것부터, 같으면 받은 순서."""
    total = Money.total(item.value for item in items)
    ordered = sorted(items, key=lambda item: -item.value.amount)
    return [
        ItemSlice(
            key=item.key,
            group=item.group,
            kind=item.kind,
            label=item.label,
            amount=item.value,
            ratio=rate_percent(item.value, total),
            monthly_amount=item.monthly_amount,
        )
        for item in ordered
    ]


# ── 투자 수익률 ──────────────────────────────────────────


@dataclass(frozen=True)
class ReturnRow:
    key: str
    kind: InvestKind | None
    label: str | None
    value: Money
    cost_basis: Money | None
    # 평가. 지금 가격(금액 종목은 지금 금액)을 적은 종목만.
    gain: Money | None
    rate: Decimal | None
    # 실현. 판 기록이 있는 종목만.
    realized: Money | None
    realized_rate: Decimal | None


@dataclass(frozen=True)
class Returns:
    rows: list[ReturnRow]
    # 평가 중인 종목의 합산.
    cost: Money
    value: Money
    gain: Money
    rate: Decimal | None
    # 판 기록의 합산.
    realized: Money
    realized_rate: Decimal | None


def _valued(item: AnalysisItem) -> bool:
    cost = item.cost_basis
    if cost is None or not cost.is_positive:
        return False
    if item.holding is Holding.QUANTITY:
        return item.unit_price is not None
    if item.holding is Holding.AMOUNT:
        return item.price_noted
    return False


def investment_returns(items: Iterable[AnalysisItem]) -> Returns:
    """현재가나 판 기록이 있는 종목만 센다. 항목 줄 칩(item_rate)과 같은 식이다."""
    rows: list[ReturnRow] = []
    cost = value = realized = sold_cost = Money.zero()
    for item in items:
        valued = _valued(item)
        sold = item.sell_count > 0
        if not (valued or sold):
            continue
        gain: Money | None = None
        rate: Decimal | None = None
        if valued:
            assert item.cost_basis is not None
            gain = item.value - item.cost_basis
            rate = rate_percent(gain, item.cost_basis)
            cost = cost + item.cost_basis
            value = value + item.value
        if sold:
            realized = realized + item.realized
            sold_cost = sold_cost + item.sold_cost
        rows.append(
            ReturnRow(
                key=item.key,
                kind=item.kind,
                label=item.label,
                value=item.value,
                cost_basis=item.cost_basis,
                gain=gain,
                rate=rate,
                realized=item.realized if sold else None,
                realized_rate=rate_percent(item.realized, item.sold_cost) if sold else None,
            )
        )
    return Returns(
        rows=rows,
        cost=cost,
        value=value,
        gain=value - cost,
        rate=rate_percent(value - cost, cost),
        realized=realized,
        realized_rate=rate_percent(realized, sold_cost),
    )


# ── 지난달 대비, 저축률, 종류별 입구 ─────────────────────


@dataclass(frozen=True)
class GroupChange:
    group: AssetGroup
    current: Money
    previous: Money
    delta: Money


@dataclass(frozen=True)
class MonthChange:
    net_worth: Money
    previous_net_worth: Money
    delta: Money
    # 두 달 중 한쪽이라도 금액이 있는 그룹만, 선언 순서대로.
    groups: list[GroupChange]


def _net_worth(totals: Mapping[AssetGroup, Money]) -> Money:
    return summarize_assets(AssetItem(group=g, amount=a) for g, a in totals.items()).net_worth


def month_change(
    current: Mapping[AssetGroup, Money], previous: Mapping[AssetGroup, Money]
) -> MonthChange:
    """그룹 소계 두 벌로 순자산 증감과 그룹별 증감을 낸다."""
    zero = Money.zero()
    now, before = _net_worth(current), _net_worth(previous)
    return MonthChange(
        net_worth=now,
        previous_net_worth=before,
        delta=now - before,
        groups=[
            GroupChange(
                group=group,
                current=current.get(group, zero),
                previous=previous.get(group, zero),
                delta=current.get(group, zero) - previous.get(group, zero),
            )
            for group in AssetGroup
            if current.get(group, zero).amount or previous.get(group, zero).amount
        ],
    )


@dataclass(frozen=True)
class SavingRate:
    saved: Money
    income: Money
    # 모은 돈 ÷ 번 돈. 번 돈이 0 이면 None.
    rate: Decimal | None


def saving_rate(saved: Money, income: Money) -> SavingRate:
    return SavingRate(saved=saved, income=income, rate=rate_percent(saved, income))


@dataclass(frozen=True)
class Bundle:
    scope: AnalysisScope
    count: int
    fingerprint: str


def bundles(items: Sequence[AnalysisItem]) -> list[Bundle]:
    """종류별 입구. 항목이 있는 묶음만. 지문은 그 묶음 항목만 먹는다."""
    found = []
    for scope in (AnalysisScope.STOCK, AnalysisScope.CASH):
        scoped = in_scope(items, scope)
        if scoped:
            found.append(Bundle(scope=scope, count=len(scoped), fingerprint=fingerprint(scoped)))
    return found


# ── 한 벌 ───────────────────────────────────────────────


@dataclass(frozen=True)
class Analysis:
    scope: AnalysisScope
    fingerprint: str
    # 범위 안 항목 값의 합.
    total: Money
    # 아래는 범위마다 채우는 것만 채운다. all: summary, groups, returns, month_change,
    # saving, bundles. stock: items, returns. cash: items, monthly_total.
    summary: AssetSummary | None = None
    # 「연금 빼고 보기」 의 자산 합.
    total_without_pension: Money | None = None
    groups: list[GroupSlice] = field(default_factory=list)
    items: list[ItemSlice] = field(default_factory=list)
    returns: Returns | None = None
    month_change: MonthChange | None = None
    saving: SavingRate | None = None
    bundles: list[Bundle] = field(default_factory=list)
    monthly_total: Money | None = None


def build_analysis(
    scope: AnalysisScope,
    items: Sequence[AnalysisItem],
    *,
    previous_groups: Mapping[AssetGroup, Money] | None = None,
    saved: Money | None = None,
    income: Money | None = None,
) -> Analysis:
    """범위 하나의 분석. 지난달 점이 없으면 지난달 대비는 None, 번 돈을 안 주면 저축률은 None."""
    scoped = in_scope(items, scope)
    total = Money.total(item.value for item in scoped)
    digest = fingerprint(scoped)
    if scope is AnalysisScope.STOCK:
        return Analysis(
            scope=scope,
            fingerprint=digest,
            total=total,
            items=item_slices(scoped),
            returns=investment_returns(scoped),
        )
    if scope is AnalysisScope.CASH:
        return Analysis(
            scope=scope,
            fingerprint=digest,
            total=total,
            items=item_slices(scoped),
            monthly_total=Money.total(
                item.monthly_amount for item in scoped if item.monthly_amount is not None
            ),
        )
    summary = _summary(scoped)
    return Analysis(
        scope=scope,
        fingerprint=digest,
        total=summary.total_assets,
        summary=summary,
        total_without_pension=summary.total_assets - _group_totals(scoped)[AssetGroup.PENSION],
        groups=group_slices(scoped),
        returns=investment_returns(item for item in scoped if item.kind is not None),
        month_change=(
            None
            if previous_groups is None
            else month_change(_group_totals(scoped), previous_groups)
        ),
        saving=None if saved is None or income is None else saving_rate(saved, income),
        bundles=bundles(scoped),
    )
