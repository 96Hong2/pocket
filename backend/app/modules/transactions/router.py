"""거래 엔드포인트."""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentUser, DbSession
from app.domain.feedback import FeedbackResult
from app.domain.money import Money
from app.domain.period import BudgetPeriod
from app.modules.transactions import service
from app.modules.transactions.schemas import (
    FeedbackOut,
    PeriodSummaryOut,
    TransactionCreate,
    TransactionCreated,
    TransactionListOut,
    TransactionOut,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])

# 예산 기간을 만들 수 없는 연도는 라우터에서 막는다. 도메인이 ValueError 로 죽지 않게 한다.
MIN_YEAR, MAX_YEAR = 2000, 2100


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
        pace_ratio=result.pace_ratio,
        projected_month_end=_amount(result.projected_month_end),
        category_spend=_amount(result.category_spend),
        category_budget_amount=_amount(result.category_budget_amount),
        large_expense_threshold=_amount(result.large_expense_threshold),
    )


@router.post("", response_model=TransactionCreated, status_code=status.HTTP_201_CREATED)
def create(body: TransactionCreate, session: DbSession, user: CurrentUser) -> TransactionCreated:
    tx, feedback = service.create_transaction(session, user, body.model_dump())
    return TransactionCreated(
        transaction=TransactionOut.model_validate(tx),
        feedback=_feedback_out(feedback),
        undo_window_seconds=int(service.UNDO_WINDOW.total_seconds()),
        undo_until=service.undo_deadline(tx),
    )


@router.get("", response_model=TransactionListOut)
def index(
    session: DbSession,
    user: CurrentUser,
    year: int | None = Query(default=None, ge=MIN_YEAR, le=MAX_YEAR),
    month: int | None = Query(default=None, ge=1, le=12),
    limit: int = Query(default=50, ge=1, le=200),
) -> TransactionListOut:
    period = BudgetPeriod.of_month(year, month) if year and month else None
    rows = service.list_transactions(session, user, period=period, limit=limit)
    return TransactionListOut(items=[TransactionOut.model_validate(r) for r in rows])


@router.get("/summary", response_model=PeriodSummaryOut)
def summary(
    session: DbSession,
    user: CurrentUser,
    year: int | None = Query(default=None, ge=MIN_YEAR, le=MAX_YEAR),
    month: int | None = Query(default=None, ge=1, le=12),
) -> PeriodSummaryOut:
    # 기본 기간은 사용자 시간대의 오늘이 속한 달이다. 서버가 UTC 로 돌아도 마찬가지다.
    period = (
        BudgetPeriod.of_month(year, month)
        if year and month
        else service.period_for(user, service.today_for(user))
    )
    totals = service.load_period_totals(session, user, period)
    return PeriodSummaryOut(
        period_start=period.start,
        period_end=period.end,
        month_expense=totals.month_expense.amount,
        month_income=totals.month_income.amount,
        monthly_delta=totals.monthly_delta.amount,
    )


@router.delete("/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
def destroy(tx_id: uuid.UUID, session: DbSession, user: CurrentUser) -> Response:
    service.delete_transaction(session, user, tx_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{tx_id}/undo", status_code=status.HTTP_204_NO_CONTENT)
def undo(tx_id: uuid.UUID, session: DbSession, user: CurrentUser) -> Response:
    service.undo_transaction(session, user, tx_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
