"""거래 엔드포인트."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Query, Response, status

from app.api.amounts import ratio_out
from app.api.deps import CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES
from app.api.months import MonthQuery
from app.domain.feedback import FeedbackResult
from app.domain.money import Money
from app.modules import ledger
from app.modules.budgets import service as budgets
from app.modules.budgets.schemas import BudgetStateOut, to_budget_state
from app.modules.transactions import service
from app.modules.transactions.schemas import (
    CalendarDayOut,
    CalendarMonthOut,
    FeedbackOut,
    PeriodSummaryOut,
    TransactionCreate,
    TransactionCreated,
    TransactionListOut,
    TransactionOut,
    TransactionUpdate,
    TransactionUpdated,
)

router = APIRouter(prefix="/transactions", tags=["transactions"], responses=ERROR_RESPONSES)


def _amount(value: Money | None) -> Decimal | None:
    return value.amount if value is not None else None


def _feedback_out(result: FeedbackResult) -> FeedbackOut:
    """판정 결과를 응답 형태로 옮긴다. 문장은 만들지 않는다."""
    return FeedbackOut(
        kind=result.kind,
        remaining_budget=_amount(result.remaining_budget),
        daily_allowance=_amount(result.daily_allowance),
        remaining_days=result.remaining_days,
        over_amount=_amount(result.over_amount),
        over_category_id=uuid.UUID(result.over_category_id) if result.over_category_id else None,
        saved_amount=_amount(result.saved_amount),
        month_expense=_amount(result.month_expense),
        pace_ratio=ratio_out(result.pace_ratio),
        projected_month_end=_amount(result.projected_month_end),
        category_spend=_amount(result.category_spend),
        category_budget_amount=_amount(result.category_budget_amount),
        large_expense_threshold=_amount(result.large_expense_threshold),
    )


def _budget_out(outcome: service.SaveOutcome) -> BudgetStateOut | None:
    state = outcome.budget_status
    if state is None:
        return None
    return to_budget_state(
        outcome.period,
        state,
        is_auto_carried=outcome.is_auto_carried,
        today=outcome.today,
    )


@router.post("", response_model=TransactionCreated, status_code=status.HTTP_201_CREATED)
def create(body: TransactionCreate, session: DbSession, user: CurrentUser) -> TransactionCreated:
    tx, outcome = service.create_transaction(session, user, body.model_dump())
    return TransactionCreated(
        transaction=TransactionOut.model_validate(tx),
        feedback=_feedback_out(outcome.feedback),
        budget=_budget_out(outcome),
        undo_window_seconds=int(service.UNDO_WINDOW.total_seconds()),
        undo_until=service.undo_deadline(tx),
    )


@router.patch("/{tx_id}", response_model=TransactionUpdated)
def update(
    tx_id: uuid.UUID, body: TransactionUpdate, session: DbSession, user: CurrentUser
) -> TransactionUpdated:
    tx, outcome = service.update_transaction(
        session, user, tx_id, body.model_dump(exclude_unset=True)
    )
    return TransactionUpdated(
        transaction=TransactionOut.model_validate(tx),
        feedback=_feedback_out(outcome.feedback),
        budget=_budget_out(outcome),
    )


@router.get("", response_model=TransactionListOut)
def index(
    session: DbSession,
    user: CurrentUser,
    period: MonthQuery,
    day: date | None = Query(
        default=None, description="이 날 하루만. 날짜는 사용자 시간대로 판단한다"
    ),
    q: str | None = Query(
        default=None,
        max_length=service.SEARCH_MAX_LENGTH,
        description="상호나 카테고리 이름 부분일치. 대소문자를 가리지 않는다",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = Query(default=None, description="앞 응답의 next_cursor 를 그대로 넘긴다"),
) -> TransactionListOut:
    page = service.list_transactions(
        session, user, period=period, day=day, query=q, limit=limit, cursor=cursor
    )
    return TransactionListOut(
        items=[TransactionOut.model_validate(r) for r in page.items],
        next_cursor=page.next_cursor,
    )


@router.get("/calendar", response_model=CalendarMonthOut)
def calendar(
    session: DbSession,
    user: CurrentUser,
    period: MonthQuery,
) -> CalendarMonthOut:
    """달력 격자용 날짜별 합계. 기본 기간은 사용자 시간대의 이번 달이다."""
    month = period or ledger.period_for(user, ledger.today_for(user))
    return CalendarMonthOut(
        period_start=month.start,
        period_end=month.end,
        days=[
            CalendarDayOut(day=d.day, expense=d.expense.amount, income=d.income.amount)
            for d in ledger.load_day_totals(session, user, month)
        ],
    )


@router.get("/summary", response_model=PeriodSummaryOut)
def summary(
    session: DbSession,
    user: CurrentUser,
    period: MonthQuery,
) -> PeriodSummaryOut:
    # 기본 기간은 사용자 시간대의 오늘이 속한 달이다. 서버가 UTC 로 돌아도 마찬가지다.
    today = ledger.today_for(user)
    month = period or ledger.period_for(user, today)
    totals = ledger.load_period_totals(session, user, month)
    budget_status = budgets.budget_status(session, user, month, totals, today)
    return PeriodSummaryOut(
        period_start=month.start,
        period_end=month.end,
        month_expense=totals.month_expense.amount,
        month_income=totals.month_income.amount,
        monthly_delta=totals.monthly_delta.amount,
        budget=to_budget_state(
            month,
            budget_status,
            is_auto_carried=budgets.is_carried(session, user, month),
            today=today,
        ),
    )


@router.delete("/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
def destroy(tx_id: uuid.UUID, session: DbSession, user: CurrentUser) -> Response:
    service.delete_transaction(session, user, tx_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{tx_id}/undo", status_code=status.HTTP_204_NO_CONTENT)
def undo(tx_id: uuid.UUID, session: DbSession, user: CurrentUser) -> Response:
    service.undo_transaction(session, user, tx_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
