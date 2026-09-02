"""예산 기간(월 경계)과 진행도 계산."""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

__all__ = ["BudgetPeriod", "PeriodProgress"]


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
