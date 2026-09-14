"""SMTP 발송기. 표준 라이브러리만 쓴다. Gmail 앱 비밀번호 같은 것으로 바로 붙는다."""

from __future__ import annotations

import smtplib
from dataclasses import dataclass
from email.message import EmailMessage as MimeMessage

from app.integrations.email.port import EmailMessage


@dataclass(frozen=True)
class SmtpSettings:
    host: str
    port: int
    user: str | None
    password: str | None
    sender: str


class SmtpEmailSender:
    def __init__(self, settings: SmtpSettings) -> None:
        self._settings = settings

    def send(self, message: EmailMessage) -> None:
        mime = MimeMessage()
        mime["From"] = self._settings.sender
        mime["To"] = message.to
        mime["Subject"] = message.subject
        mime.set_content(message.body)
        with smtplib.SMTP(self._settings.host, self._settings.port, timeout=15) as client:
            client.starttls()
            if self._settings.user and self._settings.password:
                client.login(self._settings.user, self._settings.password)
            client.send_message(mime)
