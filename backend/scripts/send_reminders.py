"""기록 알림을 보낼 차례인 사람에게 보낸다.

**1분마다 부르는 진입점이다**(Cloud Scheduler·cron). 판정이 '정한 시각과 같은 분' 이라
더 뜸하게 부르면 그 사이에 든 시각은 그 날 아예 안 간다.

    uv run python scripts/send_reminders.py --dry-run   # 누가 대상인지만 센다
    uv run python scripts/send_reminders.py             # 실제로 보내고 보낸 날을 남긴다

지금 붙어 있는 발송기는 로그로 남기는 스텁이다. 토스 스마트발송을 서버에서 부르는 API 가
아직 우리 손에 없어서, 있다고 가정한 어댑터를 지어내지 않았다. 실제 경로가 열리면
`app/integrations/notifications/` 에 어댑터를 하나 더 두고 여기서 그것을 넘긴다.
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import get_sessionmaker
from app.integrations.notifications import LogReminderSender
from app.modules.notifications import service

logger = logging.getLogger("app.scripts.send_reminders")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="기록 알림 발송")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="보내지 않고 지금 대상이 몇 명인지만 센다",
    )
    args = parser.parse_args(argv)

    configure_logging(get_settings().log_level)
    now = datetime.now(UTC)

    session = get_sessionmaker()()
    try:
        if args.dry_run:
            count = len(service.due_reminders(session, now))
            logger.info("보낼 차례인 사람", extra={"count": count, "dry_run": True})
            return 0

        sent = service.send_due_reminders(session, LogReminderSender(), now)
        logger.info("기록 알림을 보냈다", extra={"count": sent})
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
