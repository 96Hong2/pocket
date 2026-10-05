"""API 스키마가 공유하는 금액·비율 규칙.

거래와 예산이 같은 상한·같은 정수 규칙을 쓴다. 두 곳에 나눠 적으면 한쪽만 고쳐진다.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from pydantic import PlainSerializer

__all__ = [
    "MAX_AMOUNT",
    "MAX_QUANTITY",
    "RATIO_PLACES",
    "QuantityOut",
    "integral_won",
    "quantity_in",
    "quantity_out",
    "ratio_out",
]

# numeric(14,0) 상한. 넘으면 DB 가 아니라 스키마에서 막는다.
MAX_AMOUNT = Decimal("99999999999999")

# 수량 상한. numeric(20,8) 의 정수부 12자리.
MAX_QUANTITY = Decimal("999999999999.99999999")
_QUANTITY_PLACES = Decimal("0.00000001")

# 비율을 내보낼 때 맞추는 자릿수. 게이지와 백분율 표시에 넉넉하다.
RATIO_PLACES = Decimal("0.0001")


def integral_won(value: Decimal | None) -> Decimal | None:
    """원 단위 정수만 받는다. 소수를 조용히 반올림해 저장하지 않는다."""
    if value is None:
        return None
    if value != value.to_integral_value():
        raise ValueError("금액은 원 단위 정수여야 해요.")
    return value.quantize(Decimal(1))


def ratio_out(value: Decimal | None) -> Decimal | None:
    """비율을 내보내는 형태로 맞춘다.

    나눗셈 결과는 `0E+1` 이나 `0.3333333333333333333333333333` 처럼 나온다. 앞의 지수 표기는
    openapi 가 Decimal 에 붙이는 pattern 과도 어긋나서, 스펙이 실제 응답을 거짓말하게 된다.
    자릿수를 고정해 그 두 가지를 함께 막는다. 판정은 이 값이 아니라 도메인이 이미 끝냈다.
    """
    if value is None:
        return None
    return value.quantize(RATIO_PLACES, rounding=ROUND_HALF_UP)


def quantity_in(value: Decimal | None) -> Decimal | None:
    """수량은 소수 8자리까지. 더 잘게 오면 조용히 자르지 않고 막는다."""
    if value is None:
        return None
    if not value.is_finite() or value < 0 or value > MAX_QUANTITY:
        raise ValueError("수량을 다시 적어 주세요.")
    if value != value.quantize(_QUANTITY_PLACES):
        raise ValueError("수량은 소수 8자리까지 적을 수 있어요.")
    return value.quantize(_QUANTITY_PLACES)


def quantity_out(value: Decimal | None) -> Decimal | None:
    """뒤에 붙은 0 을 떼어 내보낸다. 2.00000000 이 아니라 2, 0.00300000 이 아니라 0.003."""
    if value is None:
        return None
    if value == value.to_integral_value():
        return value.quantize(Decimal(1))
    return value.normalize()


def _fixed_point(value: Decimal) -> str:
    # str(Decimal) 는 0.00000006 을 "6E-8" 로 낸다. 화면은 지수 표기를 못 읽는다.
    return format(value, "f")


# 응답의 수량 칸. JSON 으로 나갈 때 늘 고정 소수점 문자열이다.
QuantityOut = Annotated[Decimal, PlainSerializer(_fixed_point, return_type=str, when_used="json")]
