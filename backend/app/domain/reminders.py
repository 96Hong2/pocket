"""알림을 지금 보낼 때인지 판정한다.

발송기는 1분마다 깨어나 "이 사람에게 지금 보낼 때인가" 를 묻는다. 그 판정이 여기 있다.
DB 도 모델도 모르는 순수 함수라, 시간대·자정 경계·같은 날 중복을 테스트로 못 박을 수 있다.

**시간대는 사용자 것으로 본다.** UTC 로 시각을 견주면 한국에서 밤 9시 30분에 받기로 한
알림이 낮에 간다.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

__all__ = ["is_due", "local_today"]


def local_today(now_utc: datetime, tz: ZoneInfo) -> date:
    """그 사람이 사는 곳의 오늘. 보낸 날을 남길 때도 이 날짜를 쓴다."""
    return _as_utc(now_utc).astimezone(tz).date()


def is_due(
    *,
    now_utc: datetime,
    tz: ZoneInfo,
    remind_at: time | None,
    last_reminded_on: date | None,
) -> bool:
    """정한 시각과 같은 분이고 오늘 아직 안 보냈으면 True.

    시각을 안 정했으면 보낼 때를 알 수 없으므로 False 다. 켜져 있는지는 여기서 보지 않는다.
    그건 조회 조건이라 SQL 이 먼저 거른다.

    **분이 정확히 같아야 한다.** 발송기가 1분마다 도는 것을 전제로 한 판정이라,
    지난 시각을 나중에 몰아 보내지 않는다. 늦게 온 알림은 '지금 적으라' 는 말이 아니게 된다.
    """
    if remind_at is None:
        return False

    local_now = _as_utc(now_utc).astimezone(tz)
    if (local_now.hour, local_now.minute) != (remind_at.hour, remind_at.minute):
        return False

    return last_reminded_on != local_now.date()


def _as_utc(value: datetime) -> datetime:
    """시간대 없는 값이 들어오면 UTC 로 본다. 발송기는 UTC 로 지금을 잰다."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value
