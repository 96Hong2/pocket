"""토스 스마트발송 호출.

토스 서버 API 를 부르는 코드는 전부 이 패키지 안에 있다(AI 개발 규칙 §3). 무엇을 보낼지는
부르는 쪽이 정하고, **어떻게 부르는지는 여기만 안다.** 헤더 이름도 익명키 검증과 같은 것을
쓴다. 사본을 두면 토스가 이름을 바꿀 때 한쪽만 고치고 다른 쪽은 조용히 인증에 실패한다.

**다시 부르지 않는다.** 응답이 없어도 알림은 이미 갔을 수 있다. `idempotent` 를 명시적으로
False 로 넘기는 이유가 그것이다. 기본값에 기대면 공통 클라이언트가 바뀌는 순간 같이 바뀐다.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.integrations.apps_in_toss.anon_key import ANON_KEY_HEADER
from app.integrations.apps_in_toss.client import TossApiClient

logger = logging.getLogger(__name__)

__all__ = [
    "ERROR_CODE_TEMPLATE_NOT_APPROVED",
    "SEND_MESSAGE_PATH",
    "SmartMessageResult",
    "send_smart_message",
]

SEND_MESSAGE_PATH = "/api-partner/v1/apps-in-toss/messenger/send-message"

# 검수를 안 받은 템플릿. 설정 문제라 매번 같은 실패가 난다.
ERROR_CODE_TEMPLATE_NOT_APPROVED = "5004"

# 통수가 실린 자리. 푸시로 갔든 인박스로 갔든 간 것으로 본다.
_COUNT_FIELDS = ("sentPushCount", "sentInboxCount")


@dataclass(frozen=True, slots=True)
class SmartMessageResult:
    """몇 통이 갔나. **모르는 것과 0통을 가른다.**

    응답 모양을 아직 실물로 본 적이 없다. 모르는 모양을 0통으로 세면, 정상으로 간 알림이
    매번 실패로 기록되고 진짜 장애와 구분이 안 된다.
    """

    delivered: int | None
    reason: str | None

    @property
    def is_known_empty(self) -> bool:
        return self.delivered == 0


async def send_smart_message(
    client: TossApiClient,
    *,
    anon_key: str,
    template_set_code: str,
    context: dict[str, Any] | None = None,
) -> SmartMessageResult:
    """한 사람에게 한 통 보낸다. 실패는 TossApiError 로 올라간다."""
    success = await client.post(
        SEND_MESSAGE_PATH,
        headers={ANON_KEY_HEADER: anon_key},
        json={"templateSetCode": template_set_code, "context": context or {}},
        # 타임아웃이 나도 다시 부르지 않는다. 두 번 울리는 쪽이 못 간 것보다 나쁘다.
        idempotent=False,
    )
    return SmartMessageResult(delivered=_delivered(success), reason=_fail_reason(success))


def _delivered(success: Any) -> int | None:
    """실제로 나간 통수. 셀 수 있는 자리를 하나도 못 찾으면 None(모름)."""
    if not isinstance(success, dict):
        logger.warning("스마트발송 응답 모양이 dict 가 아니다")
        return None

    counted: int | None = None
    for field in _COUNT_FIELDS:
        value = success.get(field)
        # bool 은 int 의 하위형이다. True 가 1통으로 세어지면 0통 판정을 그냥 빠져나간다.
        if type(value) is int:
            counted = (counted or 0) + value

    if counted is None:
        logger.warning("스마트발송 응답에서 통수를 못 찾았다 keys=%s", sorted(success))
    return counted


def _fail_reason(success: Any) -> str | None:
    if not isinstance(success, dict):
        return None
    fail = success.get("fail")
    entries = fail.get("sentPush") if isinstance(fail, dict) else None
    for entry in entries if isinstance(entries, list) else []:
        if isinstance(entry, dict) and entry.get("reachedFailReason"):
            return str(entry["reachedFailReason"])[:120]
    return None
