"""알림 설정 API 스키마.

화면이 다루는 것은 **켜기와 시각 둘**이다. 빈도를 고르는 자리는 화면에 없고, 켤 때
`daily` 를 함께 보낸다. 빈도를 응답에 싣는 이유는 발송기가 그 값을 보기 때문이고,
값 목록은 모델의 enum 을 그대로 쓴다(여기 다시 적지 않는다).

시각은 `"21:30"` 모양의 문자열이다. 초를 싣지 않는다. 화면의 시각 입력이 분까지만
받으므로, 초까지 실어 보내면 화면이 못 그리는 값이 응답에 남는다.
"""

from __future__ import annotations

from datetime import time

from pydantic import BaseModel, Field

from app.models.preference import NotificationFrequency

__all__ = [
    "HHMM_PATTERN",
    "NotificationSettingsOut",
    "NotificationSettingsPatch",
    "format_hhmm",
    "parse_hhmm",
]

# 24시간 표기 `HH:MM`. 화면의 <input type="time"> 이 내는 값과 같은 모양이다.
HHMM_PATTERN = r"^([01][0-9]|2[0-3]):[0-5][0-9]$"


def parse_hhmm(value: str) -> time:
    hour, minute = value.split(":")
    return time(int(hour), int(minute))


def format_hhmm(value: time | None) -> str | None:
    return None if value is None else value.strftime("%H:%M")


class NotificationSettingsOut(BaseModel):
    # 옵트인. 처음 온 사람은 꺼져 있다.
    is_enabled: bool
    # 매일 알림을 받을 시각. 안 정했으면 null 이다.
    remind_at: str | None = Field(default=None, pattern=HHMM_PATTERN)
    # 발송기가 보는 값. 화면에 고르는 자리는 없다.
    frequency: NotificationFrequency


class NotificationSettingsPatch(BaseModel):
    """보낸 필드만 고친다.

    **`remind_at` 은 필드를 빼는 것과 `null` 을 보내는 것이 다르다.** 빼면 그대로 두고,
    `null` 을 보내면 정해 둔 시각을 지운다. 시각은 '값 없음' 이 정상 상태인 유일한 값이라
    다른 설정(`/preferences`)과 규칙이 반대다.

    `is_enabled` 와 `frequency` 는 `null` 이 뜻을 갖지 않아 그대로 둔다. 기본값이 있는
    컬럼이라 비워 둘 자리가 없다.
    """

    is_enabled: bool | None = None
    remind_at: str | None = Field(default=None, pattern=HHMM_PATTERN)
    frequency: NotificationFrequency | None = None
