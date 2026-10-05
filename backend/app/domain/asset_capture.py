"""자산 캡처로 읽은 줄의 넣은 돈, 수량, 지금 1주 가격을 정한다.

모델은 화면 숫자를 옮기기만 한다(매입금액, 평가손익, 수량). 빼기와 나누기는 여기서 한다.
넣은 돈을 못 읽으면 None 이고, 그 항목은 수익률 없이 금액만 갖는다.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, localcontext

from app.domain.asset_ledger import (
    AMOUNT_KINDS,
    QUANTITY_KINDS,
    Holding,
    InvestKind,
    LedgerState,
    item_value,
    rate_percent,
)
from app.domain.money import Money

__all__ = [
    "AMOUNT_ONLY",
    "CapturedHolding",
    "captured_cost",
    "captured_holding",
    "fair_unit_price",
    "unit_price_of",
]

_WON = Decimal(1)
_PRECISION = 60
# 수량 × 원 단위 1주 가격이 평가금액에서 이만큼(0.5%) 넘게 벗어나면 1주 가격으로 적지 않는다.
_PRICE_TOLERANCE = Decimal("0.005")


def captured_cost(value: Money, purchase: int | None, profit: int | None) -> Money | None:
    """넣은 돈 = 매입금액, 없으면 평가금액 − 평가손익. 0 이하로 나오면 못 읽은 것으로 본다.

    매입금액 0 은 화면에 없는 칸을 0 으로 채운 것으로 보고 평가손익으로 넘어간다.
    """
    if purchase is not None and purchase > 0:
        cost = Decimal(purchase)
    elif profit is not None:
        cost = value.amount - Decimal(profit)
    else:
        return None
    return Money(cost) if cost > 0 else None


def unit_price_of(value: Money, quantity: Decimal) -> Money:
    """지금 1주 가격 = 평가금액 ÷ 수량, 원 단위 반올림(장부와 같은 ROUND_HALF_UP)."""
    with localcontext() as ctx:
        ctx.prec = _PRECISION
        price = (value.amount / quantity).quantize(_WON, rounding=ROUND_HALF_UP)
    return Money(price)


def fair_unit_price(value: Money, quantity: Decimal) -> Money | None:
    """원 단위 1주 가격으로 평가금액을 되살릴 수 있을 때만 그 가격. 아니면 None.

    아주 싼 코인은 1주 가격이 1원 아래라 반올림하면 값이 몇 배로 틀어지거나 0 이 된다.
    """
    price = unit_price_of(value, quantity)
    if not price.is_positive:
        return None
    state = LedgerState(amount=Money.zero(), quantity=quantity, cost_basis=None)
    priced = item_value(Holding.QUANTITY, state, price)
    if abs(priced.amount - value.amount) > value.amount * _PRICE_TOLERANCE:
        return None
    return price


@dataclass(frozen=True)
class CapturedHolding:
    """읽은 줄이 무엇이 되나. 셋 다 None 이면 금액만 있는 항목이다."""

    kind: InvestKind | None
    quantity: Decimal | None
    cost_basis: Money | None
    unit_price: Money | None

    @property
    def holding(self) -> Holding:
        return Holding.QUANTITY if self.quantity is not None else Holding.AMOUNT

    def rate(self, value: Money) -> Decimal | None:
        """항목 줄 칩과 같은 평가 수익률. 넣은 돈을 모르면 None."""
        if self.cost_basis is None:
            return None
        if self.quantity is not None and self.unit_price is not None:
            state = LedgerState(amount=Money.zero(), quantity=self.quantity, cost_basis=None)
            value = item_value(Holding.QUANTITY, state, self.unit_price)
        return rate_percent(value - self.cost_basis, self.cost_basis)


AMOUNT_ONLY = CapturedHolding(kind=None, quantity=None, cost_basis=None, unit_price=None)


def captured_holding(
    value: Money, kind: InvestKind | None, quantity: Decimal | None, cost: Money | None
) -> CapturedHolding:
    """수량 종목은 종류, 수량, 넣은 돈이 다 있어야 종목이 된다. 넣은 돈만 있으면 금액 종목이다.

    1주 가격을 원 단위로 적어 평가금액이 틀어지는 종목도 넣은 돈과 지금 금액만 둔다.
    """
    if cost is None:
        return AMOUNT_ONLY
    if kind in QUANTITY_KINDS and quantity is not None and quantity > 0:
        price = fair_unit_price(value, quantity)
        if price is not None:
            return CapturedHolding(kind=kind, quantity=quantity, cost_basis=cost, unit_price=price)
    return CapturedHolding(
        kind=kind if kind in AMOUNT_KINDS else None, quantity=None, cost_basis=cost, unit_price=None
    )
