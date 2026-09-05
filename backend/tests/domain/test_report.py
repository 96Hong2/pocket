"""리포트 순위표. 도넛과 목록이 같은 목록을 쓴다."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.domain.money import Money
from app.domain.period import BudgetPeriod, same_day_window, week_of
from app.domain.report import ROLLED_UP, UNCATEGORIZED, rank_breakdown


def won(value: int) -> Money:
    return Money(Decimal(value))


def test_큰_것부터_세우고_넘치는_것은_한_줄로_접는다() -> None:
    spend = {f"c{i}": won((10 - i) * 1000) for i in range(10)}

    rows, total = rank_breakdown(spend)

    # 여덟 줄 + 접은 한 줄. 색 램프가 아홉 색이라 그 이상은 같은 색이 두 번 나온다.
    assert len(rows) == 9
    expected = [Decimal(v) for v in range(10000, 2000, -1000)]
    assert [row.amount.amount for row in rows[:8]] == expected
    folded = rows[-1]
    assert folded.key == ROLLED_UP
    assert folded.rolled_count == 2
    assert folded.amount == won(2000 + 1000)
    assert total == won(sum((10 - i) * 1000 for i in range(10)))


def test_분류를_못_정한_줄도_남긴다() -> None:
    rows, total = rank_breakdown({None: won(3000), "c1": won(7000)})

    assert [row.key for row in rows] == ["c1", UNCATEGORIZED]
    # 감추면 조각 합이 총액과 안 맞아 도넛에 빈 구멍이 생긴다.
    assert total == won(10000)


def test_환불이_지출보다_큰_분류는_조각에서_빠지고_그_사실이_합계에_남는다() -> None:
    # 음수 호는 그릴 수 없다. 뺀 만큼 조각 합이 그 달 지출과 달라진다.
    rows, total = rank_breakdown({"c1": won(10000), "c2": won(-4000)})

    assert [row.key for row in rows] == ["c1"]
    assert total == won(10000)


def test_비중은_서버가_준다() -> None:
    rows, _ = rank_breakdown({"c1": won(7500), "c2": won(2500)})

    # 화면이 amount/total 을 다시 하면 두 곳에서 센 것이 된다.
    assert [row.share for row in rows] == [Decimal("0.75"), Decimal("0.25")]


def test_쓴_것이_없으면_줄도_비중도_없다() -> None:
    rows, total = rank_breakdown({})

    assert rows == []
    assert total.is_zero


@pytest.mark.parametrize(
    ("month", "today", "expected_end"),
    [
        # 이 줄이 이 함수의 존재 이유다. 9월 5일에 8월을 견주면 8월 1~5일이다.
        ((2026, 8), date(2026, 9, 5), date(2026, 8, 5)),
        # 같은 날짜가 그 달에 없으면 말일로 붙인다.
        ((2026, 2), date(2026, 3, 31), date(2026, 2, 28)),
        # 오늘이 그 달 말일을 넘겨도 **끝으로 늘리지 않는다.** 늘리면 달 전체가 된다.
        ((2026, 8), date(2026, 9, 30), date(2026, 8, 30)),
        # 1일이면 하루짜리 창이다. 0일짜리로 만들면 기간 객체가 죽는다.
        ((2026, 8), date(2026, 9, 1), date(2026, 8, 1)),
    ],
)
def test_같은_날짜까지_창(month: tuple[int, int], today: date, expected_end: date) -> None:
    window = same_day_window(BudgetPeriod.of_month(*month), today)

    assert window.start == date(*month, 1)
    assert window.end == expected_end


def test_주는_월요일에_시작해_일요일에_끝난다() -> None:
    # 2026-09-05 는 토요일이다.
    week = week_of(date(2026, 9, 5))

    assert week.start == date(2026, 8, 31)
    assert week.end == date(2026, 9, 6)
    assert week.total_days == 7
