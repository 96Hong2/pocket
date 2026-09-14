"""로그로만 남기는 발송기. 로컬과 테스트에서 쓴다."""

from __future__ import annotations

import logging

from app.integrations.email.port import EmailMessage

logger = logging.getLogger(__name__)


class LogEmailSender:
    """보내는 대신 로그에 적는다. 마지막 메시지를 들고 있어 테스트가 읽는다."""

    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> None:
        self.sent.append(message)
        # 코드 원문은 로그에 남기지 않는다. 로컬은 peek 경로로 읽는다.
        logger.info("메일 스텁 to=%s subject=%s", message.to, message.subject)
