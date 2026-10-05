"""거래 엔드포인트."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES
from app.api.months import MonthQuery
from app.domain.period import BudgetPeriod
from app.models import Transaction, User
from app.modules import ledger
from app.modules.assets import entries as asset_entries
from app.modules.budgets import service as budgets
from app.modules.budgets.schemas import BudgetStateOut, to_budget_state
from app.modules.transactions import service
from app.modules.transactions.schemas import (
    AssetResultOut,
    CalendarDayOut,
    CalendarMonthOut,
    PeriodSummaryOut,
    TransactionCreate,
    TransactionCreated,
    TransactionListOut,
    TransactionOut,
    TransactionUpdate,
    TransactionUpdated,
    to_feedback,
)

router = APIRouter(prefix="/transactions", tags=["transactions"], responses=ERROR_RESPONSES)


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


def _outs(session: Session, user: User, rows: list[Transaction]) -> list[TransactionOut]:
    """거래 응답. 저축·투자면 「어디에」 이름을 최신 스냅샷에서 붙인다."""
    labels = asset_entries.asset_labels(session, user, (row.asset_item_key for row in rows))
    outs = []
    for row in rows:
        out = TransactionOut.model_validate(row)
        if row.asset_item_key is not None:
            out = out.model_copy(update={"asset_label": labels.get(row.asset_item_key)})
        outs.append(out)
    return outs


def _asset_out(session: Session, user: User, tx: Transaction) -> AssetResultOut | None:
    result = asset_entries.asset_result(session, user, tx)
    if result is None:
        return None
    return AssetResultOut(
        item_key=result.item_key,
        label=result.label,
        item_amount=result.item_amount.amount,
        quantity=result.quantity,
        month_saved=result.month_saved.amount,
        realized=result.realized.amount if result.realized is not None else None,
        rate=result.rate,
    )


@router.post("", response_model=TransactionCreated, status_code=status.HTTP_201_CREATED)
def create(body: TransactionCreate, session: DbSession, user: CurrentUser) -> TransactionCreated:
    tx, outcome = service.create_transaction(session, user, body.model_dump())
    return TransactionCreated(
        transaction=_outs(session, user, [tx])[0],
        feedback=to_feedback(outcome.feedback),
        budget=_budget_out(outcome),
        undo_window_seconds=int(service.UNDO_WINDOW.total_seconds()),
        undo_until=service.undo_deadline(tx),
        asset=_asset_out(session, user, tx),
    )


@router.patch("/{tx_id}", response_model=TransactionUpdated)
def update(
    tx_id: uuid.UUID, body: TransactionUpdate, session: DbSession, user: CurrentUser
) -> TransactionUpdated:
    tx, outcome = service.update_transaction(
        session, user, tx_id, body.model_dump(exclude_unset=True)
    )
    return TransactionUpdated(
        transaction=_outs(session, user, [tx])[0],
        feedback=to_feedback(outcome.feedback),
        budget=_budget_out(outcome),
        asset=_asset_out(session, user, tx),
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
        items=_outs(session, user, page.items),
        next_cursor=page.next_cursor,
    )


@router.get("/calendar", response_model=CalendarMonthOut)
def calendar(
    session: DbSession,
    user: CurrentUser,
    period: MonthQuery,
) -> CalendarMonthOut:
    """달력 격자용 날짜별 합계. 기본 기간은 사용자 시간대의 이번 달이다.

    달력은 한 달 시작일과 상관없이 늘 달력 월이다(ADR-0046).
    """
    month = period or BudgetPeriod.containing(ledger.today_for(user))
    return CalendarMonthOut(
        period_start=month.start,
        period_end=month.end,
        days=[
            CalendarDayOut(
                day=d.day,
                expense=d.expense.amount,
                income=d.income.amount,
                is_no_spend=d.is_no_spend,
            )
            for d in ledger.load_day_totals(session, user, month)
        ],
    )


@router.get("/summary", response_model=PeriodSummaryOut)
def summary(
    session: DbSession,
    user: CurrentUser,
    period: MonthQuery,
) -> PeriodSummaryOut:
    """달력 화면 위 합계. 합계는 달력 월이고, 예산 블록은 이름이 같은 달의 예산 기간이다.

    시작일이 25 면 10월 달력의 예산 블록은 9월 25일 ~ 10월 24일 예산이다. 예산을 달력 월로
    다시 세면 홈과 같은 달 예산이 두 숫자가 되고, 그 달력 월에 예산 줄을 이어쓰게 된다.
    """
    # 기본 기간은 사용자 시간대의 오늘이 속한 달이다. 서버가 UTC 로 돌아도 마찬가지다.
    today = ledger.today_for(user)
    month = period or BudgetPeriod.containing(today)
    totals = ledger.load_period_totals(session, user, month)
    budget_period = ledger.period_of_month(user, month.start.year, month.start.month)
    budget_totals = totals
    if budget_period != month:
        budget_totals = ledger.load_period_totals(session, user, budget_period)
    budget_status = budgets.budget_status(session, user, budget_period, budget_totals, today)
    return PeriodSummaryOut(
        period_start=month.start,
        period_end=month.end,
        month_expense=totals.month_expense.amount,
        month_income=totals.month_income.amount,
        monthly_delta=totals.monthly_delta.amount,
        budget=to_budget_state(
            budget_period,
            budget_status,
            is_auto_carried=budgets.is_carried(session, user, budget_period),
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
