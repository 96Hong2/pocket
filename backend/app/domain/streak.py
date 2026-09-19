"""이어서 적은 날. 7일을 채울 때마다 홈이 한 번 축하하는 데 쓴다.

**이어진 것만 센다.** 끊겼으면 아무것도 없는 것(None)이다. 며칠째 비었는지, 며칠
이어가다 끊겼는지 같은 값은 여기서 만들지 않는다. 만들어 두면 화면이 언젠가 그것을
쓴다(`recovery.py` 와 같은 이유). 끊겼다고 말하는 순간 이 앱을 지우게 된다.

「적은 날」 은 기록이 그 날짜에 하나라도 있는 날이다. 적은 **시각**이 아니라 적힌
**날짜**로 센다. 밀린 영수증을 한꺼번에 캡처로 채운 사람도 한 주를 다 채운 것이다.
「며칠 놓쳐도 캡처 한 장으로 되돌린다」 는 이 앱의 약속과 같은 쪽이다. 무지출 표시도
기록이라 그 날도 센다.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta

from app.domain.aggregation import TransactionInput
from app.domain.period import BudgetPeriod

__all__ = ["STREAK_LOOKBACK_DAYS", "Streak", "current_streak", "streak_window"]

# 8주 하고 하루. 7일마다 축하하므로 8주(56일)까지는 시작일을 알 수 있어야 한다.
# 하루를 더 읽는 것은 56일째 되는 날에 그 앞날이 비었는지를 보기 위해서다.
STREAK_LOOKBACK_DAYS = 57


@dataclass(frozen=True)
class Streak:
    """이어진 날의 첫날과 길이. 끝은 오늘이거나, 오늘 아직 안 적었으면 어제다."""

    started_on: date
    days: int


def streak_window(today: date) -> BudgetPeriod:
    return BudgetPeriod(today - timedelta(days=STREAK_LOOKBACK_DAYS - 1), today)


def current_streak(transactions: Iterable[TransactionInput], today: date) -> Streak | None:
    """오늘(또는 어제)까지 이어서 적은 날.

    **오늘 아직 안 적었으면 어제에서 끝난 것으로 본다.** 하루는 아직 안 끝났다. 아침에
    앱을 연 사람에게 어제까지 이은 것을 없던 일로 만들지 않는다. 어제도 비었으면 None 이다.

    **창 끝까지 이어졌으면 None 이다.** 어디서 시작했는지 모르는데 시작일을 지어내면,
    창이 하루 밀릴 때마다 시작일도 밀려 화면이 매일 새 축하를 띄운다. 8주 넘게 이어 온
    사람은 그때까지 축하를 여덟 번 받았다.
    """
    window = streak_window(today)
    recorded = {
        tx.occurred_on
        for tx in transactions
        if not tx.is_deleted and window.contains(tx.occurred_on)
    }

    end = today if today in recorded else today - timedelta(days=1)
    if end not in recorded:
        return None

    day = end
    while day in recorded:
        day -= timedelta(days=1)
    if not window.contains(day):
        return None

    started_on = day + timedelta(days=1)
    return Streak(started_on=started_on, days=(end - started_on).days + 1)
