"""장부 접기. 기대값은 PRD v3 「수익률이 제대로 계산되나」 검산 표 ①~④ 에서 옮겼다."""

from decimal import Decimal

import pytest

from app.domain.asset_ledger import (
    EntrySide,
    Holding,
    LedgerError,
    LedgerLine,
    RateKind,
    fold,
    item_rate,
    item_value,
    rate_percent,
)
from app.domain.money import won


def buy(ref: str, amount: int, quantity: str | None = None) -> LedgerLine:
    return LedgerLine(
        ref, EntrySide.BUY, won(amount), Decimal(quantity) if quantity is not None else None
    )


def sell(ref: str, amount: int, quantity: str | None = None) -> LedgerLine:
    return LedgerLine(
        ref, EntrySide.SELL, won(amount), Decimal(quantity) if quantity is not None else None
    )


def test_검산_1_삼성전자_2주_500000원_1주를_300000원에_팔면_20퍼센트():
    result = fold(Holding.QUANTITY, [buy("b1", 500_000, "2"), sell("s1", 300_000, "1")])

    outcome = result.sells["s1"]
    assert outcome.sold_cost == won(250_000)
    assert outcome.realized == won(50_000)
    assert outcome.rate == Decimal("20.0")
    assert result.state.quantity == Decimal(1)
    assert result.state.cost_basis == won(250_000)


def test_검산_2_평균_260000원에서_2주를_600000원에_팔면_15점4퍼센트():
    lines = [buy("b1", 500_000, "2"), buy("b2", 280_000, "1"), sell("s1", 600_000, "2")]
    result = fold(Holding.QUANTITY, lines)

    outcome = result.sells["s1"]
    assert outcome.sold_cost == won(520_000)
    assert outcome.realized == won(80_000)
    assert outcome.rate == Decimal("15.4")
    assert result.state.quantity == Decimal(1)
    assert result.state.cost_basis == won(260_000)


def test_검산_3_지금_1주_가격_300000원이면_평가_15점4퍼센트():
    lines = [buy("b1", 500_000, "2"), buy("b2", 280_000, "1"), sell("s1", 600_000, "2")]
    state = fold(Holding.QUANTITY, lines).state

    rate, kind = item_rate(Holding.QUANTITY, state, unit_price=won(300_000), price_noted=True)

    assert rate == Decimal("15.4")
    assert kind is RateKind.VALUATION
    assert item_value(Holding.QUANTITY, state, won(300_000)) == won(300_000)


def test_검산_4_펀드_넣은_돈_100만_지금_120만에서_30만을_빼면_20퍼센트():
    start = LedgerLine("set", EntrySide.SET, won(1_200_000), cost_basis=won(1_000_000))
    result = fold(Holding.AMOUNT, [start, sell("s1", 300_000)])

    outcome = result.sells["s1"]
    assert outcome.sold_cost == won(250_000)
    assert outcome.realized == won(50_000)
    assert outcome.rate == Decimal("20.0")
    assert result.state.cost_basis == won(750_000)
    assert result.state.amount == won(900_000)
    rate, kind = item_rate(Holding.AMOUNT, result.state, unit_price=None, price_noted=True)
    assert (rate, kind) == (Decimal("20.0"), RateKind.VALUATION)


def test_산_기록을_지우면_판_기록의_수익을_다시_센다():
    """검산 ② 에서 1주 280,000원 산 기록을 지우면 2주 전부를 판 것이 된다."""
    result = fold(Holding.QUANTITY, [buy("b1", 500_000, "2"), sell("s1", 600_000, "2")])

    outcome = result.sells["s1"]
    assert outcome.sold_cost == won(500_000)
    assert outcome.realized == won(100_000)
    assert outcome.rate == Decimal("20.0")
    assert result.state.quantity == Decimal(0)
    assert result.state.cost_basis == won(0)


def test_set_뒤에는_그보다_먼저_들어온_줄을_지워도_보유가_그대로다():
    hand = LedgerLine("set", EntrySide.SET, won(900_000), Decimal(3), won(900_000))

    with_old = fold(Holding.QUANTITY, [buy("b1", 500_000, "2"), hand]).state
    without_old = fold(Holding.QUANTITY, [hand]).state

    assert with_old.quantity == without_old.quantity == Decimal(3)
    assert with_old.cost_basis == without_old.cost_basis == won(900_000)


def test_통장도_set_뒤에_옛_저축을_지워도_손으로_고친_값이_이긴다():
    hand = LedgerLine("set", EntrySide.SET, won(3_000_000))
    assert fold(Holding.BALANCE, [buy("b1", 300_000), hand]).state.amount == won(3_000_000)
    assert fold(Holding.BALANCE, [hand]).state.amount == won(3_000_000)
    # set 뒤에 들어온 저축은 더해진다. 지난 날짜로 적었어도 들어온 순서로 센다.
    assert fold(Holding.BALANCE, [hand, buy("b2", 300_000)]).state.amount == won(3_300_000)


def test_보유보다_많이_팔면_접지_않는다():
    with pytest.raises(LedgerError) as error:
        fold(Holding.QUANTITY, [buy("b1", 500_000, "2"), sell("s1", 900_000, "3")])
    assert error.value.code == "over_sell"
    assert error.value.ref == "s1"


def test_금액_종목은_지금_금액보다_많이_뺄_수_없다():
    with pytest.raises(LedgerError) as error:
        fold(Holding.AMOUNT, [buy("b1", 1_000_000), sell("s1", 1_000_001)])
    assert error.value.code == "over_sell"


def test_부채는_남은_금액보다_많이_갚을_수_없다():
    start = LedgerLine("set", EntrySide.SET, won(500_000))
    assert fold(Holding.DEBT, [start, buy("b1", 200_000)]).state.amount == won(300_000)
    with pytest.raises(LedgerError) as error:
        fold(Holding.DEBT, [start, buy("b1", 500_001)])
    assert error.value.code == "over_repay"


def test_수량_종목은_수량이_없으면_접지_않는다():
    with pytest.raises(LedgerError) as error:
        fold(Holding.QUANTITY, [buy("b1", 500_000)])
    assert error.value.code == "quantity_required"


def test_현재가도_판_기록도_없으면_수익률이_없고_판_기록만_있으면_실현이다():
    state = fold(Holding.QUANTITY, [buy("b1", 500_000, "2")]).state
    assert item_rate(Holding.QUANTITY, state, unit_price=None, price_noted=False) == (None, None)

    sold = fold(Holding.QUANTITY, [buy("b1", 500_000, "2"), sell("s1", 300_000, "1")]).state
    rate, kind = item_rate(Holding.QUANTITY, sold, unit_price=None, price_noted=False)
    assert (rate, kind) == (Decimal("20.0"), RateKind.REALIZED)


def test_코인_소수_수량도_평균_매수가로_판다():
    result = fold(Holding.QUANTITY, [buy("b1", 300_000, "0.003"), sell("s1", 120_000, "0.001")])
    assert result.sells["s1"].sold_cost == won(100_000)
    assert result.state.quantity == Decimal("0.002")


def test_수익률은_소수_첫째_자리에서_반올림한다():
    assert rate_percent(won(80_000), won(520_000)) == Decimal("15.4")
    assert rate_percent(won(-80_000), won(520_000)) == Decimal("-15.4")
    assert rate_percent(won(1), won(0)) is None
