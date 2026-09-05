"""월 리포트 엔드포인트.

조회 하나가 그 화면이 그리는 것을 전부 실어 보낸다. 여러 번 물으면 그 사이에 저장이 끼어
같은 화면 안의 숫자가 서로 안 맞는다.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES
from app.api.months import MonthQuery
from app.modules import ledger
from app.modules.budgets import service as budgets
from app.modules.budgets.schemas import to_budget_state
from app.modules.reports import service
from app.modules.reports.schemas import (
    MonthlyReportOut,
    PeriodComparisonOut,
    TrendPointOut,
    to_breakdown,
    to_comparison,
)

router = APIRouter(prefix="/reports", tags=["reports"], responses=ERROR_RESPONSES)


@router.get("/monthly", response_model=MonthlyReportOut)
def monthly(session: DbSession, user: CurrentUser, period: MonthQuery) -> MonthlyReportOut:
    today = ledger.today_for(user)
    month = period or ledger.period_for(user, today)
    report = service.build_monthly(session, user, month, today=today)

    return MonthlyReportOut(
        period_start=month.start,
        period_end=month.end,
        has_any_transaction=report.has_any_transaction,
        month_expense=report.totals.month_expense.amount,
        month_income=report.totals.month_income.amount,
        monthly_delta=report.totals.monthly_delta.amount,
        budget=to_budget_state(
            month,
            report.budget_status,
            # 상수로 박지 않는다. 리포트 조회 자체가 이어쓰기를 만들 수 있어
            # 방금 만든 것을 아니라고 답하게 된다.
            is_auto_carried=budgets.is_carried(session, user, month),
            today=today,
        ),
        expense_breakdown=to_breakdown(report.expense_rows),
        income_breakdown=to_breakdown(report.income_rows),
        expense_breakdown_total=report.expense_total.amount,
        income_breakdown_total=report.income_total.amount,
        trend=[
            TrendPointOut(
                period_start=window.start,
                period_end=window.end,
                expense=totals.month_expense.amount,
                income=totals.month_income.amount,
            )
            for window, totals in report.trend
        ],
        comparison=_comparison(report.comparison),
        weeks=_comparison(report.weeks),
    )


def _comparison(pair: tuple[service.Window, service.Window] | None) -> PeriodComparisonOut | None:
    if pair is None:
        return None
    current, previous = pair
    return to_comparison(
        current=(current.period.start, current.period.end),
        previous=(previous.period.start, previous.period.end),
        current_expense=current.expense,
        previous_expense=previous.expense,
    )
