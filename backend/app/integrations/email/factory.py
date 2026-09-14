"""설정을 보고 발송기를 하나 고른다. 프로세스에 하나만 둔다.

로컬(SMTP 없음)은 로그 스텁이다. 스텁이 보낸 것을 `/account/email/peek` 가 읽어야 하므로
매 요청마다 새 스텁을 만들면 안 된다. 그래서 캐시한다.
"""

from __future__ import annotations

from functools import lru_cache

from app.core.config import get_settings
from app.integrations.email.log_sender import LogEmailSender
from app.integrations.email.port import EmailSender
from app.integrations.email.smtp_sender import SmtpEmailSender, SmtpSettings

__all__ = ["get_email_sender"]


@lru_cache(maxsize=1)
def get_email_sender() -> EmailSender:
    settings = get_settings()
    if not settings.smtp_host:
        return LogEmailSender()
    return SmtpEmailSender(
        SmtpSettings(
            host=settings.smtp_host,
            port=settings.smtp_port,
            user=settings.smtp_user,
            password=settings.smtp_password.get_secret_value() if settings.smtp_password else None,
            sender=settings.login_email_from or settings.smtp_user or "no-reply@pocket-ledger",
        )
    )
