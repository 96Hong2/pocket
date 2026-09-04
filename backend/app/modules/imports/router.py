"""줄글 입력 엔드포인트.

분석은 거래를 만들지 않는다. 저장은 commit 한 번이다.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession, LlmClient
from app.api.errors import ERROR_RESPONSES
from app.modules.budgets.schemas import to_budget_state
from app.modules.imports import service
from app.modules.imports.schemas import (
    ImportBatchOut,
    ImportCandidatePatch,
    ImportCommitOut,
    ImportTextIn,
    to_batch,
)
from app.modules.transactions.schemas import to_feedback

router = APIRouter(prefix="/imports", tags=["imports"], responses=ERROR_RESPONSES)


@router.post("/text", response_model=ImportBatchOut, status_code=status.HTTP_201_CREATED)
def analyze_text(
    body: ImportTextIn, session: DbSession, user: CurrentUser, client: LlmClient
) -> ImportBatchOut:
    batch = service.parse_text(session, user, text=body.text, client=client)
    return to_batch(batch, client=client)


@router.patch("/{batch_id}/candidates/{candidate_id}", response_model=ImportBatchOut)
def patch_candidate(
    batch_id: uuid.UUID,
    candidate_id: uuid.UUID,
    body: ImportCandidatePatch,
    session: DbSession,
    user: CurrentUser,
    client: LlmClient,
) -> ImportBatchOut:
    # exclude_unset 이라 '안 보냄' 과 'null 로 보냄' 이 갈린다. null 은 비우라는 뜻이다.
    batch = service.update_candidate(
        session, user, batch_id, candidate_id, body.model_dump(exclude_unset=True)
    )
    return to_batch(batch, client=client)


@router.post("/{batch_id}/commit", response_model=ImportCommitOut)
def commit(
    batch_id: uuid.UUID, session: DbSession, user: CurrentUser, client: LlmClient
) -> ImportCommitOut:
    result = service.commit_batch(session, user, batch_id)
    outcome = result.outcome
    budget = None
    if outcome is not None and outcome.budget_status is not None:
        budget = to_budget_state(
            outcome.period,
            outcome.budget_status,
            is_auto_carried=outcome.is_auto_carried,
            today=outcome.today,
        )
    return ImportCommitOut(
        batch=to_batch(result.batch, client=client),
        created_count=result.created_count,
        expense_total=result.expense_total,
        feedback=to_feedback(outcome.feedback) if outcome is not None else None,
        budget=budget,
    )


@router.delete("/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
def destroy(batch_id: uuid.UUID, session: DbSession, user: CurrentUser) -> Response:
    service.delete_batch(session, user, batch_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
