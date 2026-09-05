"""줄글·캡처 입력 엔드포인트.

분석은 거래를 만들지 않는다. 저장은 commit 한 번이다.
입구만 둘이고, 검토·수정·저장 라우터는 묶음 단위라 둘이 그대로 나눠 쓴다.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession, LlmClient
from app.api.errors import ERROR_RESPONSES
from app.api.images import decode_data_url
from app.modules.budgets.schemas import to_budget_state
from app.modules.imports import service
from app.modules.imports.schemas import (
    ImportBatchOut,
    ImportCandidatePatch,
    ImportCommitOut,
    ImportImageIn,
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


@router.post("/capture", response_model=ImportBatchOut, status_code=status.HTTP_201_CREATED)
def analyze_capture(
    body: ImportImageIn, session: DbSession, user: CurrentUser, client: LlmClient
) -> ImportBatchOut:
    # async 로 바꾸지 않는다. service._extract 의 anyio.from_thread.run 이 워커 스레드를 전제한다.
    image = decode_data_url(body.image)
    batch = service.parse_image(session, user, image=image, client=client)
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
    # 예산은 마지막 한 건이 아니라 서비스가 고른 기간의 것으로 말한다.
    for_budget = result.budget_outcome
    budget = None
    if for_budget is not None and for_budget.budget_status is not None:
        budget = to_budget_state(
            for_budget.period,
            for_budget.budget_status,
            is_auto_carried=for_budget.is_auto_carried,
            today=for_budget.today,
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
