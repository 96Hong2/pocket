"""월 리포트 조립.

산식을 여기서 새로 쓰지 않는다. 집계는 `domain/aggregation`, 순위는 `domain/report`,
예산은 `modules/budgets` 가 이미 정했다. 이 파일은 그것들을 한 응답으로 모으기만 한다.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.domain import aggregation as agg
from app.domain.money import Money
from app.domain.period import BudgetPeriod, same_day_window, week_of
from app.domain.report import BreakdownRow, rank_breakdown
from app.models import Transaction, User
from app.modules import ledger
from app.modules.budgets import service as budgets

__all__ = ["MonthlyReport", "build_monthly"]

# 추이 막대 개수. 조회한 달을 포함해 뒤로 여섯 달이다.
TREND_MONTHS = 6

_ONE_DAY = timedelta(days=1)


@dataclass(frozen=True)
class Window:
    """비교에 쓰는 창 하나. 날짜를 함께 들고 다녀야 화면이 무엇과 견줬는지 적을 수 있다."""

    period: BudgetPeriod
    expense: Money


@dataclass(frozen=True)
class MonthlyReport:
    period: BudgetPeriod
    totals: agg.PeriodTotals
    budget_status: budgets.BudgetStatus
    has_any_transaction: bool
    expense_rows: list[BreakdownRow]
    expense_total: Money
    income_rows: list[BreakdownRow]
    income_total: Money
    trend: list[tuple[BudgetPeriod, agg.PeriodTotals]]
    comparison: tuple[Window, Window] | None
    weeks: tuple[Window, Window] | None


def build_monthly(
    session: Session, user: User, period: BudgetPeriod, *, today: date
) -> MonthlyReport:
    totals = ledger.load_period_totals(session, user, period)
    status = budgets.budget_status(session, user, period, totals, today)

    expense_rows, expense_total = rank_breakdown(totals.category_spend)
    income_rows, income_total = rank_breakdown(totals.category_income)

    months = _trend_months(period)
    trend_totals = ledger.load_range_totals(session, user, months)
    trend = list(zip(months, trend_totals, strict=True))

    return MonthlyReport(
        period=period,
        totals=totals,
        budget_status=status,
        # 합계가 0 인 것과 기록이 없는 것은 다르다. 지출과 환불이 맞물려 0 이 될 수 있다.
        has_any_transaction=_has_any(session, user, period),
        expense_rows=expense_rows,
        expense_total=expense_total,
        income_rows=income_rows,
        income_total=income_total,
        trend=trend,
        comparison=_compare_months(session, user, period, today),
        weeks=_compare_weeks(session, user, period, today),
    )


def _trend_months(period: BudgetPeriod) -> list[BudgetPeriod]:
    """조회한 달로 끝나는 여섯 달. 오래된 것부터.

    기록이 없는 달도 목록에 남긴다. 빼면 막대가 밀려 다른 달로 읽힌다.
    """
    months = [period]
    for _ in range(TREND_MONTHS - 1):
        months.append(months[-1].previous_period())
    return list(reversed(months))


def _compare_months(
    session: Session, user: User, period: BudgetPeriod, today: date
) -> tuple[Window, Window] | None:
    """지난달 **같은 날짜까지**와 견준다.

    달 전체와 견주면 이번 달은 아직 다 안 지나서 늘 줄어든 것처럼 보인다.
    지난 달을 보고 있으면(오늘이 그 달 밖) 두 달을 통째로 견준다. 둘 다 이미 끝난 달이라
    자를 이유가 없다.
    """
    previous = period.previous_period()
    if period.contains(today):
        current_window = same_day_window(period, today)
        previous_window = same_day_window(previous, today)
    else:
        current_window, previous_window = period, previous

    totals = ledger.load_range_totals(session, user, [current_window, previous_window])
    return (
        Window(current_window, totals[0].month_expense),
        Window(previous_window, totals[1].month_expense),
    )


def _compare_weeks(
    session: Session, user: User, period: BudgetPeriod, today: date
) -> tuple[Window, Window] | None:
    """이번 주와 지난주. 지난 달을 보고 있으면 "이번 주" 가 그 화면과 상관없어 안 만든다."""
    if not period.contains(today):
        return None
    this_week = week_of(today)
    last_week = week_of(this_week.start - _ONE_DAY)
    totals = ledger.load_range_totals(session, user, [this_week, last_week])
    return (Window(this_week, totals[0].month_expense), Window(last_week, totals[1].month_expense))


def _has_any(session: Session, user: User, period: BudgetPeriod) -> bool:
    """그 달에 기록이 한 건이라도 있나. 이체만 있어도 "기록은 있다" 로 본다."""
    start, end = ledger.period_bounds(period, ledger.user_tz(user))
    return (
        session.query(Transaction.id)
        .filter(
            Transaction.user_id == user.id,
            Transaction.deleted_at.is_(None),
            Transaction.occurred_at >= start,
            Transaction.occurred_at < end,
        )
        .first()
        is not None
    )
