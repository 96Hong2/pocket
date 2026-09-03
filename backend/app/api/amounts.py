"""API 스키마가 공유하는 금액·비율 규칙.

거래와 예산이 같은 상한·같은 정수 규칙을 쓴다. 두 곳에 나눠 적으면 한쪽만 고쳐진다.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

__all__ = ["MAX_AMOUNT", "RATIO_PLACES", "integral_won", "ratio_out"]

# numeric(14,0) 상한. 넘으면 DB 가 아니라 스키마에서 막는다.
MAX_AMOUNT = Decimal("99999999999999")

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
