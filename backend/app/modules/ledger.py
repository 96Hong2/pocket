"""사용자 시간대 기준의 기간과 기간 합계.

거래 모듈과 예산 모듈이 같은 합계를 본다. 예산 상태를 만들려면 거래 합계가 필요하고
거래를 저장하면 예산 상태를 돌려줘야 해서, 서로를 부르면 순환이 된다.
그래서 둘 다 필요한 읽기를 여기 한 곳에 두고, 이 파일은 다른 modules 를 부르지 않는다.

시간대 규칙(중요): 저장은 UTC 로 정규화하고, 월 경계와 '오늘'은 사용자 시간대
(`users.timezone`, 기본 Asia/Seoul)로 판단한다. UTC 로 날짜를 뽑으면 한국에서
자정부터 아침 9시까지 저장한 거래가 전달로 집계된다.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain import aggregation as agg
from app.domain.money import Money
from app.domain.period import BudgetPeriod
from app.models import Transaction, User

logger = logging.getLogger(__name__)

__all__ = [
    "DEFAULT_TIMEZONE",
    "as_utc",
    "day_bounds",
    "days_since_last_transaction",
    "last_transaction_date",
    "load_day_totals",
    "load_period_totals",
    "local_date",
    "period_bounds",
    "period_for",
    "period_transactions",
    "today_for",
    "user_tz",
]

DEFAULT_TIMEZONE = "Asia/Seoul"


def user_tz(user: User) -> ZoneInfo:
    """사용자 시간대. 값이 깨져 있어도 앱이 죽지 않게 기본값으로 떨어진다."""
    try:
        return ZoneInfo(user.timezone or DEFAULT_TIMEZONE)
    except (ZoneInfoNotFoundError, ValueError):
        logger.warning("알 수 없는 시간대라 기본값을 쓴다 timezone=%s", user.timezone)
        return ZoneInfo(DEFAULT_TIMEZONE)


def as_utc(value: datetime) -> datetime:
    """DB 가 시간대 없는 값을 돌려주면(SQLite) UTC 로 본다. PostgreSQL 은 그대로다."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def local_date(value: datetime, tz: ZoneInfo) -> date:
    return as_utc(value).astimezone(tz).date()


def today_for(user: User) -> date:
    """사용자 기준 오늘. 서버가 UTC 로 돌아도 한국 사용자에게는 KST 날짜다."""
    return datetime.now(user_tz(user)).date()


def period_for(user: User, day: date) -> BudgetPeriod:
    del user  # 기간은 달력 월 고정이다. 사용자별 시작일은 없다(ADR-0007 전제).
    return BudgetPeriod.containing(day)


def period_bounds(period: BudgetPeriod, tz: ZoneInfo) -> tuple[datetime, datetime]:
    """기간의 [시작, 끝+1일) 을 사용자 시간대 자정 기준으로 만들어 UTC 로 넘긴다."""
    start = datetime.combine(period.start, time.min, tzinfo=tz).astimezone(UTC)
    end = datetime.combine(period.end + timedelta(days=1), time.min, tzinfo=tz).astimezone(UTC)
    return start, end


def day_bounds(day: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    """하루의 [자정, 다음 자정) 을 사용자 시간대로 만들어 UTC 로 넘긴다."""
    start = datetime.combine(day, time.min, tzinfo=tz).astimezone(UTC)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=tz).astimezone(UTC)
    return start, end


def period_transactions(session: Session, user: User, period: BudgetPeriod) -> list[Transaction]:
    start, end = period_bounds(period, user_tz(user))
    stmt = (
        select(Transaction)
        .where(
            Transaction.user_id == user.id,
            Transaction.deleted_at.is_(None),
            Transaction.occurred_at >= start,
            Transaction.occurred_at < end,
        )
        .order_by(Transaction.occurred_at.desc())
    )
    return list(session.scalars(stmt))


def _to_domain(tx: Transaction, tz: ZoneInfo) -> agg.TransactionInput:
    return agg.TransactionInput(
        occurred_on=local_date(tx.occurred_at, tz),
        amount=Money(tx.amount),
        type=tx.type,
        category_id=str(tx.category_id) if tx.category_id else None,
        excluded_from_budget=tx.excluded_from_budget,
        is_deleted=tx.deleted_at is not None,
    )


def load_period_totals(session: Session, user: User, period: BudgetPeriod) -> agg.PeriodTotals:
    tz = user_tz(user)
    rows = period_transactions(session, user, period)
    return agg.aggregate_period([_to_domain(t, tz) for t in rows], period)


def load_day_totals(session: Session, user: User, period: BudgetPeriod) -> list[agg.DayTotals]:
    """달력 격자용 날짜별 합계. 날짜는 사용자 시간대로 접는다.

    화면이 달의 거래를 전부 받아 스스로 접지 않는 이유: 같은 화면에 무한 스크롤이 붙어 있어서
    "전부 받아야 달력이 맞는다" 와 "조금씩 받는다" 가 서로 싸운다. 접는 일은 서버가 한다.
    """
    tz = user_tz(user)
    rows = period_transactions(session, user, period)
    return agg.aggregate_days([_to_domain(t, tz) for t in rows], period)


def last_transaction_date(session: Session, user: User) -> date | None:
    """마지막으로 기록한 날(사용자 시간대). 기록이 없으면 None."""
    latest = session.scalar(
        select(func.max(Transaction.occurred_at)).where(
            Transaction.user_id == user.id,
            Transaction.deleted_at.is_(None),
        )
    )
    return local_date(latest, user_tz(user)) if latest is not None else None


def days_since_last_transaction(session: Session, user: User, today: date) -> int | None:
    """마지막 기록 이후 며칠 지났나. 오늘 기록했으면 0, 기록이 없으면 None.

    홈이 첫 사용·기본·복귀 중 어느 화면을 그릴지 고르는 근거다.
    앞날짜로 기록한 경우가 있어 음수가 되지 않게 0 으로 붙인다.
    """
    last = last_transaction_date(session, user)
    return max((today - last).days, 0) if last is not None else None
