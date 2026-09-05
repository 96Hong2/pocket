"""예산 기간(월 경계)과 진행도 계산."""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

__all__ = ["BudgetPeriod", "PeriodProgress", "same_day_window", "week_of"]


@dataclass(frozen=True)
class PeriodProgress:
    """기간 안에서 오늘이 어디쯤인지."""

    total_days: int
    elapsed_days: int
    remaining_days: int
    date_progress: Decimal


@dataclass(frozen=True, order=True)
class BudgetPeriod:
    start: date
    end: date

    def __post_init__(self) -> None:
        if self.end < self.start:
            raise ValueError("기간의 끝이 시작보다 앞설 수 없다")

    @classmethod
    def of_month(cls, year: int, month: int) -> BudgetPeriod:
        last_day = calendar.monthrange(year, month)[1]
        return cls(date(year, month, 1), date(year, month, last_day))

    @classmethod
    def containing(cls, day: date) -> BudgetPeriod:
        return cls.of_month(day.year, day.month)

    @property
    def total_days(self) -> int:
        return (self.end - self.start).days + 1

    @property
    def is_full_month(self) -> bool:
        if (self.start.year, self.start.month) != (self.end.year, self.end.month):
            return False
        last_day = calendar.monthrange(self.end.year, self.end.month)[1]
        return self.start.day == 1 and self.end.day == last_day

    def contains(self, day: date) -> bool:
        return self.start <= day <= self.end

    def previous_period(self) -> BudgetPeriod:
        self._require_full_month()
        year, month = self.start.year, self.start.month
        return (
            BudgetPeriod.of_month(year - 1, 12)
            if month == 1
            else BudgetPeriod.of_month(year, month - 1)
        )

    def next_period(self) -> BudgetPeriod:
        self._require_full_month()
        year, month = self.start.year, self.start.month
        return (
            BudgetPeriod.of_month(year + 1, 1)
            if month == 12
            else BudgetPeriod.of_month(year, month + 1)
        )

    def progress(self, today: date) -> PeriodProgress:
        total = self.total_days
        elapsed = min(max((today - self.start).days + 1, 1), total)
        # 남은 일수에 오늘을 포함한다. 기간 밖이면 0 또는 전체 일수로 붙인다.
        remaining = min(max((self.end - today).days + 1, 0), total)
        return PeriodProgress(
            total_days=total,
            elapsed_days=elapsed,
            remaining_days=remaining,
            date_progress=Decimal(elapsed) / Decimal(total),
        )

    def _require_full_month(self) -> None:
        if not self.is_full_month:
            raise ValueError("월 전체가 아닌 기간에는 이전·다음 기간이 없다")


def same_day_window(period: BudgetPeriod, day: date) -> BudgetPeriod:
    """그 달의 1일부터 `day` 와 **같은 날짜**까지.

    "지난달과 비교" 를 달 전체로 하면 이번 달은 아직 다 안 지나서 늘 줄어든 것처럼 보인다.
    5일에 보는 사람에게는 지난달 1~5일과 견줘야 뜻이 있다.

    같은 날짜가 그 달에 없으면 말일로 붙인다(3월 31일 → 2월 28일).
    `day` 가 그 달보다 뒤여도 **끝으로 늘리지 않는다.** 늘리면 달 전체가 되어
    이 함수가 있는 이유가 사라진다.
    """
    last_day = calendar.monthrange(period.start.year, period.start.month)[1]
    return BudgetPeriod(
        period.start, date(period.start.year, period.start.month, min(day.day, last_day))
    )


def week_of(day: date) -> BudgetPeriod:
    """그 날이 속한 주. 월요일에 시작해 일요일에 끝난다."""
    monday = day - timedelta(days=day.weekday())
    return BudgetPeriod(monday, monday + timedelta(days=6))
