"""알림 발송 포트.

앱 코드는 이 프로토콜만 안다. 실제로 무엇이 알림을 쏘는지는 이 패키지 밖으로 새지 않는다.

구현은 둘이다. 로그로만 남기는 `LogReminderSender`(템플릿 코드가 없을 때)와 토스
스마트발송을 부르는 `TossSmartMessageSender`. 어느 쪽이 붙었는지는 `is_stub` 으로 안다.

**보내기는 async 다.** 실제 발송이 mTLS HTTP 호출이라 그렇다.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, time
from typing import Protocol, runtime_checkable

__all__ = ["ReminderSender", "ReminderTarget"]


@dataclass(frozen=True, slots=True)
class ReminderTarget:
    """알림 한 통이 갈 곳.

    금액도 기록 내용도 담지 않는다. 알림은 "적으러 오라" 는 말 하나이고, 잠금 화면에
    돈 이야기가 뜨는 것을 원하지 않는 사람이 있다.
    """

    user_id: uuid.UUID
    #: 그 사람이 사는 곳의 날짜. 같은 날 두 번 보내지 않는 기준이다.
    local_date: date
    #: 그 사람이 정해 둔 시각.
    remind_at: time
    #: 토스에 "누구에게" 를 말하는 값. repr 에서 빼 로그에 원문이 안 남게 한다.
    push_anon_key: str = field(repr=False, default="")


@runtime_checkable
class ReminderSender(Protocol):
    """알림 한 통을 보낸다. 실패하면 예외를 올린다.

    한 사람에게 실패해도 나머지 사람은 계속 간다. 그 판단은 부르는 쪽이 한다.
    """

    @property
    def is_stub(self) -> bool: ...

    async def send(self, target: ReminderTarget) -> None: ...
