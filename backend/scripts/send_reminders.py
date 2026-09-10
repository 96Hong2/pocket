"""기록 알림을 보낼 차례인 사람에게 보낸다.

**1분마다 부르는 진입점이다**(Cloud Scheduler·cron). 판정이 '정한 시각과 같은 분' 이라
더 뜸하게 부르면 그 사이에 든 시각은 그 날 아예 안 간다.

    uv run python scripts/send_reminders.py --dry-run   # 누가 대상인지만 센다
    uv run python scripts/send_reminders.py             # 실제로 보내고 보낸 날을 남긴다

`TOSS_REMINDER_TEMPLATE_SET_CODE` 가 있으면 토스 스마트발송으로 진짜 보낸다. 없으면 로그
스텁으로 돈다(알림이 안 간다). 템플릿 코드는 있는데 mTLS 인증서가 없으면 **멈춘다.**
조용히 스텁으로 내려가면 배포는 성공으로 보이고 알림만 안 간다.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.db.session import get_sessionmaker
from app.integrations.apps_in_toss.client import TossApiClient, TossApiSettings
from app.integrations.notifications import (
    LogReminderSender,
    ReminderSender,
    TossSmartMessageSender,
)
from app.modules.notifications import service

logger = logging.getLogger("app.scripts.send_reminders")


class ReminderSenderMisconfigured(RuntimeError):
    """보낼 수단을 고를 수 없는 설정."""


def build_sender(settings: Settings) -> tuple[ReminderSender, TossApiClient | None]:
    """설정을 보고 발송기를 고른다. 만든 HTTP 클라이언트는 부른 쪽이 닫는다."""
    code = (settings.toss_reminder_template_set_code or "").strip()
    if not code:
        logger.warning(
            "스마트발송 템플릿 코드가 없어 로그 스텁으로 돈다. 알림은 실제로 가지 않는다"
        )
        return LogReminderSender(), None

    api_settings = TossApiSettings(
        base_url=settings.toss_api_base_url,
        client_cert_path=settings.toss_mtls_cert_path,
        client_key_path=settings.toss_mtls_key_path,
    )
    if not api_settings.has_client_certificate:
        raise ReminderSenderMisconfigured(
            "스마트발송을 부르려면 mTLS 클라이언트 인증서가 있어야 한다. docs/SECRETS.md 참고."
        )

    client = TossApiClient(api_settings)
    return TossSmartMessageSender(client, template_set_code=code), client


async def run(dry_run: bool) -> int:
    settings = get_settings()
    now = datetime.now(UTC)
    session = get_sessionmaker()()
    try:
        if dry_run:
            count = len(service.due_reminders(session, now))
            logger.info("보낼 차례인 사람", extra={"count": count, "dry_run": True})
            return 0

        sender, client = build_sender(settings)
        try:
            sent = await service.send_due_reminders(session, sender, now)
        finally:
            if client is not None:
                await client.aclose()
        logger.info("기록 알림을 보냈다", extra={"count": sent, "stub": sender.is_stub})
        return 0
    finally:
        session.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="기록 알림 발송")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="보내지 않고 지금 대상이 몇 명인지만 센다",
    )
    args = parser.parse_args(argv)

    configure_logging(get_settings().log_level)
    try:
        return asyncio.run(run(args.dry_run))
    except ReminderSenderMisconfigured:
        logger.exception("발송기를 만들지 못했다")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
