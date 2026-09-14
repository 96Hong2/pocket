"""메일 발송 연동. 실제 발송 수단은 이 패키지 밖으로 새지 않는다."""

from app.integrations.email.log_sender import LogEmailSender
from app.integrations.email.port import EmailMessage, EmailSender
from app.integrations.email.smtp_sender import SmtpEmailSender, SmtpSettings

__all__ = ["EmailMessage", "EmailSender", "LogEmailSender", "SmtpEmailSender", "SmtpSettings"]
