"""알림 설정과 발송 배관.

화면이 다루는 것은 켜기와 시각 둘이다. 켜 두고 시각이 비어 있으면 영영 안 가는 알림이
되므로 서버가 기본값을 넣어 준다. 그리고 켜 둔 것만으로는 아무 일도 일어나지 않으니,
실제로 보낼 차례를 골라 보내고 보낸 날을 남기는 데까지 왕복시켜 본다.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, time

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.notifications import ReminderTarget
from app.models import NotificationSetting, User
from app.modules.notifications import service

AUTH = {"X-Anon-Key": "test-anon-key"}
SETTINGS = "/api/v1/notifications/settings"

# 2026-09-08 21:30 KST. 아래 테스트가 켜는 시각과 같은 분이다.
NOW = datetime(2026, 9, 8, 12, 30, tzinfo=UTC)


class _RecordingSender:
    """보낸 것을 모아 두는 발송기. 실제 발송 경로 대신 이것을 넘긴다."""

    def __init__(self) -> None:
        self.sent: list[ReminderTarget] = []

    @property
    def is_stub(self) -> bool:
        return True

    def send(self, target: ReminderTarget) -> None:
        self.sent.append(target)


class _FailingSender:
    @property
    def is_stub(self) -> bool:
        return True

    def send(self, target: ReminderTarget) -> None:
        raise RuntimeError("발송 실패")


def _setting(db: Session) -> NotificationSetting:
    row = db.scalar(select(NotificationSetting))
    assert row is not None
    return row


def _user(db: Session, anon: str, timezone: str) -> User:
    user = User(anon_key_hash=anon, timezone=timezone)
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(NotificationSetting(user_id=user.id, is_enabled=True, remind_at=time(21, 30)))
    db.commit()
    return user


def test_처음_열면_꺼져_있다(client: TestClient) -> None:
    """진입 즉시 동의를 묻지 않는다. 옵트인이라 기본은 꺼짐이고 시각도 없다."""
    res = client.get(SETTINGS, headers=AUTH)

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["is_enabled"] is False
    assert body["remind_at"] is None


def test_시각을_안_주고_켜면_기본_시각이_들어간다(client: TestClient) -> None:
    """켜 두고 시각이 비면 영영 안 가는 알림이 되는데 화면에는 켜져 있다고 보인다."""
    res = client.patch(SETTINGS, json={"is_enabled": True, "frequency": "daily"}, headers=AUTH)

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["is_enabled"] is True
    assert body["remind_at"] == "21:30"
    assert body["frequency"] == "daily"


def test_고친_시각이_다시_열어도_남아_있다(client: TestClient) -> None:
    client.patch(SETTINGS, json={"is_enabled": True, "frequency": "daily"}, headers=AUTH)

    patched = client.patch(SETTINGS, json={"remind_at": "22:00"}, headers=AUTH)
    assert patched.status_code == 200, patched.text
    assert patched.json()["remind_at"] == "22:00"

    again = client.get(SETTINGS, headers=AUTH)
    assert again.json()["remind_at"] == "22:00"
    assert again.json()["is_enabled"] is True


def test_시각을_안_보내면_그대로_두고_null_을_보내면_지운다(client: TestClient) -> None:
    """`/preferences` 와 규칙이 반대다. 시각은 '값 없음' 이 정상 상태인 유일한 값이다."""
    client.patch(SETTINGS, json={"is_enabled": True, "remind_at": "07:05"}, headers=AUTH)

    kept = client.patch(SETTINGS, json={"frequency": "daily"}, headers=AUTH)
    assert kept.json()["remind_at"] == "07:05"

    # 꺼 두고 시각을 지운다. 켜진 채로 지우면 서버가 기본값을 다시 넣는다.
    cleared = client.patch(SETTINGS, json={"is_enabled": False, "remind_at": None}, headers=AUTH)
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["remind_at"] is None


def test_시각_형식이_틀리면_막는다(client: TestClient) -> None:
    """화면의 시각 입력이 내는 모양만 받는다. 초가 붙은 값도 받지 않는다."""
    res = client.patch(SETTINGS, json={"remind_at": "9:5"}, headers=AUTH)

    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == "INVALID_REQUEST"


def test_켜_둔_사람에게_보내고_보낸_날을_남긴다(client: TestClient, db: Session) -> None:
    """설정만으로는 아무 일도 안 일어난다. 고르고 보내고 남기는 데까지 실제로 돈다."""
    client.patch(
        SETTINGS,
        json={"is_enabled": True, "remind_at": "21:30", "frequency": "daily"},
        headers=AUTH,
    )
    sender = _RecordingSender()

    sent = service.send_due_reminders(db, sender, NOW)

    assert sent == 1
    assert len(sender.sent) == 1
    assert sender.sent[0].remind_at == time(21, 30)
    db.expire_all()
    assert _setting(db).last_reminded_on == sender.sent[0].local_date


def test_같은_분에_다시_돌려도_두_번_보내지_않는다(client: TestClient, db: Session) -> None:
    """발송기가 1분마다 도는데 재시도가 겹치면 알림이 두 번 간다."""
    client.patch(
        SETTINGS,
        json={"is_enabled": True, "remind_at": "21:30", "frequency": "daily"},
        headers=AUTH,
    )
    service.send_due_reminders(db, _RecordingSender(), NOW)
    db.expire_all()

    again = _RecordingSender()
    assert service.send_due_reminders(db, again, NOW) == 0
    assert again.sent == []


def test_꺼_둔_사람에게는_보내지_않는다(client: TestClient, db: Session) -> None:
    client.patch(SETTINGS, json={"is_enabled": True, "remind_at": "21:30"}, headers=AUTH)
    client.patch(SETTINGS, json={"is_enabled": False}, headers=AUTH)
    db.expire_all()

    sender = _RecordingSender()
    assert service.send_due_reminders(db, sender, NOW) == 0
    assert sender.sent == []


def test_보내기가_실패하면_보낸_날을_남기지_않는다(client: TestClient, db: Session) -> None:
    """남겨 버리면 그 날은 영영 못 보낸다. 실패는 실패인 채로 둔다."""
    client.patch(SETTINGS, json={"is_enabled": True, "remind_at": "21:30"}, headers=AUTH)

    assert service.send_due_reminders(db, _FailingSender(), NOW) == 0
    db.expire_all()
    assert _setting(db).last_reminded_on is None


def test_시간대가_다르면_보낼_때도_다르다(db: Session) -> None:
    """21:30 은 그 사람이 사는 곳의 21:30 이다. 한 사람만 대상이 된다."""
    seoul = _user(db, f"seoul-{uuid.uuid4().hex}", "Asia/Seoul")
    _user(db, f"ny-{uuid.uuid4().hex}", "America/New_York")

    sender = _RecordingSender()
    assert service.send_due_reminders(db, sender, NOW) == 1
    assert [target.user_id for target in sender.sent] == [seoul.id]
