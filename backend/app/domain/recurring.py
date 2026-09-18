"""반복 지출이 '언제 나가나' 를 세는 규칙.

날짜 계산만 있고 DB 도 세션도 모른다. 달마다 며칠까지 있는지, 31일짜리를 어떻게
당길지, 언제부터 물어볼지가 전부 여기 있다.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta

__all__ = [
    "DEFAULT_LEAD_DAYS",
    "MAX_LEAD_DAYS",
    "due_date_in",
    "next_due_on",
    "remind_on",
    "should_ask",
]

# 며칠 전에 알릴까. 안 고르면 **당일**이다.
#
# 처음에는 전날 하나로 못 박았는데, 대부분은 빠져나간 그날 적는 것이 자연스럽다.
# 「전날 미리 옮겨 둘까」 를 하고 싶은 사람만 하루 앞으로 당긴다.
DEFAULT_LEAD_DAYS = 0

# 이틀 전부터 띄우면 카드가 이틀 내내 홈에 앉아 있다. 하루가 한계다.
MAX_LEAD_DAYS = 1


def due_date_in(year: int, month: int, day_of_month: int) -> date:
    """그 달에 실제로 나가는 날. 그 달에 없는 날짜는 마지막 날로 당긴다.

    31일에 걸어 둔 구독이 2월에 사라지면 안 된다. 그 달에 빠져나가는 것은 사실이다.
    """
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day_of_month, last))


def next_due_on(today: date, day_of_month: int) -> date:
    """오늘 이후로 가장 가까운 지출일. 오늘이 그날이면 오늘이다."""
    this_month = due_date_in(today.year, today.month, day_of_month)
    if this_month >= today:
        return this_month
    year = today.year + (1 if today.month == 12 else 0)
    month = 1 if today.month == 12 else today.month + 1
    return due_date_in(year, month, day_of_month)


def remind_on(due: date, lead_days: int) -> date:
    """그 회차를 알릴 날. 당일(0)이면 지출일 그날이다."""
    return due - timedelta(days=_clamp_lead(lead_days))


def should_ask(
    today: date,
    day_of_month: int,
    *,
    lead_days: int = DEFAULT_LEAD_DAYS,
    last_recorded_on: date | None,
    dismissed_on: date | None,
) -> date | None:
    """오늘 물어볼 지출일. 물어볼 것이 없으면 None.

    `lead_days` 는 그 예고가 정한 값이다. 당일(0)이면 그날 하루만, 전날(1)이면 이틀 묻는다.
    그날이 지나면 안 적기로 한 것이고, 그때도 조르면 이 앱이 구독 관리 앱이 된다.

    이미 적었거나 「이번 달은 됐어요」 를 누른 회차는 건너뛴다. 판정 기준은 **그 회차의
    지출일**이다. 날짜를 그대로 비교하면 매달 같은 일을 다시 겪는다.
    """
    due = next_due_on(today, day_of_month)
    if (due - today).days > _clamp_lead(lead_days):
        return None
    if last_recorded_on is not None and _same_cycle(last_recorded_on, due, day_of_month):
        return None
    if dismissed_on is not None and _same_cycle(dismissed_on, due, day_of_month):
        return None
    return due


def _same_cycle(marked_on: date, due: date, day_of_month: int) -> bool:
    """그 표시가 이번 회차의 것인가.

    전날에 적었으면 표시 날짜가 지출일보다 하루 빠르다. 그래서 '같은 달' 로 세지 않고,
    표시한 날 기준으로 다음 지출일을 다시 세어 이번 것과 같은지 본다.
    """
    return next_due_on(marked_on, day_of_month) == due


def _clamp_lead(lead_days: int) -> int:
    """옛 행이나 잘못된 값이 들어와도 화면이 흔들리지 않게 범위 안으로 민다."""
    return max(0, min(MAX_LEAD_DAYS, lead_days))
