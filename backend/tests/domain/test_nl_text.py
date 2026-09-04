"""줄글을 끊는 자리와 날짜 말.

여기가 흔들리면 같은 문장이 매번 다른 건수로 읽힌다.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.domain.nl_text import find_amounts, read_date, split_entries

TODAY = date(2026, 9, 4)


def test_한_줄에_적은_세_건을_금액마다_끊는다() -> None:
    assert split_entries("점심 12000 스벅 4500 어제 택시 9000") == [
        "점심 12000",
        "스벅 4500",
        "어제 택시 9000",
    ]


def test_콤마로_적은_금액을_구분자로_읽지_않는다() -> None:
    assert split_entries("점심 12000, 커피 4,500") == ["점심 12000", "커피 4,500"]


def test_개수는_금액이_아니다() -> None:
    assert split_entries("커피 2잔 4500") == ["커피 2잔 4500"]
    assert [amount.value for amount in find_amounts("커피 2잔 4500")] == [4500]


def test_만원과_천원을_읽는다() -> None:
    assert [amount.value for amount in find_amounts("옷 5만원")] == [50000]
    assert [amount.value for amount in find_amounts("커피 4500원")] == [4500]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("어제 택시 9000", date(2026, 9, 3)),
        ("그제 택시 9000", date(2026, 9, 2)),
        ("3일 전 택시 9000", date(2026, 9, 1)),
        ("9월 1일 점심 12000", date(2026, 9, 1)),
        ("2026-08-30 점심 12000", date(2026, 8, 30)),
        ("12월 25일 선물 30000", date(2025, 12, 25)),
    ],
)
def test_날짜_말을_읽는다(text: str, expected: date) -> None:
    found, rest = read_date(text, today=TODAY)
    assert found == expected
    assert "어제" not in rest and "월" not in rest.split()[0]


def test_날짜를_안_적으면_비워_둔다() -> None:
    found, rest = read_date("점심 12000", today=TODAY)
    assert found is None
    assert rest == "점심 12000"


def test_날짜의_숫자를_금액으로_읽지_않는다() -> None:
    _, rest = read_date("2026-08-30 점심 12000", today=TODAY)
    assert [amount.value for amount in find_amounts(rest)] == [12000]


def test_만과_천을_이어_쓴_금액을_한_덩어리로_읽는다() -> None:
    assert [amount.value for amount in find_amounts("커피 3만5천원")] == [35000]
    assert [amount.value for amount in find_amounts("점심 1만2천원")] == [12000]
    assert [amount.value for amount in find_amounts("커피 3만 5천원")] == [35000]
    assert split_entries("커피 3만5천원") == ["커피 3만5천원"]


def test_만_뒤의_개수는_금액에_더하지_않는다() -> None:
    assert [amount.value for amount in find_amounts("커피 3만 2잔")] == [30000]


def test_연도까지_적은_날짜를_통째로_읽는다() -> None:
    found, rest = read_date("2026년 1월 2일 점심 12000", today=TODAY)
    assert found == date(2026, 1, 2)
    # 연도를 안 걷어내면 2026 이 금액으로 읽혀 유령 후보가 생긴다.
    assert [amount.value for amount in find_amounts(rest)] == [12000]
