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
import statistics
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain import aggregation as agg, recovery
from app.domain.feedback import (
    LARGE_EXPENSE_MEDIAN_WINDOW_DAYS,
    NO_SPEND_STREAK_WINDOW_DAYS,
)
from app.domain.money import Money
from app.domain.period import BudgetPeriod, week_to_date
from app.models import Transaction, User

logger = logging.getLogger(__name__)

__all__ = [
    "DEFAULT_TIMEZONE",
    "AchievementFacts",
    "as_utc",
    "day_bounds",
    "days_since",
    "days_since_last_transaction",
    "last_transaction_date",
    "load_achievement_facts",
    "load_category_expense_median",
    "load_daily_budgeted_spend",
    "load_day_totals",
    "load_period_inputs",
    "load_period_totals",
    "load_range_totals",
    "load_recovery_progress",
    "local_date",
    "period_bounds",
    "period_for",
    "period_transactions",
    "today_for",
    "user_tz",
]

DEFAULT_TIMEZONE = "Asia/Seoul"
_ONE_WEEK = timedelta(days=7)


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
        source=tx.source,
    )


def load_period_inputs(
    session: Session, user: User, period: BudgetPeriod
) -> list[agg.TransactionInput]:
    """그 기간의 거래를 집계용 값 객체로 읽는다.

    한 조회의 답을 여러 판정이 나눠 봐야 할 때 쓴다(결산이 달 합계·지난달 합계·날짜별
    판정을 한 목록으로 낸다). 기간마다 다시 읽으면 그 사이 저장이 끼어 서로 어긋난다.
    """
    tz = user_tz(user)
    return [_to_domain(t, tz) for t in period_transactions(session, user, period)]


def load_period_totals(session: Session, user: User, period: BudgetPeriod) -> agg.PeriodTotals:
    return agg.aggregate_period(load_period_inputs(session, user, period), period)


def load_range_totals(
    session: Session, user: User, periods: Sequence[BudgetPeriod]
) -> list[agg.PeriodTotals]:
    """여러 기간을 한 번 읽어 각각 접는다. 6개월 추이·기간 비교가 이걸 쓴다.

    기간마다 조회하면 같은 행을 여러 번 읽고, 그 사이 저장이 끼면 기간끼리 어긋난다.
    가장 이른 시작부터 가장 늦은 끝까지 한 번 읽고 같은 행 목록을 기간마다 다시 접는다.
    `aggregate_period` 가 `period.contains` 로 스스로 거르므로 걸러 주지 않아도 된다.

    **집계 규칙(이체 제외·환불 차감)을 SQL 로 옮겨 적지 않는다.** 두 번 적으면 두 구현이
    각자 테스트를 통과하면서 서로 다른 숫자를 말한다.
    """
    if not periods:
        return []
    span = BudgetPeriod(min(p.start for p in periods), max(p.end for p in periods))
    rows = load_period_inputs(session, user, span)
    return [agg.aggregate_period(rows, period) for period in periods]


def load_day_totals(session: Session, user: User, period: BudgetPeriod) -> list[agg.DayTotals]:
    """달력 격자용 날짜별 합계. 날짜는 사용자 시간대로 접는다.

    화면이 달의 거래를 전부 받아 스스로 접지 않는 이유: 같은 화면에 무한 스크롤이 붙어 있어서
    "전부 받아야 달력이 맞는다" 와 "조금씩 받는다" 가 서로 싸운다. 접는 일은 서버가 한다.
    """
    return agg.aggregate_days(load_period_inputs(session, user, period), period)


