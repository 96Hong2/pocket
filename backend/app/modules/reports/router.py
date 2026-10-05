"""월 리포트 엔드포인트.

조회 하나가 그 화면이 그리는 것을 전부 실어 보낸다. 여러 번 물으면 그 사이에 저장이 끼어
같은 화면 안의 숫자가 서로 안 맞는다.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES, ApiError, ErrorCode
from app.api.months import UserMonthQuery
from app.domain.report import ROLLED_UP, UNCATEGORIZED
from app.modules import ledger
from app.modules.budgets import service as budgets
from app.modules.budgets.schemas import to_budget_state
from app.modules.reports import service
from app.modules.reports.schemas import (
    CategoryReportOut,
    ClosingOut,
    LargeExpenseOut,
    MonthlyReportOut,
    PeriodComparisonOut,
    TrendPointOut,
    to_breakdown,
    to_closing,
    to_comparison,
    to_methods,
    to_tags,
)
from app.modules.transactions.schemas import TransactionOut

router = APIRouter(prefix="/reports", tags=["reports"], responses=ERROR_RESPONSES)


@router.get("/monthly", response_model=MonthlyReportOut)
def monthly(session: DbSession, user: CurrentUser, period: UserMonthQuery) -> MonthlyReportOut:
    today = ledger.today_for(user)
    month = period or ledger.period_for(user, today)
    report = service.build_monthly(session, user, month, today=today)

    return MonthlyReportOut(
        period_start=month.start,
        period_end=month.end,
        period_key=month.key,
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
        large_expenses=[
            LargeExpenseOut(
                id=row.id,
                occurred_on=ledger.local_date(row.occurred_at, ledger.user_tz(user)),
                merchant=row.merchant,
                category_id=row.category_id,
                amount=row.amount,
            )
            for row in report.large_expenses
        ],
        expense_breakdown=to_breakdown(report.expense_rows),
        income_breakdown=to_breakdown(report.income_rows),
        expense_breakdown_total=report.expense_total.amount,
        income_breakdown_total=report.income_total.amount,
        method_breakdown=to_methods(report.method_rows),
        method_breakdown_total=report.method_total.amount,
        expense_tag_breakdown=to_tags(report.expense_tags),
        income_tag_breakdown=to_tags(report.income_tags),
        trend=[
            TrendPointOut(
                period_start=window.start,
                period_end=window.end,
                period_key=window.key,
                expense=totals.month_expense.amount,
                income=totals.month_income.amount,
            )
            for window, totals in report.trend
        ],
        comparison=_comparison(report.comparison),
        weeks=_comparison(report.weeks),
    )


@router.get("/category", response_model=CategoryReportOut)
def category(
    session: DbSession,
    user: CurrentUser,
    period: UserMonthQuery,
    tab: service.CategoryTab = Query(description="리포트의 소비·수입 탭"),
    key: str = Query(
        max_length=64, description="리포트 줄의 키. 카테고리 uuid, uncategorized, rolled_up"
    ),
) -> CategoryReportOut:
    """리포트 분류 줄 하나의 기록. 기간은 `/monthly` 와 같은 규칙으로 정한다."""
    today = ledger.today_for(user)
    month = period or ledger.period_for(user, today)
    category_id = _category_key(key)
    # 대소문자만 다른 uuid 도 같은 분류로 본다. 집계 쪽 키는 소문자다.
    key = key if category_id is None else str(category_id)
    detail = service.build_category(session, user, month, tab, key)
    return CategoryReportOut(
        period_start=month.start,
        period_end=month.end,
        period_key=month.key,
        tab=tab.value,
        key=key,
        category_id=category_id,
        total=detail.total.amount,
        count=len(detail.transactions),
        # 지출, 환불, 수입만 오른다. 「어디에」 이름을 붙일 저축·투자 줄이 없다.
        transactions=[TransactionOut.model_validate(row) for row in detail.transactions],
    )


def _category_key(key: str) -> uuid.UUID | None:
    if key in (UNCATEGORIZED, ROLLED_UP):
        return None
    try:
        return uuid.UUID(key)
    except ValueError:
        raise ApiError(
            ErrorCode.INVALID_REQUEST, "분류를 알아보지 못했어요.", status_code=422
        ) from None


@router.get("/closing", response_model=ClosingOut)
def closing(session: DbSession, user: CurrentUser, period: UserMonthQuery) -> ClosingOut:
    """월간 결산. 카드 넉 장이 그리는 것을 한 응답으로 준다.

    **아무것도 저장하지 않는다.** 결산을 열어 봤다는 표시는 기기에만 남는다.
    아직 지나는 중인 달이나 기록이 없는 달도 200 으로 답하고, 그때는 `is_closed`·
    `has_any_transaction` 이 false 라 화면이 입구를 아예 그리지 않는다.
    """
    today = ledger.today_for(user)
    month = period or ledger.period_for(user, today)
    return to_closing(month, service.build_closing(session, user, month, today=today))


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
