"""알림을 지금 보낼 때인지 판정하는 규칙.

발송기는 1분마다 돈다. 이 판정이 틀리면 알림이 엉뚱한 시각에 가거나, 하루에 두 번 간다.
셋을 본다: 시간대를 사용자 것으로 보는가 · 정한 분에만 보내는가 · 같은 날 두 번 안 보내는가.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

from app.domain.reminders import is_due, local_today

SEOUL = ZoneInfo("Asia/Seoul")
NEW_YORK = ZoneInfo("America/New_York")


def test_시간대는_사용자_것으로_본다() -> None:
    """21:30 은 서울의 21:30 이다. UTC 로 견주면 한국 사람이 낮에 알림을 받는다."""
    # 2026-09-08 21:30 KST = 12:30 UTC
    now = datetime(2026, 9, 8, 12, 30, tzinfo=UTC)

    assert is_due(now_utc=now, tz=SEOUL, remind_at=time(21, 30), last_reminded_on=None) is True
    # 같은 순간이 뉴욕에서는 오전 8시 30분이라 아직 때가 아니다.
    assert is_due(now_utc=now, tz=NEW_YORK, remind_at=time(21, 30), last_reminded_on=None) is False


def test_정한_분에만_보낸다() -> None:
    """1분 이르거나 늦으면 보내지 않는다. 지난 시각을 나중에 몰아 보내지 않는다."""
    remind_at = time(21, 30)

    early = datetime(2026, 9, 8, 12, 29, tzinfo=UTC)
    late = datetime(2026, 9, 8, 12, 31, tzinfo=UTC)

    assert is_due(now_utc=early, tz=SEOUL, remind_at=remind_at, last_reminded_on=None) is False
    assert is_due(now_utc=late, tz=SEOUL, remind_at=remind_at, last_reminded_on=None) is False


def test_같은_날_두_번_보내지_않는다() -> None:
    """발송기가 한 분에 두 번 깨어나도 알림은 하루 한 번이다."""
    now = datetime(2026, 9, 8, 12, 30, tzinfo=UTC)
    today = local_today(now, SEOUL)

    assert today == date(2026, 9, 8)
    assert is_due(now_utc=now, tz=SEOUL, remind_at=time(21, 30), last_reminded_on=today) is False
    # 어제 보낸 것은 오늘을 막지 않는다.
    assert (
        is_due(
            now_utc=now,
            tz=SEOUL,
            remind_at=time(21, 30),
            last_reminded_on=date(2026, 9, 7),
        )
        is True
    )


def test_시각을_안_정했으면_보낼_때를_알_수_없다() -> None:
    now = datetime(2026, 9, 8, 12, 30, tzinfo=UTC)

    assert is_due(now_utc=now, tz=SEOUL, remind_at=None, last_reminded_on=None) is False
