"""모델에 보내기 전에 가리는 규칙.

금액을 가려 버리면 가계부가 성립하지 않는다. 그래서 무엇을 안 가리는지도 함께 못 박는다.
"""

from __future__ import annotations

import pytest

from app.domain.redaction import MASK, redact


@pytest.mark.parametrize(
    "text",
    [
        "점심 12000 스벅 4500",
        "12000 45000",
        "2026-09-03 택시 9000",
        "9/3 점심 12000",
        "월급 2500000",
    ],
)
def test_금액과_날짜는_가리지_않는다(text: str) -> None:
    result = redact(text)
    assert result.text == text
    assert result.count == 0


@pytest.mark.parametrize(
    "text",
    [
        "카드 1234-5678-9012-3456 로 결제",
        "1234 5678 9012 3456 결제",
        "4111111111111111 결제",
        "계좌 110-234-567890 이체",
        "전화 010-1234-5678",
    ],
)
def test_카드와_계좌_전화번호를_가린다(text: str) -> None:
    result = redact(text)
    assert MASK in result.text
    assert result.count == 1
    assert not any(chunk.isdigit() and len(chunk) >= 10 for chunk in result.text.split())


def test_가린_뒤에도_같이_적은_금액은_남는다() -> None:
    result = redact("카드 1234-5678-9012-3456 으로 점심 12000")
    assert "12000" in result.text
    assert "3456" not in result.text
