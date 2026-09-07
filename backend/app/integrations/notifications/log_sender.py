"""로그로 남기는 발송 스텁.

실제 발송 경로가 열리기 전까지 파이프라인 전체(누구에게 · 언제 보낼지 고르고, 보낸 날을
남기는 것)를 그대로 돌려 볼 수 있게 한다. `is_stub` 이 True 라 운영에서 이것이 붙어 있는지
로그로 바로 드러난다.

사용자 id 말고는 아무것도 적지 않는다. 알림에는 원래 금액도 기록 내용도 싣지 않는다.
"""

from __future__ import annotations

import logging

from app.integrations.notifications.port import ReminderTarget

logger = logging.getLogger(__name__)

__all__ = ["LogReminderSender"]


class LogReminderSender:
    @property
    def is_stub(self) -> bool:
        return True

    def send(self, target: ReminderTarget) -> None:
        logger.info(
            "기록 알림 발송(스텁)",
            extra={
                "user_id": str(target.user_id),
                "local_date": target.local_date.isoformat(),
                "remind_at": target.remind_at.strftime("%H:%M"),
            },
        )
