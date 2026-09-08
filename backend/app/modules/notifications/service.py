"""알림 설정 조회·수정과 발송 대상 고르기.

설정 행은 없을 수도 있다. 첫 기록 전에 아무것도 묻지 않으니 조회가 기본값으로 만들어 준다
(`settings/service.py` 와 같은 모양이다). 화면이 404 를 만나지 않는다.

**시간대 정본은 `users.timezone` 이다.** `notification_settings.timezone` 컬럼은 초기
스키마에 있지만 읽지 않는다. 두 곳을 보면 달 경계와 알림 시각이 서로 다른 시간대로 갈린다.

**`notification_settings.frequency` 도 읽지 않는다.** 알림은 하루 한 번으로 못 박혀 있고
(ADR-0013), 컬럼은 초기 스키마에 남아 응답에만 실린다.

보낼 때인지 판정하는 산식은 `app.domain.reminders` 에 있다. 여기서 다시 쓰지 않는다.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, time

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain import reminders
from app.integrations.notifications import ReminderSender, ReminderTarget
from app.models import NotificationSetting, User
from app.modules import ledger
from app.modules.notifications.schemas import parse_hhmm

logger = logging.getLogger(__name__)

__all__ = [
    "DEFAULT_REMIND_AT",
    "DueReminder",
    "due_reminders",
    "get_notification_settings",
    "send_due_reminders",
    "update_notification_settings",
]

# 켜기만 하고 시각을 안 고른 사람에게 넣어 주는 값. 저녁에 하루를 정리하는 시간대다.
DEFAULT_REMIND_AT = time(21, 30)


@dataclass(frozen=True, slots=True)
class DueReminder:
    """지금 보낼 차례인 한 건. 보내고 나면 그 행에 보낸 날을 남긴다."""

    setting: NotificationSetting
    target: ReminderTarget


def _find(session: Session, user: User) -> NotificationSetting | None:
    return session.scalar(select(NotificationSetting).where(NotificationSetting.user_id == user.id))


def get_notification_settings(session: Session, user: User) -> NotificationSetting:
    """설정 행이 없으면 기본값(꺼짐)으로 만들어 준다."""
    row = _find(session, user)
    if row is not None:
        return row

    row = NotificationSetting(user_id=user.id)
    session.add(row)
    try:
        session.commit()
    except IntegrityError:
        # 화면이 설정과 알림을 동시에 부르면 같은 행을 둘이 만들려 한다. 이긴 행을 쓴다.
        session.rollback()
        existing = _find(session, user)
        if existing is None:
            raise
        return existing
    session.refresh(row)
    return row


def update_notification_settings(session: Session, user: User, data: dict) -> NotificationSetting:
    """보낸 필드만 고친다. `remind_at` 만 `null` 이 '지움' 이라는 뜻이다.

    켜면서 시각을 안 줬고 정해 둔 시각도 없으면 기본값을 넣는다. 켜 두고 시각이 비면
    영영 안 가는 알림이 되고, 화면에는 켜져 있다고 보인다.
    """
    row = get_notification_settings(session, user)

    if data.get("is_enabled") is not None:
        row.is_enabled = data["is_enabled"]
    if data.get("frequency") is not None:
        row.frequency = data["frequency"]
    if "remind_at" in data:
        raw = data["remind_at"]
        row.remind_at = None if raw is None else parse_hhmm(raw)

    if row.is_enabled and row.remind_at is None:
        row.remind_at = DEFAULT_REMIND_AT

    session.commit()
    session.refresh(row)
    return row


def due_reminders(session: Session, now_utc: datetime) -> list[DueReminder]:
    """지금 보낼 차례인 사람들. 켜 둔 사람만 SQL 로 먼저 거른다.

    시각·날짜 판정은 사용자 시간대에 걸려 있어 SQL 로 좁힐 수 없다. 켜 둔 사람 수만큼만
    파이썬이 본다.

    빈도(`frequency`)는 보지 않는다. 하루 한 번 고정이라 볼 것이 없다.
    """
    rows = session.execute(
        select(NotificationSetting, User)
        .join(User, User.id == NotificationSetting.user_id)
        .where(NotificationSetting.is_enabled.is_(True), NotificationSetting.remind_at.is_not(None))
    ).all()

    due: list[DueReminder] = []
    for setting, user in rows:
        remind_at = setting.remind_at
        if remind_at is None:
            continue
        tz = ledger.user_tz(user)
        if not reminders.is_due(
            now_utc=now_utc,
            tz=tz,
            remind_at=remind_at,
            last_reminded_on=setting.last_reminded_on,
        ):
            continue
        due.append(
            DueReminder(
                setting=setting,
                target=ReminderTarget(
                    user_id=user.id,
                    local_date=reminders.local_today(now_utc, tz),
                    remind_at=remind_at,
                ),
            )
        )
    return due


def send_due_reminders(session: Session, sender: ReminderSender, now_utc: datetime) -> int:
    """보낼 차례인 사람에게 보내고 보낸 날을 남긴다. 실제로 보낸 수를 돌려준다.

    한 사람에게 실패해도 멈추지 않는다. 실패한 사람은 보낸 날을 남기지 않으므로 다음 분에
    같은 시각이 아니면 그 날은 건너뛴다. 놓친 알림을 나중에 몰아 보내지 않는 쪽을 골랐다.
    """
    sent = 0
    for item in due_reminders(session, now_utc):
        try:
            sender.send(item.target)
        except Exception:
            logger.exception(
                "기록 알림을 보내지 못했다", extra={"user_id": str(item.target.user_id)}
            )
            continue
        item.setting.last_reminded_on = item.target.local_date
        sent += 1

    if sent:
        session.commit()
    return sent