def last_transaction_date(
    session: Session, user: User, *, not_after: date | None = None
) -> date | None:
    """마지막으로 기록한 날(사용자 시간대). 기록이 없으면 None.

    `not_after` 를 주면 그 날까지만 본다. 앞날짜로 적어 둔 기록을 빼고 세야 하는 자리가 있다.
    """
    stmt = select(func.max(Transaction.occurred_at)).where(
        Transaction.user_id == user.id,
        Transaction.deleted_at.is_(None),
    )
    if not_after is not None:
        # 그 날의 끝까지 포함한다. 사용자 시간대의 하루 경계를 UTC 시각으로 옮겨 자른다.
        tz = user_tz(user)
        end = datetime.combine(not_after + timedelta(days=1), time.min, tzinfo=tz)
        stmt = stmt.where(Transaction.occurred_at < end)

    latest = session.scalar(stmt)
    return local_date(latest, user_tz(user)) if latest is not None else None


def days_since(last: date | None, today: date) -> int | None:
    """이미 읽어 둔 마지막 기록일로 며칠 지났는지 센다. 기록이 없으면 None.

    마지막 기록일을 함께 쓰는 응답이 있어서, 같은 쿼리를 두 번 돌지 않게 계산만 떼어 뒀다.
    앞날짜가 들어오면 음수가 되므로 0 으로 붙이는데, **그 상태를 만들지 않는 것이 먼저다.**
    앞날짜 한 건이 마지막 기록이 되면 오늘까지의 공백이 0 으로 보여 복구 화면이 영영 안 뜬다.
    그래서 부르는 쪽이 `last_transaction_date(..., not_after=today)` 로 잘라서 넘긴다.
    """
    return max((today - last).days, 0) if last is not None else None


def days_since_last_transaction(session: Session, user: User, today: date) -> int | None:
    """마지막 기록 이후 며칠 지났나. 오늘 기록했으면 0, 기록이 없으면 None.

    홈이 첫 사용·기본·복귀 중 어느 화면을 그릴지 고르는 근거다.
    """
    return days_since(last_transaction_date(session, user), today)


def load_recovery_progress(session: Session, user: User, today: date) -> recovery.RecoveryProgress:
    """최근 7일 중 며칠 기록했나.

    창 안의 행을 한 번 읽고 접는 일은 도메인이 한다. 어떤 날을 '정리한 날' 로 볼지는
    집계 규칙이라, SQL 로 세면 같은 규칙이 두 곳에 적힌다.
    """
    window = recovery.recovery_window(today)
    return recovery.build_progress(load_period_inputs(session, user, window), window)


def load_category_expense_median(
    session: Session,
    user: User,
    *,
    category_id: uuid.UUID,
    today: date,
    exclude_transaction_id: uuid.UUID | None = None,
) -> Money | None:
    """그 카테고리에서 평소 한 번에 얼마 쓰는지. 최근 90일 지출 금액의 중앙값.

    평균이 아니라 중앙값인 이유는 한 번의 큰 결제에 끌려가지 않기 위해서다.
    환불은 되돌린 지출에서 빼서 실제로 나간 돈만 표본에 남기고, 이체와 수입은 지출이 아니라
    세지 않는다. 예산에서 뺀 지출은 센다. 여기서 재는 것은 예산이 아니라 씀씀이다.

    지금 판정하는 거래는 표본에서 뺀다. 그것까지 넣으면 그 카테고리 첫 지출이 스스로를
    기준으로 삼아 어떤 금액도 큰 지출이 되지 않는다.
    """
    window = BudgetPeriod(today - timedelta(days=LARGE_EXPENSE_MEDIAN_WINDOW_DAYS - 1), today)
    start, end = period_bounds(window, user_tz(user))
    stmt = select(
        Transaction.id,
        Transaction.amount,
        Transaction.type,
        Transaction.refund_of_transaction_id,
    ).where(
        Transaction.user_id == user.id,
        Transaction.category_id == category_id,
        Transaction.deleted_at.is_(None),
        Transaction.occurred_at >= start,
        Transaction.occurred_at < end,
    )
    if exclude_transaction_id is not None:
        stmt = stmt.where(Transaction.id != exclude_transaction_id)

    paid: dict[uuid.UUID, Decimal] = {}
    refunds: list[tuple[uuid.UUID | None, Decimal]] = []
    for row in session.execute(stmt):
        if row.type is agg.TransactionType.EXPENSE:
            paid[row.id] = row.amount
        elif row.type is agg.TransactionType.REFUND:
            refunds.append((row.refund_of_transaction_id, row.amount))
    for target_id, amount in refunds:
        if target_id in paid:
            paid[target_id] -= amount

    # 통째로 되돌린 지출은 나간 돈이 없으니 표본이 아니다.
    sample = [value for value in paid.values() if value > 0]
    return Money(statistics.median(sample)) if sample else None


