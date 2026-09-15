"""SMTP 발송기. 표준 라이브러리만 쓴다. Gmail 앱 비밀번호 같은 것으로 바로 붙는다."""

from __future__ import annotations

import smtplib
from dataclasses import dataclass
from email.headerregistry import Address
from email.message import EmailMessage as MimeMessage

from app.integrations.email.port import EmailMessage


@dataclass(frozen=True)
class SmtpSettings:
    host: str
    port: int
    user: str | None
    password: str | None
    sender: str
    # 받는 사람 메일함에 뜨는 이름. 주소는 가려지지 않지만, 사람 이름이 아니라 앱 이름으로 읽힌다.
    sender_name: str = "10초 가계부"


class SmtpEmailSender:
    def __init__(self, settings: SmtpSettings) -> None:
        self._settings = settings

    def send(self, message: EmailMessage) -> None:
        mime = MimeMessage()
        local, _, domain = self._settings.sender.partition("@")
        # 주소 형태가 아니면 이름을 붙이지 않는다. 억지로 쪼개면 헤더가 깨진다.
        mime["From"] = (
            Address(self._settings.sender_name, local, domain) if domain else self._settings.sender
        )
        mime["To"] = message.to
        mime["Subject"] = message.subject
        mime.set_content(message.body)
        with smtplib.SMTP(self._settings.host, self._settings.port, timeout=15) as client:
            client.starttls()
            if self._settings.user and self._settings.password:
                client.login(self._settings.user, self._settings.password)
            client.send_message(mime)
