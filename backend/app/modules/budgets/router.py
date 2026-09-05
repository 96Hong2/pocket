"""예산 엔드포인트.

예산을 정하지 않은 것은 정상 상태다. 조회는 404 가 아니라 200 에 amount null 로 답한다.
저장은 PUT 하나뿐이고 멱등이다. 같은 기간에 두 번 보내도 409 가 나지 않는다.
쓰기는 전부 끝나지 않은 기간에만 받는다. 지난달 예산이 나중에 달라지면 안 된다.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES
from app.api.months import MonthQuery
from app.domain.money import Money
from app.domain.period import BudgetPeriod
from app.modules import ledger
from app.modules.budgets import service
from app.modules.budgets.schemas import (
    BudgetOut,
    BudgetUpsert,
    CategoryBudgetOut,
    to_budget_state,
    to_category_budget,
    to_recovery,
)

router = APIRouter(prefix="/budgets", tags=["budgets"], responses=ERROR_RESPONSES)


def _category_budgets(
    session: DbSession, user: CurrentUser, period: BudgetPeriod, spend: dict[str | None, Money]
) -> list[CategoryBudgetOut]:
    return [
        to_category_budget(
            row.category_id,
            Money(row.amount),
            spend.get(str(row.category_id), Money.zero()),
        )
        for row in service.list_category_budgets(session, user, period)
    ]


def _view(session: DbSession, user: CurrentUser, period: BudgetPeriod) -> BudgetOut:
    today = ledger.today_for(user)
    totals = ledger.load_period_totals(session, user, period)
    status = service.budget_status(session, user, period, totals, today)
    # 마지막 기록일은 두 필드가 함께 쓴다. 한 번만 읽는다.
    last_recorded = ledger.last_transaction_date(session, user)
    return BudgetOut(
        budget=to_budget_state(
            period,
            status,
            is_auto_carried=service.is_carried(session, user, period),
            today=today,
        ),
        category_budgets=_category_budgets(session, user, period, totals.category_budgeted_spend),
        month_expense=totals.month_expense.amount,
        month_income=totals.month_income.amount,
        monthly_delta=totals.monthly_delta.amount,
        has_any_transaction=last_recorded is not None,
        days_since_last_transaction=ledger.days_since(last_recorded, today),
        recovery=to_recovery(ledger.load_recovery_progress(session, user, today)),
    )


def _period(user: CurrentUser, period: BudgetPeriod | None) -> BudgetPeriod:
    # 기본 기간은 사용자 시간대의 오늘이 속한 달이다. 서버가 UTC 로 돌아도 마찬가지다.
    return period or ledger.period_for(user, ledger.today_for(user))


def _writable(session: DbSession, user: CurrentUser, period: BudgetPeriod | None) -> BudgetPeriod:
    """쓰기 요청이 지날 자리. 끝난 기간이면 여기서 422 로 막고, 이어쓰기를 한 번 지난다.

    쓰기도 조회와 같은 상태를 보고 시작해야 한다. 이어쓰기는 조회가 하는 일이지만, 새 달에
    조회보다 쓰기가 먼저 오는 경우가 실제로 있다. 그때 쓰기가 이 단계를 건너뛰면 답이 갈린다.
    지우기는 지울 행이 없어 표시를 남기지 못하고 그대로 204 를 주는데, 곧이은 조회가
    지난달 예산을 이어써서 방금 지운 예산을 되살린다. 카테고리 한도 저장은 붙일 전체 예산이
    없다며 422 로 거절했다가, 조회를 한 번 하고 같은 요청을 다시 보내면 200 이 된다.
    """
    month = _period(user, period)
    today = ledger.today_for(user)
    service.require_open_period(month, today)
    service.ensure_carryover(session, user, month, today)
    return month


@router.get("", response_model=BudgetOut)
def show(session: DbSession, user: CurrentUser, period: MonthQuery) -> BudgetOut:
    return _view(session, user, _period(user, period))


@router.put("", response_model=BudgetOut)
def upsert(
    body: BudgetUpsert, session: DbSession, user: CurrentUser, period: MonthQuery
) -> BudgetOut:
    month = _writable(session, user, period)
    service.upsert_budget(session, user, month, body.amount)
    return _view(session, user, month)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def destroy(session: DbSession, user: CurrentUser, period: MonthQuery) -> Response:
    """예산이 없어도 204 다. 화면이 두 번 눌러도 같은 결과여야 한다."""
    month = _writable(session, user, period)
    service.delete_budget(session, user, month)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/categories/{category_id}", response_model=BudgetOut)
def upsert_category(
    category_id: uuid.UUID,
    body: BudgetUpsert,
    session: DbSession,
    user: CurrentUser,
    period: MonthQuery,
) -> BudgetOut:
    """조회와 같은 모양으로 답한다. 화면이 응답을 그대로 캐시에 넣어 다시 그린다."""
    month = _writable(session, user, period)
    service.upsert_category_budget(session, user, month, category_id, body.amount)
    return _view(session, user, month)


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def destroy_category(
    category_id: uuid.UUID, session: DbSession, user: CurrentUser, period: MonthQuery
) -> Response:
    month = _writable(session, user, period)
    service.delete_category_budget(session, user, month, category_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
