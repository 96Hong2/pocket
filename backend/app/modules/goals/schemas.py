"""목표 API 스키마.

조회와 저장이 같은 모양으로 답한다. 저장 응답을 그대로 캐시에 넣어 화면을 다시 그릴 수
있어야 하고, 그러지 않으면 기여를 하나 더한 직후 게이지와 남은 금액이 한 번 더 왕복할
때까지 옛 값이다.

`GoalStatus` 라는 이름이 도메인 판정 결과(`app.domain.goals.GoalStatus`)와 ORM 의 상태
enum(`app.models.goal.GoalStatus`) 둘 다에 있다. 여기서는 둘을 함께 쓰므로 별칭으로 갈라
어느 쪽인지 읽히게 둔다.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.api.amounts import MAX_AMOUNT, integral_won, ratio_out
from app.domain.goals import GoalStatus as GoalEvaluation
from app.domain.money import Money
from app.models.goal import Goal, GoalContribution, GoalStatus as GoalState

__all__ = [
    "MAX_TITLE",
    "GoalContributionCreate",
    "GoalContributionOut",
    "GoalCreate",
    "GoalOut",
    "GoalPatch",
    "GoalStateOut",
    "to_goal_out",
]

# 제목 길이. 모델 컬럼(String(60))과 같다. 한 줄로 읽히는 만큼이다.
MAX_TITLE = 60


def _title(value: str) -> str:
    """앞뒤 공백을 지운다. 공백만 적은 제목은 제목이 아니라 빈칸이다."""
    trimmed = value.strip()
    if not trimmed:
        raise ValueError("목표 이름을 적어 주세요.")
    return trimmed


class GoalCreate(BaseModel):
    """목표 하나 만들기. 진행 중인 목표가 이미 있으면 서버가 막는다."""

    title: str = Field(min_length=1, max_length=MAX_TITLE)
    # 0원은 받지 않는다. 분모가 0 이면 진행률을 낼 수 없고 목표라고 부를 것도 없다.
    target_amount: Decimal = Field(gt=0, le=MAX_AMOUNT, description="원 단위 정수. 1원 이상")
    # 기한은 선택이다. 없으면 필요 월저축액을 내지 않고 그 줄을 화면에서 뺀다.
    target_date: date | None = None
    # 목표를 만들 때 이미 모아 둔 돈. 안 적으면 0 이다.
    initial_amount: Decimal = Field(default=Decimal(0), ge=0, le=MAX_AMOUNT)

    _clean_title = field_validator("title")(_title)
    _check_target = field_validator("target_amount")(integral_won)
    _check_initial = field_validator("initial_amount")(integral_won)


class GoalPatch(BaseModel):
    """보낸 필드만 고친다.

    **필드를 빼는 것과 null 을 보내는 것이 다르다.** 빼면 그대로 두고, `target_date: null`
    은 기한을 지운다는 뜻이다. 기한이 있는 목표에서 기한만 없애는 길이 그것뿐이다.
    """

    title: str | None = Field(default=None, min_length=1, max_length=MAX_TITLE)
    target_amount: Decimal | None = Field(default=None, gt=0, le=MAX_AMOUNT)
    target_date: date | None = None
    initial_amount: Decimal | None = Field(default=None, ge=0, le=MAX_AMOUNT)

    @field_validator("title")
    @classmethod
    def _clean_title(cls, value: str | None) -> str | None:
        return None if value is None else _title(value)

    _check_target = field_validator("target_amount")(integral_won)
    _check_initial = field_validator("initial_amount")(integral_won)


class GoalContributionCreate(BaseModel):
    """모은 돈 한 번. 날짜를 안 주면 사용자 시간대의 오늘이다."""

    amount: Decimal = Field(gt=0, le=MAX_AMOUNT, description="원 단위 정수. 1원 이상")
    occurred_on: date | None = None

    _check_amount = field_validator("amount")(integral_won)


class GoalContributionOut(BaseModel):
    """모은 돈 한 줄. 최근 것이 앞에 온다."""

    id: uuid.UUID
    occurred_on: date
    amount: Decimal


class GoalOut(BaseModel):
    """목표 화면과 홈 카드가 그리는 것 전부.

    계산값은 전부 `app.domain.goals` 가 낸다. 화면은 이 값을 그대로 그리고,
    `목표 - 모은 돈` 처럼 스스로 다시 계산하지 않는다.
    """

    id: uuid.UUID
    title: str
    target_amount: Decimal
    # 없으면 기한이 없는 목표다. 그때 months_left·required_monthly_saving 도 null 이다.
    target_date: date | None
    initial_amount: Decimal
    status: GoalState

    # 처음 적어 둔 금액 + 살아 있는 기여 합.
    current_amount: Decimal
    # 목표까지 남은 금액. 넘겼으면 0 이다(음수로 두지 않는다).
    remaining: Decimal
    # 게이지 비율. 0~1 이고 목표를 넘겨도 1 에서 멈춘다.
    progress: Decimal
    is_achieved: bool
    # 기한이 지났는데 아직 못 닿았나. 탓하는 말은 화면이 만들지 않는다.
    is_overdue: bool
    # 이번 달을 포함해 기한까지 남은 달 수. 기한이 없으면 null, 지났으면 0.
    months_left: int | None
    # 기한까지 닿으려면 매달 얼마씩. 기한이 없거나 이미 닿았으면 null.
    required_monthly_saving: Decimal | None
    # 지금 페이스로 몇 달 뒤에 닿나. 기여가 없으면 null 이고 그때 화면은 예상을 적지 않는다.
    eta_months: int | None
    # 한 달에 얼마씩 모으고 있나. 기여가 없으면 null.
    monthly_pace: Decimal | None
    contributions: list[GoalContributionOut]


class GoalStateOut(BaseModel):
    """목표 조회·저장 응답.

    진행 중인 목표가 없는 것은 정상 상태다. 404 가 아니라 200 에 `goal: null` 로 답한다.
    """

    goal: GoalOut | None


def _amount(value: Money | None) -> Decimal | None:
    return value.amount if value is not None else None


def to_goal_out(
    goal: Goal,
    evaluation: GoalEvaluation,
    *,
    current_amount: Money,
    monthly_pace: Money | None,
    contributions: Sequence[GoalContribution],
) -> GoalOut:
    """도메인 판정 결과를 응답 형태로 옮긴다. 여기서 숫자를 새로 만들지 않는다."""
    return GoalOut(
        id=goal.id,
        title=goal.title,
        target_amount=goal.target_amount,
        target_date=goal.target_date,
        initial_amount=goal.initial_amount,
        status=goal.status,
        current_amount=current_amount.amount,
        remaining=evaluation.remaining.amount,
        # 자릿수만 맞춘다. 값은 도메인이 이미 0~1 로 만들어 두므로 없을 수가 없다.
        progress=ratio_out(evaluation.progress) or Decimal(0),
        is_achieved=evaluation.is_achieved,
        is_overdue=evaluation.is_overdue,
        months_left=evaluation.months_left,
        required_monthly_saving=_amount(evaluation.required_monthly_saving),
        eta_months=evaluation.eta_months,
        monthly_pace=_amount(monthly_pace),
        contributions=[
            GoalContributionOut(id=row.id, occurred_on=row.occurred_on, amount=row.amount)
            for row in contributions
        ],
    )
