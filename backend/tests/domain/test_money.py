from decimal import Decimal

import pytest

from app.domain.money import Money, periods_needed, ratio, won


def test_정수와_문자열과_decimal_을_같은_금액으로_받는다():
    assert won(1000) == won("1000") == Money(Decimal(1000))


def test_소수점은_반올림해서_원_단위로_맞춘다():
    assert int(won("1000.4")) == 1000
    assert int(won("1000.5")) == 1001
    # 0 에서 멀어지는 쪽으로 반올림한다
    assert int(won("-1000.5")) == -1001


def test_float_와_bool_은_금액으로_받지_않는다():
    with pytest.raises(TypeError):
        won(1000.5)  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        won(True)  # type: ignore[arg-type]


def test_더하기_빼기_부호반전_절댓값():
    assert won(3000) + won(2000) == won(5000)
    assert won(3000) - won(5000) == won(-2000)
    assert -won(3000) == won(-3000)
    assert abs(won(-3000)) == won(3000)


def test_비율을_곱하면_반올림한다():
    assert won(1_000_000).scale(Decimal("0.10")) == won(100_000)
    assert won(333).scale(Decimal("0.5")) == won(167)


def test_나눗셈은_반올림_내림_올림을_따로_고른다():
    assert won(400_000).divide(21) == won(19_048)
    assert won(400_000).divide_floor(21) == won(19_047)
    assert won(400_000).divide_ceil(21) == won(19_048)
    assert won(10).divide_ceil(4) == won(3)
    assert won(10).divide_floor(4) == won(2)


def test_0_으로_나누면_막는다():
    with pytest.raises(ZeroDivisionError):
        won(1000).divide(0)


def test_음수는_0_으로_눌러준다():
    assert won(-5000).clamped_to_zero() == won(0)
    assert won(5000).clamped_to_zero() == won(5000)


def test_합계와_비교():
    assert Money.total([won(1000), won(2000), won(-500)]) == won(2500)
    assert Money.total([]) == Money.zero()
    assert won(1000) < won(2000)
    assert max([won(30_000), won(90_000), won(100_000)]) == won(100_000)


def test_비율은_분모가_0_이면_None():
    assert ratio(won(200_000), won(600_000)) == Decimal(1) / Decimal(3)
    assert ratio(won(200_000), won(0)) is None


def test_필요한_횟수는_올림이고_기여가_없으면_None():
    assert periods_needed(won(1_000_000), won(300_000)) == 4
    assert periods_needed(won(900_000), won(300_000)) == 3
    assert periods_needed(won(0), won(300_000)) == 0
    assert periods_needed(won(1_000_000), won(0)) is None
