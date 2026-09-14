"""목표 엔드포인트.

목표가 없는 것은 정상 상태다. 조회는 404 가 아니라 200 에 `goal: null` 로 답한다.
쓰기 응답도 모두 조회와 같은 모양이라, 화면이 받은 것을 그대로 캐시에 넣어 다시 그린다.
따로 조립하면 필드가 늘 때 한쪽만 빠진다.

진행 중인 목표는 하나뿐이라 목록 경로를 두지 않는다. 대신 **다 모으고 마친 것**은
`GET /goals/history` 로 따로 본다. 접은 것(지운 것)은 어느 쪽에도 오지 않는다.
그만둔 목표를 목록에 남기면 지우기가 지우기로 안 읽힌다.
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
    GoalHistoryOut,
    GoalOut,
    GoalPatch,
    GoalStateOut,
    to_goal_out,
)

router = APIRouter(prefix="/goals", tags=["goals"], responses=ERROR_RESPONSES)


def _view(user: CurrentUser, goal: Goal | None) -> GoalStateOut:
    if goal is None:
        return GoalStateOut(goal=None)
    return GoalStateOut(goal=_out(user, goal))


def _out(user: CurrentUser, goal: Goal) -> GoalOut:
    view = service.evaluate(goal, ledger.today_for(user))
    return to_goal_out(
        view.goal,
        view.evaluation,
        current_amount=view.current_amount,
        monthly_pace=view.monthly_pace,
        contributions=view.contributions,
    )


@router.get("", response_model=GoalStateOut)
def show(session: DbSession, user: CurrentUser) -> GoalStateOut:
    return _view(user, service.active_goal(session, user))


@router.get("/history", response_model=GoalHistoryOut)
def history(session: DbSession, user: CurrentUser) -> GoalHistoryOut:
    """다 모으고 마친 목표들. 비어 있는 것이 정상이다.

    `/{goal_id}` 보다 위에 둔다. 아래에 두면 `history` 가 목표 id 로 읽혀 422 가 난다.
    """
    return GoalHistoryOut(
        items=[_out(user, goal) for goal in service.finished_goals(session, user)]
    )


@router.post("", response_model=GoalStateOut, status_code=status.HTTP_201_CREATED)
def create(body: GoalCreate, session: DbSession, user: CurrentUser) -> GoalStateOut:
    return _view(user, service.create_goal(session, user, body))


@router.patch("/{goal_id}", response_model=GoalStateOut)
def update(
    goal_id: uuid.UUID, body: GoalPatch, session: DbSession, user: CurrentUser
) -> GoalStateOut:
    """보낸 필드만 고친다. `target_date: null` 은 기한을 지운다는 뜻이다.

    비울 수 있는 값은 기한 하나다. 다른 값에 null 을 보내면 422 다.
    """
    payload = body.model_dump(exclude_unset=True)
    return _view(user, service.update_goal(session, user, goal_id, payload))


@router.post("/{goal_id}/finish", response_model=GoalStateOut)
def finish(goal_id: uuid.UUID, session: DbSession, user: CurrentUser) -> GoalStateOut:
    """다 모은 목표를 마친다. 마치고 나면 새 목표를 만들 수 있다.

    응답은 조회와 같은 모양이고, 마친 뒤에는 진행 중인 것이 없어 `goal: null` 이다.
    아직 다 못 모았으면 422 다. 그만두려면 지우기를 쓴다.
    """
    service.finish_goal(session, user, goal_id, ledger.today_for(user))
    return _view(user, service.active_goal(session, user))


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
