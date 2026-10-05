"""예산 기간(한 달 경계)과 진행도 계산.

한 달은 사용자가 정한 시작일(1 ~ 28)에 시작해 다음 달 시작일 전날에 끝난다. 시작일이 1 이면
달력 월과 같다. 기간의 이름(「10월」)은 **그 기간에 날이 가장 많이 든 달**이다.
시작일이 15 이하면 시작한 달, 16 이상이면 끝나는 달이 된다(ADR-0046).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

__all__ = [
    "DEFAULT_START_DAY",
    "MAX_START_DAY",
    "MIN_START_DAY",
    "BudgetPeriod",
    "PeriodProgress",
    "same_day_window",
    "week_containing",
    "week_to_date",
]


DEFAULT_START_DAY = 1
MIN_START_DAY = 1
# 29 이상을 받으면 2월에 그 날이 없어 기간마다 시작이 흔들린다.
MAX_START_DAY = 28
# 이 날부터 시작하면 기간의 날 대부분이 다음 달에 든다. 그래서 끝나는 달 이름을 붙인다.
_NAMED_BY_END_FROM = 16


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


def _check_start_day(start_day: int) -> None:
    if not MIN_START_DAY <= start_day <= MAX_START_DAY:
        raise ValueError(f"한 달 시작일은 {MIN_START_DAY} ~ {MAX_START_DAY} 사이다")


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
    def of_month(cls, year: int, month: int, start_day: int = DEFAULT_START_DAY) -> BudgetPeriod:
        """이름이 `month` 월인 한 달. 시작일이 16 이상이면 지난달에 시작한다."""
        _check_start_day(start_day)
        if start_day >= _NAMED_BY_END_FROM:
            year, month = _shift_month(year, month, -1)
        return cls._starting(date(year, month, start_day))

    @classmethod
    def containing(cls, day: date, start_day: int = DEFAULT_START_DAY) -> BudgetPeriod:
        _check_start_day(start_day)
        year, month = day.year, day.month
        if day.day < start_day:
            year, month = _shift_month(year, month, -1)
        return cls._starting(date(year, month, start_day))

    @classmethod
    def _starting(cls, start: date) -> BudgetPeriod:
        """그 날 시작해 다음 달 같은 날 전날에 끝나는 한 달."""
        year, month = _shift_month(start.year, start.month, 1)
        return cls(start, date(year, month, start.day) - timedelta(days=1))

    @property
    def total_days(self) -> int:
        return (self.end - self.start).days + 1

    @property
    def is_month_period(self) -> bool:
        """시작일부터 다음 달 시작일 전날까지인 한 달 기간인가. 시작일 1 이면 달력 월이다."""
        return self.start.day <= MAX_START_DAY and self == BudgetPeriod._starting(self.start)

    @property
    def start_day(self) -> int:
        self._require_month_period()
        return self.start.day

    @property
    def key(self) -> str:
        """기간의 이름 달 "YYYY-MM". 화면의 「N월」 과 `?year&month` 가 이 달이다.

        시작일이 16 이상이면 끝나는 달 이름을 붙인다. 시작일을 바꾼 날 화면의 달 이름이
        지난달로 되돌아가지 않게 하려는 규칙이다.
        """
        year, month = self.start.year, self.start.month
        if self.start.day >= _NAMED_BY_END_FROM:
            year, month = _shift_month(year, month, 1)
        return f"{year:04d}-{month:02d}"

    def contains(self, day: date) -> bool:
        return self.start <= day <= self.end

    def previous_period(self) -> BudgetPeriod:
        self._require_month_period()
        year, month = _shift_month(self.start.year, self.start.month, -1)
        return BudgetPeriod._starting(date(year, month, self.start.day))

    def next_period(self) -> BudgetPeriod:
        self._require_month_period()
        return BudgetPeriod._starting(self.end + timedelta(days=1))

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

    def _require_month_period(self) -> None:
        if not self.is_month_period:
            raise ValueError("한 달 기간이 아니면 이전·다음 기간이 없다")


def same_day_window(period: BudgetPeriod, day: date) -> BudgetPeriod:
    """그 기간의 첫날부터, `day` 가 든 기간에서 지난 날수만큼.

    "지난달과 비교" 를 달 전체로 하면 이번 달은 아직 다 안 지나서 늘 줄어든 것처럼 보인다.
    5일에 보는 사람에게는 지난달 1~5일과 견줘야 뜻이 있다. 시작일이 25 면 10월 5일은
    기간의 11일째라 지난 기간도 8월 25일 ~ 9월 4일 열하루다.

    날수가 그 기간보다 길면 끝으로 붙인다(3월 31일 → 2월 28일). 시작일이 1 이면
    「같은 날짜까지」 와 같다. `day` 가 그 기간보다 뒤여도 **끝으로 늘리지 않는다.**
    늘리면 달 전체가 되어 이 함수가 있는 이유가 사라진다.
    """
    elapsed = (day - BudgetPeriod.containing(day, period.start_day).start).days
    return BudgetPeriod(period.start, min(period.start + timedelta(days=elapsed), period.end))


def week_containing(day: date) -> BudgetPeriod:
    """그 날이 속한 한 주 전체(월요일~일요일).

    `week_to_date` 와 쓰임이 다르다. 저건 지난주와 견주려고 아직 안 지난 날을 빼고,
    이건 이번 주에 며칠 남았는지 세려고 주를 통째로 잡는다.
    """
    start = day - timedelta(days=day.weekday())
    return BudgetPeriod(start, start + timedelta(days=6))


def week_to_date(day: date) -> BudgetPeriod:
    """그 주 월요일부터 `day` 까지. 아직 안 지난 날은 안 센다.

    주를 통째로(월~일) 잡으면 안 된다. 수요일에 보는 사람의 "이번 주" 는 사흘이고
    "지난주" 는 이레라, 견주면 늘 줄어든 것처럼 보인다. `same_day_window` 와 같은 이유다.

    지난주는 `week_to_date(day - 7일)` 로 만든다. 그러면 두 창의 요일 수가 같아진다.
    """
    return BudgetPeriod(day - timedelta(days=day.weekday()), day)
