"""토스 스마트발송으로 기록 알림을 보낸다.

파트너 서버에서 앱인토스 서버로 부르는 서버 간 호출이다. 인증은 익명키 검증과 같은
mTLS 클라이언트 인증서를 쓴다. 보낼 사람은 헤더 `x-anon-key` 로 말한다.

**다시 부르지 않는다.** 응답 시간이 초과돼도 알림은 이미 갔을 수 있다. 한 번 더 부르면
같은 사람에게 두 번 울린다. 못 보낸 것보다 두 번 울리는 쪽이 나쁘다.

**보냈다고 세어 주기 전에 실제로 몇 통 갔는지 본다.** 봉투가 SUCCESS 여도 동의를 안 한
사람이면 0통이다. 0통을 성공으로 치면 보낸 날이 남아 그날은 다시 시도하지 않는다.
"""

from __future__ import annotations

import logging
from typing import Any

from app.integrations.apps_in_toss.client import TossApiClient, TossBusinessError
from app.integrations.notifications.port import ReminderTarget

logger = logging.getLogger(__name__)

__all__ = ["SEND_MESSAGE_PATH", "ReminderNotDelivered", "TossSmartMessageSender"]

SEND_MESSAGE_PATH = "/api-partner/v1/apps-in-toss/messenger/send-message"
ANON_KEY_HEADER = "x-anon-key"

# 검수를 안 받은 템플릿. 설정 문제라 매번 같은 실패가 난다.
ERROR_CODE_TEMPLATE_NOT_APPROVED = "5004"


class ReminderNotDelivered(Exception):
    """호출은 됐는데 실제로 간 알림이 없다."""


class TossSmartMessageSender:
    """콘솔에 등록한 기능성 템플릿 하나로 기록 알림을 보낸다."""

    def __init__(self, client: TossApiClient, *, template_set_code: str) -> None:
        code = template_set_code.strip()
        if not code:
            raise ValueError("스마트발송 템플릿 코드가 비어 있다")
        self._client = client
        self._template_set_code = code

    @property
    def is_stub(self) -> bool:
        return False

    async def send(self, target: ReminderTarget) -> None:
        if not target.push_anon_key:
            raise ReminderNotDelivered("보낼 사람의 익명키가 없다")

        try:
            success = await self._client.post(
                SEND_MESSAGE_PATH,
                headers={ANON_KEY_HEADER: target.push_anon_key},
                # 문구에 끼워 넣을 값이 없다. 알림은 "적으러 오라" 한 마디다.
                json={"templateSetCode": self._template_set_code, "context": {}},
            )
        except TossBusinessError as error:
            if error.error_code == ERROR_CODE_TEMPLATE_NOT_APPROVED:
                # 사람이 콘솔에서 검수를 받아야 풀린다. 한 사람의 문제가 아니라 전부 막힌다.
                logger.error(
                    "스마트발송 템플릿이 검수를 통과하지 않았다. 콘솔에서 승인을 받아야 한다",
                    extra={"template_set_code": self._template_set_code},
                )
            raise

        delivered = _delivered_count(success)
        if delivered == 0:
            raise ReminderNotDelivered(f"보낸 통수가 0 이다 reason={_fail_reason(success)}")


def _delivered_count(success: Any) -> int:
    """실제로 나간 통수. 푸시가 아니라 인박스로 갔어도 간 것으로 본다."""
    if not isinstance(success, dict):
        return 0
    counted = 0
    for field in ("sentPushCount", "sentInboxCount"):
        value = success.get(field)
        if isinstance(value, int):
            counted += value
    return counted


def _fail_reason(success: Any) -> str:
    """왜 0통인지. 토스가 알려 준 사유가 있으면 그것을 쓴다."""
    if not isinstance(success, dict):
        return "응답 모양이 다르다"
    fail = success.get("fail")
    entries = fail.get("sentPush") if isinstance(fail, dict) else None
    for entry in entries if isinstance(entries, list) else []:
        if isinstance(entry, dict) and entry.get("reachedFailReason"):
            return str(entry["reachedFailReason"])[:120]
    return "사유 없음(대개 알림 동의를 안 한 사람이다)"
