"""자산 장부 접기. 항목 값의 정본은 장부 줄을 들어온 순서로 접은 결과다(ADR-0045).

금액은 원 단위 정수, 수량은 소수 8자리까지다. 판 몫의 넣은 돈만 원 단위로 반올림하고
(ROUND_HALF_UP), 전부 팔면 남은 넣은 돈을 그대로 뺀다. 수익률은 소수 첫째 자리까지다.

금액 종목의 넣은 돈은 모를 수 있다(None). 캡처로 금액만 들어온 투자 항목이 그렇다.
모르는 넣은 돈을 지금 금액으로 채우지 않는다. 지어낸 기준으로 수익률을 내지 않으려는 것이다.
"""

from __future__ import annotations

from collections.abc import Hashable, Iterable
from dataclasses import dataclass, field, replace
from decimal import ROUND_HALF_UP, Decimal, localcontext
from enum import StrEnum

from app.domain.assets import AssetGroup
from app.domain.money import Money

__all__ = [
    "AMOUNT_KINDS",
    "QUANTITY_KINDS",
    "QUANTITY_PLACES",
    "AssetSide",
    "EntrySide",
    "Holding",
    "InvestKind",
    "LedgerError",
    "LedgerFold",
    "LedgerLine",
    "LedgerState",
    "RateKind",
    "SellOutcome",
    "fold",
    "holding_of",
    "item_rate",
    "item_value",
    "rate_percent",
]

QUANTITY_PLACES = Decimal("0.00000001")
_RATE_PLACES = Decimal("0.1")
_WON = Decimal(1)
# 넣은 돈(16자리) × 수량(20자리) 을 자르지 않고 곱하려면 기본 정밀도 28 이 모자란다.
_PRECISION = 60


class InvestKind(StrEnum):
    STOCK = "stock"
    ETF = "etf"
    FUND = "fund"
    COIN = "coin"
    BOND = "bond"
    OTHER = "other"


# 수량을 꼭 받는 종목. 수량 없이 넣은 기록이 섞이면 평균 매수가가 틀어진다.
QUANTITY_KINDS = frozenset({InvestKind.STOCK, InvestKind.ETF, InvestKind.COIN})
# 금액으로만 적는 종목. 넣은 돈과 지금 금액 두 값을 갖는다. 넣은 돈은 모를 수 있다.
AMOUNT_KINDS = frozenset({InvestKind.FUND, InvestKind.BOND, InvestKind.OTHER})


class EntrySide(StrEnum):
    BUY = "buy"
    SELL = "sell"
    # 「여기서부터 이 값」. 손 수정, 캡처 저장, 처음 장부가 생길 때의 시작 값.
    SET = "set"


class AssetSide(StrEnum):
    """거래가 고르는 쪽. set 은 손 수정이 남기는 줄이라 거래에는 없다."""

    BUY = "buy"
    SELL = "sell"


class Holding(StrEnum):
    """항목을 접는 식의 갈래. 그룹과 종류로 정해진다."""

    BALANCE = "balance"
    QUANTITY = "quantity"
    AMOUNT = "amount"
    DEBT = "debt"


class RateKind(StrEnum):
    VALUATION = "valuation"
    REALIZED = "realized"


def holding_of(group: AssetGroup, kind: InvestKind | None) -> Holding:
    """투자 그룹은 종목이다. 종류 없는 투자 항목(캡처로 금액만 들어온 것)은 금액 종목으로 접는다."""
    if group is AssetGroup.DEBT:
        return Holding.DEBT
    if group is AssetGroup.INVESTMENT:
        return Holding.QUANTITY if kind in QUANTITY_KINDS else Holding.AMOUNT
    return Holding.BALANCE


