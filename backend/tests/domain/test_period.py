from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.domain.period import BudgetPeriod, same_day_window, week_containing


def test_월_경계는_달마다_길이가_다르다():
    assert BudgetPeriod.of_month(2026, 9).total_days == 30
    assert BudgetPeriod.of_month(2026, 1).total_days == 31
    assert BudgetPeriod.of_month(2026, 2).total_days == 28


def test_윤년_2월은_29일_이고_2100년은_윤년이_아니다():
    assert BudgetPeriod.of_month(2024, 2).end == date(2024, 2, 29)
    assert BudgetPeriod.of_month(2024, 2).total_days == 29
    assert BudgetPeriod.of_month(2100, 2).total_days == 28


def test_날짜가_속한_기간을_찾는다():
    period = BudgetPeriod.containing(date(2024, 2, 15))
    assert period == BudgetPeriod(date(2024, 2, 1), date(2024, 2, 29))
    assert period.contains(date(2024, 2, 29))
    assert not period.contains(date(2024, 3, 1))


def test_끝이_시작보다_앞서면_만들_수_없다():
    with pytest.raises(ValueError):
        BudgetPeriod(date(2026, 9, 30), date(2026, 9, 1))


def test_첫날에는_하루_지났고_남은_일수는_기간_전체다():
    progress = BudgetPeriod.of_month(2026, 9).progress(date(2026, 9, 1))
    assert progress.elapsed_days == 1
    assert progress.remaining_days == 30
    assert progress.date_progress == Decimal(1) / Decimal(30)


def test_남은_일수에_오늘이_포함된다():
    period = BudgetPeriod.of_month(2026, 9)
    assert period.progress(date(2026, 9, 30)).remaining_days == 1
    assert period.progress(date(2026, 9, 29)).remaining_days == 2
    assert period.progress(date(2026, 9, 10)).elapsed_days == 10
    assert period.progress(date(2026, 9, 10)).remaining_days == 21


def test_기간_밖_날짜도_경계_안으로_눌러준다():
    period = BudgetPeriod.of_month(2026, 9)
    before = period.progress(date(2026, 8, 20))
    assert before.elapsed_days == 1
    assert before.remaining_days == 30

    after = period.progress(date(2026, 10, 5))
    assert after.elapsed_days == 30
    assert after.remaining_days == 0
    assert after.date_progress == Decimal(1)


def test_연말연시로_기간을_넘어간다():
    january = BudgetPeriod.of_month(2026, 1)
    assert january.previous_period() == BudgetPeriod.of_month(2025, 12)
    assert BudgetPeriod.of_month(2026, 12).next_period() == BudgetPeriod.of_month(2027, 1)
    assert BudgetPeriod.of_month(2024, 3).previous_period().end == date(2024, 2, 29)


def test_월_전체가_아니면_이전_기간을_말할_수_없다():
    partial = BudgetPeriod(date(2026, 9, 5), date(2026, 9, 20))
    assert not partial.is_month_period
    with pytest.raises(ValueError):
        partial.previous_period()


def test_주는_월요일에_시작해서_일요일에_끝난다():
    # 2026년 9월 10일은 목요일이다.
    week = week_containing(date(2026, 9, 10))
    assert week == BudgetPeriod(date(2026, 9, 7), date(2026, 9, 13))
    assert week.total_days == 7


def test_월요일과_일요일도_같은_주에_들어간다():
    monday = week_containing(date(2026, 9, 7))
    sunday = week_containing(date(2026, 9, 13))
    assert monday == sunday


def test_주는_달을_넘어도_이어진다():
    week = week_containing(date(2026, 9, 30))
    assert week == BudgetPeriod(date(2026, 9, 28), date(2026, 10, 4))


# ── 한 달 시작일 ──────────────────────────────────────
# 달 이름은 그 기간에 날이 가장 많이 든 달이다. 15 이하면 시작한 달, 16 이상이면 끝나는 달.
# 화면이 같은 표를 프론트에 둔다. 이 표가 바뀌면 그쪽 표도 함께 바꾼다.


@pytest.mark.parametrize(
    ("year", "month", "start_day", "start", "end"),
    [
        (2026, 10, 1, date(2026, 10, 1), date(2026, 10, 31)),
        (2026, 10, 2, date(2026, 10, 2), date(2026, 11, 1)),
        (2026, 10, 5, date(2026, 10, 5), date(2026, 11, 4)),
        (2026, 10, 15, date(2026, 10, 15), date(2026, 11, 14)),
        (2026, 10, 16, date(2026, 9, 16), date(2026, 10, 15)),
        (2026, 10, 25, date(2026, 9, 25), date(2026, 10, 24)),
        (2026, 10, 28, date(2026, 9, 28), date(2026, 10, 27)),
        # 2월 평년
        (2026, 2, 1, date(2026, 2, 1), date(2026, 2, 28)),
        (2026, 2, 5, date(2026, 2, 5), date(2026, 3, 4)),
        (2026, 2, 15, date(2026, 2, 15), date(2026, 3, 14)),
        (2026, 2, 16, date(2026, 1, 16), date(2026, 2, 15)),
        (2026, 2, 25, date(2026, 1, 25), date(2026, 2, 24)),
        (2026, 2, 28, date(2026, 1, 28), date(2026, 2, 27)),
        (2026, 3, 28, date(2026, 2, 28), date(2026, 3, 27)),
        # 2월 윤년
        (2024, 2, 1, date(2024, 2, 1), date(2024, 2, 29)),
        (2024, 2, 5, date(2024, 2, 5), date(2024, 3, 4)),
        (2024, 3, 25, date(2024, 2, 25), date(2024, 3, 24)),
        (2024, 3, 28, date(2024, 2, 28), date(2024, 3, 27)),
        # 12월 → 1월, 1월 → 지난해 12월
        (2026, 12, 5, date(2026, 12, 5), date(2027, 1, 4)),
        (2026, 12, 15, date(2026, 12, 15), date(2027, 1, 14)),
        (2027, 1, 16, date(2026, 12, 16), date(2027, 1, 15)),
        (2027, 1, 25, date(2026, 12, 25), date(2027, 1, 24)),
        (2027, 1, 1, date(2027, 1, 1), date(2027, 1, 31)),
    ],
)
def test_이름_달과_시작일로_기간을_만든다(
    year: int, month: int, start_day: int, start: date, end: date
) -> None:
    period = BudgetPeriod.of_month(year, month, start_day)

    assert (period.start, period.end) == (start, end)
    assert period.key == f"{year:04d}-{month:02d}"
    assert period.is_month_period


