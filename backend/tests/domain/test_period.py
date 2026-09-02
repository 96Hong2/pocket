from datetime import date
from decimal import Decimal

import pytest

from app.domain.period import BudgetPeriod


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
    assert not partial.is_full_month
    with pytest.raises(ValueError):
        partial.previous_period()
