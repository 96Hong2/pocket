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

    async def send(self, target: ReminderTarget) -> None:
        self.sent.append(target)


class _FailingSender:
    @property
    def is_stub(self) -> bool:
        return True

    async def send(self, target: ReminderTarget) -> None:
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
    db.add(
        NotificationSetting(
            user_id=user.id,
            is_enabled=True,
            remind_at=time(21, 30),
            push_anon_key=anon,
        )
    )
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


async def test_켜_둔_사람에게_보내고_보낸_날을_남긴다(client: TestClient, db: Session) -> None:
    """설정만으로는 아무 일도 안 일어난다. 고르고 보내고 남기는 데까지 실제로 돈다."""
    client.patch(
        SETTINGS,
        json={"is_enabled": True, "remind_at": "21:30", "frequency": "daily"},
        headers=AUTH,
    )
    sender = _RecordingSender()

    sent = await service.send_due_reminders(db, sender, NOW)

    assert sent == 1
    assert len(sender.sent) == 1
    assert sender.sent[0].remind_at == time(21, 30)
    db.expire_all()
    assert _setting(db).last_reminded_on == sender.sent[0].local_date


async def test_같은_분에_다시_돌려도_두_번_보내지_않는다(client: TestClient, db: Session) -> None:
    """발송기가 1분마다 도는데 재시도가 겹치면 알림이 두 번 간다."""
    client.patch(
        SETTINGS,
        json={"is_enabled": True, "remind_at": "21:30", "frequency": "daily"},
        headers=AUTH,
    )
    await service.send_due_reminders(db, _RecordingSender(), NOW)
    db.expire_all()

    again = _RecordingSender()
    assert await service.send_due_reminders(db, again, NOW) == 0
    assert again.sent == []


async def test_꺼_둔_사람에게는_보내지_않는다(client: TestClient, db: Session) -> None:
    client.patch(SETTINGS, json={"is_enabled": True, "remind_at": "21:30"}, headers=AUTH)
    client.patch(SETTINGS, json={"is_enabled": False}, headers=AUTH)
    db.expire_all()

    sender = _RecordingSender()
    assert await service.send_due_reminders(db, sender, NOW) == 0
    assert sender.sent == []


async def test_보내기가_실패하면_보낸_날을_남기지_않는다(client: TestClient, db: Session) -> None:
    """남겨 버리면 그 날은 영영 못 보낸다. 실패는 실패인 채로 둔다."""
    client.patch(SETTINGS, json={"is_enabled": True, "remind_at": "21:30"}, headers=AUTH)

    assert await service.send_due_reminders(db, _FailingSender(), NOW) == 0
    db.expire_all()
    assert _setting(db).last_reminded_on is None


async def test_시간대가_다르면_보낼_때도_다르다(db: Session) -> None:
    """21:30 은 그 사람이 사는 곳의 21:30 이다. 한 사람만 대상이 된다."""
    seoul = _user(db, f"seoul-{uuid.uuid4().hex}", "Asia/Seoul")
    _user(db, f"ny-{uuid.uuid4().hex}", "America/New_York")

    sender = _RecordingSender()
    assert await service.send_due_reminders(db, sender, NOW) == 1
    assert [target.user_id for target in sender.sent] == [seoul.id]


async def test_켤_때_익명키를_보관하고_끄면_지운다(client: TestClient, db: Session) -> None:
    """발송기가 토스에 '누구에게' 를 말할 값은 이것뿐이다. users 쪽은 sha256 이라 못 되돌린다.

    그래서 켜져 있는 동안만 들고 있는다. 끄면 그 자리에서 지워야, 알림을 안 쓰는 사람의
    익명키가 우리 DB 에 남지 않는다.
    """
    client.patch(SETTINGS, json={"is_enabled": True, "remind_at": "21:30"}, headers=AUTH)
    db.expire_all()
    assert _setting(db).push_anon_key == "test-anon-key"

    client.patch(SETTINGS, json={"is_enabled": False}, headers=AUTH)
    db.expire_all()
    assert _setting(db).push_anon_key is None


async def test_익명키가_없으면_보낼_대상으로_고르지_않는다(client: TestClient, db: Session) -> None:
    """익명키를 남기기 전에 켜 둔 사람이 있다. 보낼 곳을 모르면서 보낸 날을 남기면 안 된다."""
    client.patch(SETTINGS, json={"is_enabled": True, "remind_at": "21:30"}, headers=AUTH)
    db.expire_all()
    _setting(db).push_anon_key = None
    db.commit()

    sender = _RecordingSender()
    assert await service.send_due_reminders(db, sender, NOW) == 0
    assert sender.sent == []
    db.expire_all()
    assert _setting(db).last_reminded_on is None


async def test_설정을_열어보기만_해도_익명키가_채워진다(client: TestClient, db: Session) -> None:
    """이 컬럼이 생기기 전에 켜 둔 사람이 있다. 그 사람들은 화면에는 켜져 있는데
    발송 대상에서 빠지고, 설정을 다시 만지지 않는 한 영영 알림을 못 받는다.
    조회만으로 되살아나야 한다."""
    client.patch(SETTINGS, json={"is_enabled": True, "remind_at": "21:30"}, headers=AUTH)
    db.expire_all()
    _setting(db).push_anon_key = None
    db.commit()

    client.get(SETTINGS, headers=AUTH)

    db.expire_all()
    assert _setting(db).push_anon_key == "test-anon-key"


async def test_꺼_둔_사람은_조회해도_익명키가_안_생긴다(client: TestClient, db: Session) -> None:
    """안 쓰는 사람 것을 들고 있을 이유가 없다."""
    client.get(SETTINGS, headers=AUTH)

    db.expire_all()
    assert _setting(db).push_anon_key is None


async def test_보내다_중간에_죽어도_이미_보낸_표시는_남는다(
    client: TestClient, db: Session
) -> None:
    """묶어서 마지막에 한 번 커밋하면, 죽는 순간 이미 나간 알림이 전부 '안 보낸 것' 이 된다.
    Cloud Run 이 태스크를 다시 돌리면 같은 분이라 그 사람들에게 두 번 울린다."""
    first = _user(db, f"a-{uuid.uuid4().hex}", "Asia/Seoul")
    _user(db, f"b-{uuid.uuid4().hex}", "Asia/Seoul")

    class _DiesOnSecond:
        def __init__(self) -> None:
            self.sent = 0

        @property
        def is_stub(self) -> bool:
            return True

        async def send(self, target: ReminderTarget) -> None:
            self.sent += 1
            if self.sent == 2:
                raise RuntimeError("여기서 죽는다")

    assert await service.send_due_reminders(db, _DiesOnSecond(), NOW) == 1

    db.expire_all()
    rows = {row.user_id: row.last_reminded_on for row in db.scalars(select(NotificationSetting))}
    # 첫 사람은 실제로 받았다. 표시가 남아야 다시 안 간다.
    assert rows[first.id] is not None
    # 두 번째는 못 받았으니 표시가 없다.
    assert sum(1 for value in rows.values() if value is None) == 1