@pytest.mark.parametrize(
    ("day", "start_day", "key", "start", "end"),
    [
        # 시작일을 25 로 바꾼 10월 5일에도 화면은 「10월」 이다. 지난달로 돌아가지 않는다.
        (date(2026, 10, 5), 25, "2026-10", date(2026, 9, 25), date(2026, 10, 24)),
        (date(2026, 10, 24), 25, "2026-10", date(2026, 9, 25), date(2026, 10, 24)),
        (date(2026, 10, 25), 25, "2026-11", date(2026, 10, 25), date(2026, 11, 24)),
        (date(2026, 12, 25), 25, "2027-01", date(2026, 12, 25), date(2027, 1, 24)),
        (date(2026, 10, 4), 5, "2026-09", date(2026, 9, 5), date(2026, 10, 4)),
        (date(2026, 10, 5), 5, "2026-10", date(2026, 10, 5), date(2026, 11, 4)),
        (date(2027, 1, 3), 5, "2026-12", date(2026, 12, 5), date(2027, 1, 4)),
        (date(2026, 10, 15), 16, "2026-10", date(2026, 9, 16), date(2026, 10, 15)),
        (date(2026, 10, 16), 16, "2026-11", date(2026, 10, 16), date(2026, 11, 15)),
        (date(2026, 10, 5), 1, "2026-10", date(2026, 10, 1), date(2026, 10, 31)),
        (date(2024, 2, 29), 1, "2024-02", date(2024, 2, 1), date(2024, 2, 29)),
    ],
)
def test_날짜가_든_기간과_이름(day: date, start_day: int, key: str, start: date, end: date) -> None:
    period = BudgetPeriod.containing(day, start_day)

    assert (period.key, period.start, period.end) == (key, start, end)


@pytest.mark.parametrize("start_day", range(1, 29))
def test_어느_시작일이든_기간이_빈틈없이_이어진다(start_day: int) -> None:
    period = BudgetPeriod.of_month(2023, 11, start_day)
    for _ in range(30):
        following = period.next_period()
        assert following.start == period.end + timedelta(days=1)
        assert following.previous_period() == period
        assert 28 <= following.total_days <= 31
        assert BudgetPeriod.containing(following.start, start_day) == following
        assert BudgetPeriod.containing(following.end, start_day) == following
        period = following


@pytest.mark.parametrize("start_day", [0, 29, 31])
def test_시작일은_1에서_28까지만(start_day: int) -> None:
    with pytest.raises(ValueError):
        BudgetPeriod.of_month(2026, 10, start_day)
    with pytest.raises(ValueError):
        BudgetPeriod.containing(date(2026, 10, 5), start_day)


def test_시작일이_1이면_달력_월과_같다() -> None:
    for month in range(1, 13):
        assert BudgetPeriod.of_month(2026, month, 1) == BudgetPeriod.of_month(2026, month)
    assert BudgetPeriod(date(2026, 9, 25), date(2026, 10, 24)).is_month_period
    assert not BudgetPeriod(date(2026, 9, 25), date(2026, 10, 23)).is_month_period
    assert not BudgetPeriod(date(2026, 1, 31), date(2026, 2, 27)).is_month_period


@pytest.mark.parametrize(
    ("current", "today", "now", "before"),
    [
        # 시작일 25, 10월 5일은 기간의 열하루째다. 지난 기간도 열하루를 본다.
        (
            BudgetPeriod.of_month(2026, 10, 25),
            date(2026, 10, 5),
            (date(2026, 9, 25), date(2026, 10, 5)),
            (date(2026, 8, 25), date(2026, 9, 4)),
        ),
        # 기간 첫날은 하루짜리 창이다.
        (
            BudgetPeriod.of_month(2026, 10, 25),
            date(2026, 9, 25),
            (date(2026, 9, 25), date(2026, 9, 25)),
            (date(2026, 8, 25), date(2026, 8, 25)),
        ),
        # 지난 기간이 짧으면 끝으로 붙인다. 3월 5일 ~ 4월 4일의 서른하루째, 2월 기간은 스무여드레.
        (
            BudgetPeriod.of_month(2026, 3, 5),
            date(2026, 4, 4),
            (date(2026, 3, 5), date(2026, 4, 4)),
            (date(2026, 2, 5), date(2026, 3, 4)),
        ),
    ],
)
def test_지난_기간도_같은_날수만큼_견준다(
    current: BudgetPeriod, today: date, now: tuple[date, date], before: tuple[date, date]
) -> None:
    this_window = same_day_window(current, today)
    last_window = same_day_window(current.previous_period(), today)

    assert (this_window.start, this_window.end) == now
    assert (last_window.start, last_window.end) == before
