"""원 단위 금액 타입.

금액은 항상 원 단위 정수로 다루고, 반올림 규칙은 이 파일에만 둔다.
float 은 이진 오차 때문에 받지 않는다.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from decimal import ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP, Decimal

__all__ = ["Money", "MoneyLike", "periods_needed", "ratio", "won"]

MoneyLike = int | str | Decimal

_UNIT = Decimal(1)


def _to_decimal(value: object) -> Decimal:
    """정수 원 단위 Decimal 로 바꾼다. float 은 거부한다."""
    if isinstance(value, bool):
        raise TypeError("금액에 bool 을 쓸 수 없다")
    if isinstance(value, float):
        raise TypeError("금액에 float 을 쓸 수 없다. int, str, Decimal 만 받는다")
    if isinstance(value, Decimal):
        return _round_half_up(value)
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, str):
        return _round_half_up(Decimal(value))
    raise TypeError(f"금액으로 쓸 수 없는 값: {type(value).__name__}")


def _round_half_up(value: Decimal) -> Decimal:
    return value.quantize(_UNIT, rounding=ROUND_HALF_UP)


def _round_floor(value: Decimal) -> Decimal:
    return value.quantize(_UNIT, rounding=ROUND_FLOOR)


def _round_ceil(value: Decimal) -> Decimal:
    return value.quantize(_UNIT, rounding=ROUND_CEILING)


@dataclass(frozen=True, order=True)
class Money:
    """원 단위 정수 금액. 거래 금액은 양수지만 계산 결과는 음수일 수 있다."""

    amount: Decimal

    def __post_init__(self) -> None:
        object.__setattr__(self, "amount", _to_decimal(self.amount))

    @classmethod
    def zero(cls) -> Money:
        return cls(Decimal(0))

    @classmethod
    def total(cls, items: Iterable[Money]) -> Money:
        result = Decimal(0)
        for item in items:
            result += item.amount
        return cls(result)

    @property
    def is_zero(self) -> bool:
        return self.amount == 0

    @property
    def is_positive(self) -> bool:
        return self.amount > 0

    @property
    def is_negative(self) -> bool:
        return self.amount < 0

    def clamped_to_zero(self) -> Money:
        """음수면 0 으로 만든다."""
        return self if self.amount > 0 else Money.zero()

    def scale(self, factor: int | str | Decimal) -> Money:
        """비율을 곱한다. 결과는 반올림."""
        return Money(_round_half_up(self.amount * _as_factor(factor)))

    def divide(self, divisor: int | str | Decimal) -> Money:
        return Money(_round_half_up(self._quotient(divisor)))

    def divide_floor(self, divisor: int | str | Decimal) -> Money:
        """내림. 가용액처럼 넘치면 안 되는 값에 쓴다."""
        return Money(_round_floor(self._quotient(divisor)))

    def divide_ceil(self, divisor: int | str | Decimal) -> Money:
        """올림. 목표 달성에 필요한 금액처럼 모자라면 안 되는 값에 쓴다."""
        return Money(_round_ceil(self._quotient(divisor)))

    def _quotient(self, divisor: int | str | Decimal) -> Decimal:
        factor = _as_factor(divisor)
        if factor == 0:
            raise ZeroDivisionError("금액을 0 으로 나눌 수 없다")
        return self.amount / factor

    def __add__(self, other: Money) -> Money:
        return Money(self.amount + other.amount)

    def __sub__(self, other: Money) -> Money:
        return Money(self.amount - other.amount)

    def __neg__(self) -> Money:
        return Money(-self.amount)

    def __abs__(self) -> Money:
        return Money(abs(self.amount))

    def __int__(self) -> int:
        return int(self.amount)

    def __str__(self) -> str:
        return f"{int(self.amount)}원"


def _as_factor(value: int | str | Decimal) -> Decimal:
    if isinstance(value, bool):
        raise TypeError("계수에 bool 을 쓸 수 없다")
    if isinstance(value, float):
        raise TypeError("계수에 float 을 쓸 수 없다. int, str, Decimal 만 받는다")
    if isinstance(value, Decimal):
        return value
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, str):
        return Decimal(value)
    raise TypeError(f"계수로 쓸 수 없는 값: {type(value).__name__}")


def won(value: MoneyLike | Money) -> Money:
    if isinstance(value, Money):
        return value
    return Money(_to_decimal(value))


def ratio(numerator: Money, denominator: Money) -> Decimal | None:
    """진행률 계산용 비율. 분모가 0 이면 None."""
    if denominator.is_zero:
        return None
    return numerator.amount / denominator.amount


def periods_needed(total: Money, per_period: Money) -> int | None:
    """total 을 per_period 로 채우는 데 필요한 횟수(올림). per_period 가 0 이하면 None."""
    if not per_period.is_positive:
        return None
    if not total.is_positive:
        return 0
    return int(_round_ceil(total.amount / per_period.amount))
