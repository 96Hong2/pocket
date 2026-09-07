"""목표 엔드포인트.

목표가 없는 것은 정상 상태다. 조회는 404 가 아니라 200 에 `goal: null` 로 답한다.
쓰기 응답도 모두 조회와 같은 모양이라, 화면이 받은 것을 그대로 캐시에 넣어 다시 그린다.
따로 조립하면 필드가 늘 때 한쪽만 빠진다.

진행 중인 목표는 하나뿐이라 목록 경로를 두지 않는다. 접은 목표를 다시 꺼내 보는 화면도
아직 없어서, 지운 것은 `GET /goals` 에 오지 않는다.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES
from app.models.goal import Goal
from app.modules import ledger
from app.modules.goals import service
from app.modules.goals.schemas import (
    GoalContributionCreate,
    GoalCreate,
    GoalPatch,
    GoalStateOut,
    to_goal_out,
)

router = APIRouter(prefix="/goals", tags=["goals"], responses=ERROR_RESPONSES)


def _view(user: CurrentUser, goal: Goal | None) -> GoalStateOut:
    if goal is None:
        return GoalStateOut(goal=None)

    view = service.evaluate(goal, ledger.today_for(user))
    return GoalStateOut(
        goal=to_goal_out(
            view.goal,
            view.evaluation,
            current_amount=view.current_amount,
            monthly_pace=view.monthly_pace,
            contributions=view.contributions,
        )
    )


@router.get("", response_model=GoalStateOut)
def show(session: DbSession, user: CurrentUser) -> GoalStateOut:
    return _view(user, service.active_goal(session, user))


@router.post("", response_model=GoalStateOut, status_code=status.HTTP_201_CREATED)
def create(body: GoalCreate, session: DbSession, user: CurrentUser) -> GoalStateOut:
    return _view(user, service.create_goal(session, user, body))


@router.patch("/{goal_id}", response_model=GoalStateOut)
def update(
    goal_id: uuid.UUID, body: GoalPatch, session: DbSession, user: CurrentUser
) -> GoalStateOut:
    """보낸 필드만 고친다. `target_date: null` 은 기한을 지운다는 뜻이다."""
    payload = body.model_dump(exclude_unset=True)
    return _view(user, service.update_goal(session, user, goal_id, payload))


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def destroy(goal_id: uuid.UUID, session: DbSession, user: CurrentUser) -> Response:
    """목표를 접는다. 지우고 나면 새 목표를 만들 수 있다."""
    service.archive_goal(session, user, goal_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{goal_id}/contributions", response_model=GoalStateOut, status_code=status.HTTP_201_CREATED
)
def add_contribution(
    goal_id: uuid.UUID,
    body: GoalContributionCreate,
    session: DbSession,
    user: CurrentUser,
) -> GoalStateOut:
    today = ledger.today_for(user)
    return _view(user, service.add_contribution(session, user, goal_id, body, today))


@router.delete("/{goal_id}/contributions/{contribution_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_contribution(
    goal_id: uuid.UUID,
    contribution_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> Response:
    """모은 돈 한 줄을 지운다. 지우는 응답은 다른 자원과 같게 본문이 없다."""
    service.remove_contribution(session, user, goal_id, contribution_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
