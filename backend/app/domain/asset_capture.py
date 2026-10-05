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

__all__ = ["AMOUNT_ONLY", "CapturedHolding", "captured_cost", "captured_holding", "unit_price_of"]

_WON = Decimal(1)
_PRECISION = 60


def captured_cost(value: Money, purchase: int | None, profit: int | None) -> Money | None:
    """넣은 돈 = 매입금액, 없으면 평가금액 − 평가손익. 0 아래로 나오면 못 읽은 것으로 본다."""
    if purchase is not None:
        cost = Decimal(purchase)
    elif profit is not None:
        cost = value.amount - Decimal(profit)
    else:
        return None
    return Money(cost) if cost >= 0 else None


def unit_price_of(value: Money, quantity: Decimal) -> Money:
    """지금 1주 가격 = 평가금액 ÷ 수량, 원 단위 반올림(장부와 같은 ROUND_HALF_UP)."""
    with localcontext() as ctx:
        ctx.prec = _PRECISION
        price = (value.amount / quantity).quantize(_WON, rounding=ROUND_HALF_UP)
    return Money(price)


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
    """수량 종목은 종류, 수량, 넣은 돈이 다 있어야 종목이 된다. 넣은 돈만 있으면 금액 종목이다."""
    if cost is None:
        return AMOUNT_ONLY
    if kind in QUANTITY_KINDS and quantity is not None and quantity > 0:
        return CapturedHolding(
            kind=kind, quantity=quantity, cost_basis=cost, unit_price=unit_price_of(value, quantity)
        )
    return CapturedHolding(
        kind=kind if kind in AMOUNT_KINDS else None, quantity=None, cost_basis=cost, unit_price=None
    )