@dataclass(frozen=True)
class AchievementFacts:
    """성취 근거를 판정할 재료. 판정은 `app.domain.feedback` 이 한다.

    카테고리가 없는 거래는 주간 비교를 할 수 없어 두 주간 값이 None 이다.
    """

    this_week_category_spend: Money | None
    last_week_category_spend: Money | None
    no_spend_streak_days: int


def load_achievement_facts(
    session: Session, user: User, today: date, *, category_id: uuid.UUID | None
) -> AchievementFacts:
    """주간 비교와 무지출 연속을 한 번의 조회로 읽는다.

    저장 응답에 붙는 조회라 왕복을 늘리지 않는다. 두 창을 합친 구간을 한 번 읽고 각각 접는다.
    주 비교는 `week_to_date` 로 같은 요일까지만 견준다. 지난주를 이레 통째로 잡으면
    이번 주가 아직 안 지나서 늘 줄어든 것처럼 보인다.
    """
    tz = user_tz(user)
    this_week = week_to_date(today)
    last_week = week_to_date(today - _ONE_WEEK)
    streak_window = BudgetPeriod(today - timedelta(days=NO_SPEND_STREAK_WINDOW_DAYS - 1), today)
    start = streak_window.start
    if category_id is not None:
        start = min(start, last_week.start)

    rows = [
        _to_domain(t, tz) for t in period_transactions(session, user, BudgetPeriod(start, today))
    ]

    this_spend = last_spend = None
    if category_id is not None:
        key = str(category_id)
        this_spend = agg.aggregate_period(rows, this_week).category_spend.get(key, Money.zero())
        last_spend = agg.aggregate_period(rows, last_week).category_spend.get(key, Money.zero())

    return AchievementFacts(
        this_week_category_spend=this_spend,
        last_week_category_spend=last_spend,
        no_spend_streak_days=_no_spend_streak(rows, streak_window, today),
    )


def _no_spend_streak(
    rows: Sequence[agg.TransactionInput], window: BudgetPeriod, today: date
) -> int:
    """오늘부터 거슬러 올라간 연속 무지출일 수.

    무지출일은 그 날 기록이 있는데 지출이 없는 날이다. 기록이 아예 없는 날은 세지 않는다.
    안 쓴 것과 안 적은 것은 다르고, 안 적은 날을 칭찬하면 근거 없는 칭찬이 된다.
    오늘이 무지출일이 아니면 0 이다. 방금 쓴 것을 적은 사람에게 이어졌다고 말하지 않는다.
    """
    spend = {total.day: total.expense for total in agg.aggregate_days(rows, window)}
    recorded = {r.occurred_on for r in rows if not r.is_deleted and window.contains(r.occurred_on)}

    streak = 0
    day = today
    while day in recorded and not spend.get(day, Money.zero()).is_positive:
        streak += 1
        day -= timedelta(days=1)
    return streak


def load_daily_budgeted_spend(
    session: Session, user: User, period: BudgetPeriod, through: date
) -> list[tuple[date, Money]]:
    """기간 시작부터 하루씩 늘려 가며 접은 예산 반영 지출.

    지난 날의 월말 예상을 다시 세우려면 그 날까지의 누적이 필요하다.
    조회는 한 번만 하고 접는 일만 날짜 수만큼 한다.
    """
    last = min(through, period.end)
    if last < period.start:
        return []
    days = [period.start + timedelta(days=i) for i in range((last - period.start).days + 1)]
    totals = load_range_totals(session, user, [BudgetPeriod(period.start, day) for day in days])
    return [(day, total.budgeted_spend) for day, total in zip(days, totals, strict=True)]
