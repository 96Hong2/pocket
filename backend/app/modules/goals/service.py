"""목표 조회·생성·수정과 모은 돈 기록.

**진행 중인 목표는 하나다.** 여러 목표는 범위 밖이고 DB 의 부분 유니크 인덱스가 그것을
지킨다. 여기서 먼저 막고 IntegrityError 도 같은 오류로 옮긴다. 한쪽만 두면 두 번 눌린
요청 중 하나가 500 으로 새거나, 인덱스가 없는 검증 DB 에서 조용히 둘 다 만들어진다.

**목표액에 닿아도 `status` 는 그대로 `active` 다.** 달성은 그때그때 금액을 견줘 판정하고
(`is_achieved`) 저장된 상태로 굳히지 않는다. 굳혀 두면 기여 한 건을 지워 다시 모자라게
된 목표가 상태만 achieved 로 남아, 진행 중인 목표 조회에서 사라져 화면에서 통째로 없어진다.
마쳤다는 표시는 사용자가 지울 때 archived 로 남는다.

지금 페이스(`monthly_pace`)는 `기여 합 ÷ 첫 기여 달부터 이번 달까지의 달 수`(양쪽 끝
포함, 최소 1)다. 산식은 `app.domain.goals` 에만 있고 여기서 다시 쓰지 않는다.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.errors import ApiError, ErrorCode
from app.domain import goals as domain
from app.domain.money import Money
from app.models import User
from app.models.goal import (
    Goal,
    GoalContribution,
    GoalContributionSource,
    GoalStatus as GoalState,
)
from app.modules.goals.schemas import GoalContributionCreate, GoalCreate

__all__ = [
    "GoalView",
    "active_goal",
    "add_contribution",
    "archive_goal",
    "create_goal",
    "evaluate",
    "remove_contribution",
    "update_goal",
]

_NOT_FOUND = "목표를 찾지 못했어요."
_ALREADY_ACTIVE = "진행 중인 목표가 이미 있어요. 먼저 마치거나 지워 주세요."


@dataclass(frozen=True)
class GoalView:
    """화면이 그릴 목표 하나. 판정과 그 근거를 함께 들고 있다."""

    goal: Goal
    evaluation: domain.GoalStatus
    current_amount: Money
    monthly_pace: Money | None
    contributions: list[GoalContribution]


def active_goal(session: Session, user: User) -> Goal | None:
    """진행 중인 목표 한 건. 없으면 None 이고 그것이 정상 상태다."""
    return session.scalar(
        select(Goal)
        .where(
            Goal.user_id == user.id,
            Goal.status == GoalState.ACTIVE,
            Goal.deleted_at.is_(None),
        )
        .order_by(Goal.created_at.desc())
        .options(selectinload(Goal.contributions))
        .limit(1)
    )


def evaluate(goal: Goal, today: date) -> GoalView:
    """모은 돈을 세고 도메인에 판정을 맡긴다. 여기서 산식을 쓰지 않는다."""
    rows = _live_contributions(goal)
    current = Money(goal.initial_amount) + Money.total(Money(row.amount) for row in rows)
    pace = domain.monthly_pace([(row.occurred_on, Money(row.amount)) for row in rows], today)

    evaluation = domain.evaluate_goal(
        domain.GoalInput(
            target_amount=Money(goal.target_amount),
            current_amount=current,
            today=today,
            target_date=goal.target_date,
            monthly_contribution=pace,
        )
    )
    return GoalView(
        goal=goal,
        evaluation=evaluation,
        current_amount=current,
        monthly_pace=pace,
        contributions=rows,
    )


def create_goal(session: Session, user: User, body: GoalCreate) -> Goal:
    """목표를 만든다. 진행 중인 것이 이미 있으면 422 다.

    같은 조건을 두 겹으로 막는다. 아래 조회는 화면에 이유를 말해 주기 위한 것이고,
    IntegrityError 는 두 요청이 같은 순간에 들어왔을 때의 마지막 방어선이다.
    """
    if active_goal(session, user) is not None:
        raise ApiError(ErrorCode.GOAL_ALREADY_ACTIVE, _ALREADY_ACTIVE, status_code=422)

    row = Goal(
        user_id=user.id,
        title=body.title,
        target_amount=body.target_amount,
        target_date=body.target_date,
        initial_amount=body.initial_amount,
        status=GoalState.ACTIVE,
    )
    session.add(row)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise ApiError(ErrorCode.GOAL_ALREADY_ACTIVE, _ALREADY_ACTIVE, status_code=422) from None
    session.refresh(row)
    return row


def update_goal(session: Session, user: User, goal_id: uuid.UUID, payload: dict) -> Goal:
    """보낸 필드만 고친다. `target_date: null` 은 기한을 지운다는 뜻이다.

    라우터가 `exclude_unset` 으로 걸러 준 것만 온다. 그래서 여기서는 값이 None 인 것도
    '지운다' 로 읽는다. 설정(`app.modules.settings`)과 규칙이 반대이므로 주의한다.
    그쪽은 전부 기본값이 있는 컬럼이라 None 을 넣을 자리가 없다.
    """
    row = _require_goal(session, user, goal_id)
    for field, value in payload.items():
        setattr(row, field, value)
    session.commit()
    session.refresh(row)
    return row


def archive_goal(session: Session, user: User, goal_id: uuid.UUID) -> None:
    """목표를 접는다. 행은 남기고 표시만 지운다.

    상태까지 archived 로 옮긴다. 부분 유니크 인덱스가 `status = 'active' AND
    deleted_at IS NULL` 을 보므로 둘 중 하나만 바꿔도 막히지는 않지만, 지운 목표가
    active 로 남아 있으면 상태만 보고 고른 조회가 그것을 진행 중인 것으로 읽는다.
    """
    row = _require_goal(session, user, goal_id)
    row.status = GoalState.ARCHIVED
    row.deleted_at = datetime.now(UTC)
    session.commit()


def add_contribution(
    session: Session,
    user: User,
    goal_id: uuid.UUID,
    body: GoalContributionCreate,
    today: date,
) -> Goal:
    """모은 돈 한 번을 남긴다. 날짜를 안 주면 사용자 시간대의 오늘이다."""
    row = _require_goal(session, user, goal_id)
    session.add(
        GoalContribution(
            goal_id=row.id,
            occurred_on=body.occurred_on or today,
            amount=body.amount,
            # 직접 적은 것이다. 자산 스냅샷에서 자동으로 끌어오는 자리가 따로 있다.
            source=GoalContributionSource.MANUAL,
        )
    )
    session.commit()
    # 관계는 앞서 읽어 둔 목록을 그대로 들고 있을 수 있다. 방금 더한 줄이 함께 보이게
    # 그 자리만 다시 읽는다. 빠뜨리면 저장 응답의 게이지가 더하기 전 값이다.
    session.refresh(row, attribute_names=["contributions"])
    return row


def remove_contribution(
    session: Session, user: User, goal_id: uuid.UUID, contribution_id: uuid.UUID
) -> None:
    """모은 돈 한 줄을 지운다. 두 번 눌러도 같은 결과여야 하므로 없으면 404 다."""
    goal = _require_goal(session, user, goal_id)
    row = session.get(GoalContribution, contribution_id)
    if row is None or row.goal_id != goal.id or row.deleted_at is not None:
        raise ApiError(ErrorCode.NOT_FOUND, "모은 돈 기록을 찾지 못했어요.", status_code=404)
    row.deleted_at = datetime.now(UTC)
    session.commit()


def _require_goal(session: Session, user: User, goal_id: uuid.UUID) -> Goal:
    row = session.get(Goal, goal_id)
    if row is None or row.user_id != user.id or row.deleted_at is not None:
        raise ApiError(ErrorCode.NOT_FOUND, _NOT_FOUND, status_code=404)
    return row


def _live_contributions(goal: Goal) -> list[GoalContribution]:
    """살아 있는 기여. 최근 날짜가 앞에 온다.

    같은 날에 두 번 적었으면 나중에 적은 것이 위다. 순서를 못 박지 않으면 목록이
    새로 고칠 때마다 뒤바뀌어, 지우려던 줄이 다른 줄로 바뀐다.
    """
    rows = [row for row in goal.contributions if row.deleted_at is None]
    rows.sort(key=lambda row: (row.occurred_on, row.created_at), reverse=True)
    return rows
