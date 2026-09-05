"""며칠 만에 돌아온 사용자에게 보여줄 정리 진행률.

최근 7일 중 **며칠 기록했나**만 센다. 빠진 날 수나 연속 실패 같은 실점 표현은
여기서 아예 만들지 않는다. 만들어 두면 화면이 언젠가 그것을 쓴다.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from app.domain.aggregation import TransactionInput
from app.domain.period import BudgetPeriod

__all__ = [
    "RECOVERY_WINDOW_DAYS",
    "RecoveryProgress",
    "build_progress",
    "count_recorded_days",
    "recovery_window",
]

RECOVERY_WINDOW_DAYS = 7

# 화면이 게이지 너비로만 쓰는 값이라 그 이상의 정밀도가 필요 없다.
_PROGRESS_PLACES = Decimal("0.0001")


@dataclass(frozen=True)
class RecoveryProgress:
    """창 길이와 그중 기록한 날 수, 그리고 둘의 비율."""

    window_days: int
    recorded_days: int
    progress: Decimal


def recovery_window(today: date) -> BudgetPeriod:
    """오늘까지의 7일 창. 오늘을 포함하므로 6일 전부터다."""
    return BudgetPeriod(today - timedelta(days=RECOVERY_WINDOW_DAYS - 1), today)


def count_recorded_days(transactions: Iterable[TransactionInput], window: BudgetPeriod) -> int:
    """창 안에서 지워지지 않은 거래가 하나라도 있는 날의 수.

    거래 종류를 가리지 않는다. 이체만 있는 날도 정리한 날이다.
    `aggregate_days` 를 쓰지 않는 이유가 이것이다. 그쪽은 이체만 있는 날을 버려서
    "오늘 기록했는데 진행은 그대로" 가 된다.
    """
    return len(
        {
            tx.occurred_on
            for tx in transactions
            if not tx.is_deleted and window.contains(tx.occurred_on)
        }
    )


def build_progress(
    transactions: Iterable[TransactionInput], window: BudgetPeriod
) -> RecoveryProgress:
    total = window.total_days
    recorded = count_recorded_days(transactions, window)
    return RecoveryProgress(
        window_days=total,
        recorded_days=recorded,
        progress=(Decimal(recorded) / Decimal(total)).quantize(
            _PROGRESS_PLACES, rounding=ROUND_HALF_UP
        ),
    )
