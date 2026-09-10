"""기록 알림을 토스 스마트발송으로 보내는 어댑터.

**부르는 방법은 여기 없다.** 경로·헤더·응답 모양은 `integrations/apps_in_toss/smart_message`
가 안다(AI 개발 규칙 §3). 여기는 알림 도메인의 말을 그쪽 말로 옮기고, 그 결과를 보고
"보냈다고 쳐도 되는가" 만 판정한다.

**보냈다고 세어 주기 전에 실제로 몇 통 갔는지 본다.** 봉투가 SUCCESS 여도 동의를 안 한
사람이면 0통이다. 0통을 성공으로 치면 보낸 날이 남아 그날은 다시 시도하지 않는다.
**모르는 응답 모양은 0통이 아니라 보낸 것으로 본다.** 아직 실물을 못 봐서, 모른다는 이유로
정상 발송을 매번 실패로 기록하면 진짜 장애와 구분이 안 된다.
"""

from __future__ import annotations

import logging

from app.integrations.apps_in_toss.client import TossApiClient, TossBusinessError
from app.integrations.apps_in_toss.smart_message import (
    ERROR_CODE_TEMPLATE_NOT_APPROVED,
    send_smart_message,
)
from app.integrations.notifications.port import ReminderTarget

logger = logging.getLogger(__name__)

__all__ = ["ReminderNotDelivered", "TossSmartMessageSender"]


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
            result = await send_smart_message(
                self._client,
                anon_key=target.push_anon_key,
                template_set_code=self._template_set_code,
            )
        except TossBusinessError as error:
            if error.error_code == ERROR_CODE_TEMPLATE_NOT_APPROVED:
                # 사람이 콘솔에서 검수를 받아야 풀린다. 한 사람의 문제가 아니라 전부 막힌다.
                logger.error(
                    "스마트발송 템플릿이 검수를 통과하지 않았다. 콘솔에서 승인을 받아야 한다",
                    extra={"template_set_code": self._template_set_code},
                )
            raise

        if result.is_known_empty:
            reason = result.reason or "사유 없음(대개 알림 동의를 안 한 사람이다)"
            raise ReminderNotDelivered(f"보낸 통수가 0 이다 reason={reason}")
