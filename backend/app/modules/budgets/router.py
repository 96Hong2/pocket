"""예산 엔드포인트.

예산을 정하지 않은 것은 정상 상태다. 조회는 404 가 아니라 200 에 amount null 로 답한다.
저장은 PUT 하나뿐이고 멱등이다. 같은 기간에 두 번 보내도 409 가 나지 않는다.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES
from app.domain.period import BudgetPeriod
from app.modules import ledger
from app.modules.budgets import service
from app.modules.budgets.schemas import BudgetOut, BudgetUpsert, to_budget_state

router = APIRouter(prefix="/budgets", tags=["budgets"], responses=ERROR_RESPONSES)

# 예산 기간을 만들 수 없는 연도는 라우터에서 막는다. 도메인이 ValueError 로 죽지 않게 한다.
MIN_YEAR, MAX_YEAR = 2000, 2100

YearParam = Query(default=None, ge=MIN_YEAR, le=MAX_YEAR)
MonthParam = Query(default=None, ge=1, le=12)


def _view(session: DbSession, user: CurrentUser, period: BudgetPeriod) -> BudgetOut:
    today = ledger.today_for(user)
    totals = ledger.load_period_totals(session, user, period)
    status = service.budget_status(session, user, period, totals, today)
    return BudgetOut(
        budget=to_budget_state(period, status),
        month_expense=totals.month_expense.amount,
        month_income=totals.month_income.amount,
        monthly_delta=totals.monthly_delta.amount,
        has_any_transaction=ledger.last_transaction_date(session, user) is not None,
        days_since_last_transaction=ledger.days_since_last_transaction(session, user, today),
    )


def _period(user: CurrentUser, year: int | None, month: int | None) -> BudgetPeriod:
    # 기본 기간은 사용자 시간대의 오늘이 속한 달이다. 서버가 UTC 로 돌아도 마찬가지다.
    if year and month:
        return BudgetPeriod.of_month(year, month)
    return ledger.period_for(user, ledger.today_for(user))


@router.get("", response_model=BudgetOut)
def show(
    session: DbSession,
    user: CurrentUser,
    year: int | None = YearParam,
    month: int | None = MonthParam,
) -> BudgetOut:
    return _view(session, user, _period(user, year, month))


@router.put("", response_model=BudgetOut)
def upsert(
    body: BudgetUpsert,
    session: DbSession,
    user: CurrentUser,
    year: int | None = YearParam,
    month: int | None = MonthParam,
) -> BudgetOut:
    period = _period(user, year, month)
    service.upsert_budget(session, user, period, body.amount)
    return _view(session, user, period)
