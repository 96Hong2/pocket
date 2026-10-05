"""캡처로 읽은 줄의 넣은 돈과 1주 가격. 기대값은 프론트 assetMath.test.ts 의 캡처 예와 같다."""

from decimal import Decimal

from app.domain.asset_capture import captured_cost, captured_holding, unit_price_of
from app.domain.asset_ledger import InvestKind
from app.domain.money import won


def test_캡처_예_엔비디아_2주_평가금액_2801830_평가손익_801830():
    value = won(2_801_830)
    cost = captured_cost(value, purchase=None, profit=801_830)
    held = captured_holding(value, InvestKind.STOCK, Decimal(2), cost)

    assert held.kind is InvestKind.STOCK
    assert held.quantity == Decimal(2)
    assert held.cost_basis == won(2_000_000)
    assert held.unit_price == won(1_400_915)
    assert held.rate(value) == Decimal("40.1")


def test_매입금액이_있으면_평가손익보다_먼저_쓴다():
    assert captured_cost(won(1_000_000), purchase=900_000, profit=50_000) == won(900_000)


def test_손해난_평가손익은_빼면_더해진다():
    assert captured_cost(won(800_000), purchase=None, profit=-200_000) == won(1_000_000)


def test_둘_다_못_읽으면_넣은_돈을_모르고_금액만_남는다():
    held = captured_holding(won(47_446), InvestKind.STOCK, Decimal(1), None)

    assert captured_cost(won(47_446), purchase=None, profit=None) is None
    assert (held.kind, held.quantity, held.cost_basis, held.unit_price) == (None, None, None, None)
    assert held.rate(won(47_446)) is None


def test_넣은_돈이_0_아래로_나오면_못_읽은_것이다():
    assert captured_cost(won(100_000), purchase=None, profit=150_000) is None


def test_수량을_못_읽은_주식은_넣은_돈만_있는_금액_항목이다():
    held = captured_holding(won(1_100_000), InvestKind.STOCK, None, won(1_000_000))

    assert (held.kind, held.quantity, held.unit_price) == (None, None, None)
    assert held.rate(won(1_100_000)) == Decimal("10.0")


def test_펀드는_수량이_있어도_금액_종목이다():
    held = captured_holding(won(1_100_000), InvestKind.FUND, Decimal(3), won(1_000_000))

    assert (held.kind, held.quantity) == (InvestKind.FUND, None)


def test_1주_가격은_원_단위로_반올림한다():
    assert unit_price_of(won(1_000), Decimal(3)) == won(333)
    assert unit_price_of(won(1_001), Decimal(2)) == won(501)
