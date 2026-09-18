"""반복 지출 엔드포인트.

설정 목록과 「곧 나갈 돈」 을 갈라 둔다. 홈은 물어볼 것만 알면 되는데, 목록 전부를
주면 홈이 판정 규칙을 한 벌 더 갖게 된다.

**기록으로 옮기는 것도 여기서 한다.** 화면이 거래 저장과 '적었다' 표시를 따로 부르면,
가운데서 끊겼을 때 거래만 남고 다음 달까지 같은 카드가 계속 뜬다.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES
from app.domain.aggregation import TransactionSource, TransactionType
from app.models import RecurringExpense
from app.modules import ledger
from app.modules.budgets.schemas import BudgetStateOut, to_budget_state
from app.modules.recurring import service
from app.modules.recurring.schemas import (
    RecurringCreate,
    RecurringDueOut,
    RecurringListOut,
    RecurringOut,
    RecurringUpdate,
)
from app.modules.transactions import service as transactions
from app.modules.transactions.schemas import TransactionCreated, TransactionOut, to_feedback

router = APIRouter(prefix="/recurring", tags=["recurring"], responses=ERROR_RESPONSES)


def _out(row: RecurringExpense) -> RecurringOut:
    return RecurringOut(
        id=row.id,
        name=row.name,
        amount=row.amount,
        day_of_month=row.day_of_month,
        category_id=row.category_id,
        tag_id=row.tag_id,
        payment_method=row.payment_method,
        is_active=row.is_active,
        last_recorded_on=row.last_recorded_on,
    )


def _list(session: DbSession, user: CurrentUser) -> RecurringListOut:
    return RecurringListOut(items=[_out(row) for row in service.list_recurring(session, user)])


@router.get("", response_model=RecurringListOut)
def index(session: DbSession, user: CurrentUser) -> RecurringListOut:
    return _list(session, user)


@router.get("/due", response_model=list[RecurringDueOut])
def due(session: DbSession, user: CurrentUser) -> list[RecurringDueOut]:
    """오늘 물어볼 것. 비어 있는 것이 정상이다."""
    today = ledger.today_for(user)
    return [
        RecurringDueOut(
            id=row.id,
            name=row.name,
            amount=row.amount,
            due_on=day,
            category_id=row.category_id,
            tag_id=row.tag_id,
            payment_method=row.payment_method,
            is_today=day == today,
        )
        for row, day in service.due_today(session, user, today)
    ]


@router.post("", response_model=RecurringListOut, status_code=status.HTTP_201_CREATED)
def create(body: RecurringCreate, session: DbSession, user: CurrentUser) -> RecurringListOut:
    service.create_recurring(session, user, body)
    return _list(session, user)


@router.patch("/{row_id}", response_model=RecurringListOut)
def update(
    row_id: uuid.UUID, body: RecurringUpdate, session: DbSession, user: CurrentUser
) -> RecurringListOut:
    service.update_recurring(session, user, row_id, body)
    return _list(session, user)


@router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def destroy(row_id: uuid.UUID, session: DbSession, user: CurrentUser) -> Response:
    service.delete_recurring(session, user, row_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{row_id}/record", response_model=TransactionCreated, status_code=201)
def record(row_id: uuid.UUID, session: DbSession, user: CurrentUser) -> TransactionCreated:
    """예고를 기록으로 옮긴다. 응답은 키패드 저장과 같은 모양이다.

    **적히는 날은 지출일이다.** 전날 눌렀다고 전날에 적으면 그 달 달력이 하루 어긋난다.
    시각은 정오로 둔다. 시간대가 달라져도 날이 안 넘어간다(달력 수정과 같은 규칙).
    """
    row = service.require_owned(session, user, row_id)
    today = ledger.today_for(user)
    due_on = service.due_date_for(row, today)

    tx, outcome = transactions.create_transaction(
        session,
        user,
        {
            "occurred_at": ledger.noon_at(due_on, user),
            "amount": row.amount,
            "type": TransactionType.EXPENSE,
            "merchant": row.name,
            "category_id": row.category_id,
            "tag_id": row.tag_id,
            "source": TransactionSource.KEYPAD,
            "confidence": 1.0,
            "excluded_from_budget": False,
            "payment_method": row.payment_method,
            "memo": None,
            "refund_of_transaction_id": None,
        },
        today=today,
    )
    # 거래를 커밋한 뒤에 표시를 남긴다. 여기서 실패하면 거래는 남고 카드도 남아
    # 한 번 더 물어보게 되는데, 거래가 사라지는 쪽보다 그쪽이 덜 나쁘다.
    service.mark_recorded(session, user, row_id, due_on)

    return TransactionCreated(
        transaction=TransactionOut.model_validate(tx),
        feedback=to_feedback(outcome.feedback),
        budget=_budget_out(outcome),
        undo_window_seconds=int(transactions.UNDO_WINDOW.total_seconds()),
        undo_until=transactions.undo_deadline(tx),
    )


@router.post("/{row_id}/dismiss", response_model=RecurringListOut)
def dismiss(row_id: uuid.UUID, session: DbSession, user: CurrentUser) -> RecurringListOut:
    """이번 회차는 묻지 않는다. 다음 달에는 다시 묻는다."""
    service.dismiss_recurring(session, user, row_id, ledger.today_for(user))
    return _list(session, user)


def _budget_out(outcome: transactions.SaveOutcome) -> BudgetStateOut | None:
    state = outcome.budget_status
    if state is None:
        return None
    return to_budget_state(
        outcome.period,
        state,
        is_auto_carried=outcome.is_auto_carried,
        today=outcome.today,
    )
