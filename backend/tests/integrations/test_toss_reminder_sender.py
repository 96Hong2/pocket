"""토스 스마트발송 어댑터. 실제 네트워크 없이 MockTransport 로만 검증한다.

여기서 지키려는 것 셋이다. 올바른 자리에 올바른 값을 싣는가, 안 간 것을 갔다고 하지
않는가, 그리고 **실패했을 때 다시 부르지 않는가**. 마지막이 가장 중요하다. 알림은 못 간
것보다 두 번 울리는 쪽이 나쁘다.
"""

from __future__ import annotations

import json
import uuid
from datetime import date, time

import httpx
import pytest

from app.integrations.apps_in_toss.client import TossBusinessError, TossTransientError
from app.integrations.notifications import ReminderTarget
from app.integrations.notifications.toss_sender import (
    ReminderNotDelivered,
    TossSmartMessageSender,
)

pytestmark = pytest.mark.asyncio

TARGET = ReminderTarget(
    user_id=uuid.UUID("00000000-0000-4000-8000-000000000001"),
    local_date=date(2026, 9, 10),
    remind_at=time(21, 30),
    push_anon_key="anon-abc",
)


def _sent(count: int = 1) -> dict:
    return {
        "resultType": "SUCCESS",
        "success": {"msgCount": count, "sentPushCount": count, "sentInboxCount": 0},
    }


async def test_템플릿_코드와_익명키를_실어_보낸다(make_client) -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=_sent())

    async with make_client(handler) as client:
        await TossSmartMessageSender(client, template_set_code="pocket-remind").send(TARGET)

    assert len(seen) == 1
    request = seen[0]
    assert request.url.path == "/api-partner/v1/apps-in-toss/messenger/send-message"
    assert request.headers["x-anon-key"] == "anon-abc"
    assert json.loads(request.content) == {"templateSetCode": "pocket-remind", "context": {}}


async def test_한_통도_안_갔으면_실패다(make_client) -> None:
    """봉투는 SUCCESS 여도 동의를 안 한 사람이면 0통이다. 보낸 날을 남기면 안 된다."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "resultType": "SUCCESS",
                "success": {
                    "msgCount": 0,
                    "sentPushCount": 0,
                    "sentInboxCount": 0,
                    "fail": {"sentPush": [{"reachedFailReason": "알림 미동의"}]},
                },
            },
        )

    async with make_client(handler) as client:
        sender = TossSmartMessageSender(client, template_set_code="pocket-remind")
        with pytest.raises(ReminderNotDelivered) as caught:
            await sender.send(TARGET)

    assert "알림 미동의" in str(caught.value)


async def test_검수를_안_받은_템플릿은_실패로_올린다(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"resultType": "FAIL", "error": {"errorCode": "5004", "reason": "미승인 템플릿"}},
        )

    async with make_client(handler) as client:
        sender = TossSmartMessageSender(client, template_set_code="pocket-remind")
        with pytest.raises(TossBusinessError) as caught:
            await sender.send(TARGET)

    assert caught.value.error_code == "5004"


async def test_실패해도_다시_부르지_않는다(make_client) -> None:
    """응답이 없어도 알림은 이미 갔을 수 있다. 한 번 더 부르면 두 번 울린다."""
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(500, text="oops")

    async with make_client(handler) as client:
        sender = TossSmartMessageSender(client, template_set_code="pocket-remind")
        with pytest.raises(TossTransientError):
            await sender.send(TARGET)

    assert len(calls) == 1


async def test_익명키가_없으면_부르지도_않는다(make_client) -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json=_sent())

    async with make_client(handler) as client:
        sender = TossSmartMessageSender(client, template_set_code="pocket-remind")
        with pytest.raises(ReminderNotDelivered):
            await sender.send(
                ReminderTarget(
                    user_id=TARGET.user_id,
                    local_date=TARGET.local_date,
                    remind_at=TARGET.remind_at,
                    push_anon_key="",
                )
            )

    assert calls == []


async def test_템플릿_코드가_비면_만들_수_없다(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_sent())

    with pytest.raises(ValueError):
        TossSmartMessageSender(make_client(handler), template_set_code="   ")