class LedgerError(ValueError):
    """장부를 접을 수 없다. code 로 까닭을 가른다."""

    def __init__(self, code: str, ref: Hashable | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.ref = ref


@dataclass(frozen=True)
class LedgerLine:
    ref: Hashable
    side: EntrySide
    # buy 는 넣은 돈(부채는 갚은 돈), sell 은 받은 돈, set 은 잔액이나 지금 금액.
    amount: Money
    quantity: Decimal | None = None
    # set 줄은 넣은 돈. 금액 종목은 넣은 돈과 지금 금액 두 값이라 금액 칸 하나로 모자란다.
    # sell 줄은 넣은 돈을 모르는 항목을 팔 때 적은 「이 항목에 넣은 돈 전체」.
    cost_basis: Money | None = None
    # 금액 종목 sell 줄의 팔고 남은 금액. 0 이면 전부 팔았다. 없으면 옛 규칙(받은 돈 ÷ 지금 금액).
    remaining: Money | None = None


@dataclass(frozen=True)
class LedgerState:
    """접은 결과.

    amount 는 통장·부채면 잔액, 금액 종목이면 지금 금액, 수량 종목이면 넣은 돈과 같다.
    금액 종목의 cost_basis 가 None 이면 넣은 돈을 모른다. realized, sold_cost, sell_count 는
    넣은 돈을 아는 판 기록만 센다.
    """

    amount: Money
    quantity: Decimal | None
    cost_basis: Money | None
    realized: Money = field(default_factory=Money.zero)
    sold_cost: Money = field(default_factory=Money.zero)
    sell_count: int = 0

    @classmethod
    def start(cls, holding: Holding) -> LedgerState:
        is_stock = holding in (Holding.QUANTITY, Holding.AMOUNT)
        return cls(
            amount=Money.zero(),
            quantity=Decimal(0) if holding is Holding.QUANTITY else None,
            cost_basis=Money.zero() if is_stock else None,
        )


@dataclass(frozen=True)
class SellOutcome:
    """판 기록 하나. 넣은 돈을 모르고 팔았으면 sold_cost 와 realized 가 None 이다."""

    received: Money
    sold_cost: Money | None
    realized: Money | None

    @property
    def rate(self) -> Decimal | None:
        if self.realized is None or self.sold_cost is None:
            return None
        return rate_percent(self.realized, self.sold_cost)


@dataclass(frozen=True)
class LedgerFold:
    state: LedgerState
    # 판 줄마다 실현 수익. 키는 LedgerLine.ref.
    sells: dict[Hashable, SellOutcome]


def fold(holding: Holding, lines: Iterable[LedgerLine]) -> LedgerFold:
    """들어온 순서의 줄을 처음부터 접는다. 보유보다 많이 팔거나 빚보다 많이 갚으면 LedgerError."""
    state = LedgerState.start(holding)
    sells: dict[Hashable, SellOutcome] = {}
    for line in lines:
        _check_quantity(holding, line)
        if line.side is EntrySide.SET:
            state = _set(holding, state, line)
        elif line.side is EntrySide.BUY:
            state = _buy(holding, state, line)
        else:
            state, outcome = _sell(holding, state, line)
            sells[line.ref] = outcome
    return LedgerFold(state=state, sells=sells)


def _check_quantity(holding: Holding, line: LedgerLine) -> None:
    if holding is not Holding.QUANTITY:
        if line.quantity is not None:
            raise LedgerError("quantity_not_allowed", line.ref)
        return
    if line.quantity is None:
        raise LedgerError("quantity_required", line.ref)
    if line.quantity < 0 or (line.side is not EntrySide.SET and line.quantity == 0):
        raise LedgerError("quantity_required", line.ref)


def _set(holding: Holding, state: LedgerState, line: LedgerLine) -> LedgerState:
    # 실현 수익은 이어 간다. 판 일은 손 수정 앞에 이미 일어났다.
    if holding is Holding.QUANTITY:
        cost = line.cost_basis if line.cost_basis is not None else line.amount
        return replace(state, amount=cost, quantity=line.quantity, cost_basis=cost)
    if holding is Holding.AMOUNT:
        return replace(state, amount=line.amount, cost_basis=line.cost_basis)
    return replace(state, amount=line.amount)


def _buy(holding: Holding, state: LedgerState, line: LedgerLine) -> LedgerState:
    if holding is Holding.DEBT:
        if line.amount.amount > state.amount.amount:
            raise LedgerError("over_repay", line.ref)
        return replace(state, amount=state.amount - line.amount)
    if holding is Holding.QUANTITY:
        assert state.quantity is not None and state.cost_basis is not None
        assert line.quantity is not None
        cost = state.cost_basis + line.amount
        return replace(state, amount=cost, quantity=state.quantity + line.quantity, cost_basis=cost)
    if holding is Holding.AMOUNT:
        # 넣은 돈을 모르면 넣었어요를 더해도 계속 모른다. 금액이 0 이면 남은 것이 없어 0 부터 센다.
        known = state.cost_basis
        if known is None and not state.amount.is_positive:
            known = Money.zero()
        added = known + line.amount if known is not None else None
        return replace(state, amount=state.amount + line.amount, cost_basis=added)
    return replace(state, amount=state.amount + line.amount)


def _sell(
    holding: Holding, state: LedgerState, line: LedgerLine
) -> tuple[LedgerState, SellOutcome]:
    received = line.amount
    sold_cost: Money | None
    if holding is Holding.QUANTITY:
        assert state.quantity is not None and state.cost_basis is not None
        assert line.quantity is not None
        if line.quantity > state.quantity:
            raise LedgerError("over_sell", line.ref)
        sold_cost = _portion(state.cost_basis, line.quantity, state.quantity)
        cost = state.cost_basis - sold_cost
        state = replace(
            state, amount=cost, quantity=state.quantity - line.quantity, cost_basis=cost
        )
    elif holding is Holding.AMOUNT:
        # 넣은 돈을 모르면 이 줄에 적은 넣은 돈 전체를 쓴다. 그것도 없으면 모른 채 판다.
        basis = state.cost_basis if state.cost_basis is not None else line.cost_basis
        if line.remaining is None:
            if received.amount > state.amount.amount:
                raise LedgerError("over_sell", line.ref)
            whole, left = state.amount.amount, state.amount - received
        else:
            # 판 몫 = 받은 돈 ÷ (받은 돈 + 남은 금액). 지금 금액이 오래돼도 받은 돈이 기준이다.
            whole, left = received.amount + line.remaining.amount, line.remaining
        sold_cost = _portion(basis, received.amount, whole) if basis is not None else None
        rest_cost = basis - sold_cost if basis is not None and sold_cost is not None else None
        if not left.is_positive:
            # 다 팔았으면 남은 넣은 돈은 0 이다. 모르던 넣은 돈도 끝나고 다음 넣었어요부터 센다.
            rest_cost = Money.zero()
        state = replace(state, amount=left, cost_basis=rest_cost)
    else:
        raise LedgerError("sell_not_allowed", line.ref)

    realized = received - sold_cost if sold_cost is not None else None
    outcome = SellOutcome(received=received, sold_cost=sold_cost, realized=realized)
    if sold_cost is not None and realized is not None:
        state = replace(
            state,
            realized=state.realized + realized,
            sold_cost=state.sold_cost + sold_cost,
            sell_count=state.sell_count + 1,
        )
    return state, outcome


def _portion(cost: Money, part: Decimal, whole: Decimal) -> Money:
    """판 몫의 넣은 돈 = 넣은 돈 × 판 몫 ÷ 전체. 전부 팔면 넣은 돈 그대로라 잔돈이 안 남는다."""
    if part == whole:
        return cost
    with localcontext() as ctx:
        ctx.prec = _PRECISION
        share = (cost.amount * part / whole).quantize(_WON, rounding=ROUND_HALF_UP)
    return Money(share)


def rate_percent(gain: Money, base: Money) -> Decimal | None:
    """수익률(%), 소수 첫째 자리 반올림. 기준이 0 이하면 없다."""
    if not base.is_positive:
        return None
    with localcontext() as ctx:
        ctx.prec = _PRECISION
        value = gain.amount * 100 / base.amount
        rounded = value.quantize(_RATE_PLACES, rounding=ROUND_HALF_UP)
    # 작은 손해가 반올림으로 0 이 되면 "-0.0" 이 남는다. 0 은 부호 없이 낸다.
    return rounded.copy_abs() if rounded.is_zero() else rounded


def item_value(holding: Holding, state: LedgerState, unit_price: Money | None) -> Money:
    """순자산에 드는 값. 수량 종목은 지금 1주 가격이 있으면 수량 × 가격, 없으면 넣은 돈."""
    if holding is Holding.QUANTITY and unit_price is not None and state.quantity is not None:
        with localcontext() as ctx:
            ctx.prec = _PRECISION
            value = (state.quantity * unit_price.amount).quantize(_WON, rounding=ROUND_HALF_UP)
        return Money(value)
    return state.amount


def item_rate(
    holding: Holding,
    state: LedgerState,
    *,
    unit_price: Money | None,
    price_noted: bool,
) -> tuple[Decimal | None, RateKind | None]:
    """항목 줄 칩. 지금 가격(금액)이 있으면 평가, 없고 판 기록이 있으면 실현, 둘 다 없으면 없음."""
    cost = state.cost_basis
    if cost is not None and cost.is_positive:
        if holding is Holding.QUANTITY and unit_price is not None:
            value = item_value(holding, state, unit_price)
            return rate_percent(value - cost, cost), RateKind.VALUATION
        if holding is Holding.AMOUNT and price_noted:
            return rate_percent(state.amount - cost, cost), RateKind.VALUATION
    if state.sell_count > 0:
        realized_rate = rate_percent(state.realized, state.sold_cost)
        if realized_rate is not None:
            return realized_rate, RateKind.REALIZED
    return None, None
