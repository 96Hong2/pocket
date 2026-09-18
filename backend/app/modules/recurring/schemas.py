"""반복 지출 API 스키마.

날짜는 '매달 며칠' 하나만 받는다. 요일·주기·종료일까지 받으면 설정 화면이 폼이 되고,
그걸 채우느니 매달 손으로 적는 쪽이 빠르다.

**31일을 그대로 받는다.** 2월이 없는 달에는 그 달 마지막 날로 당겨 본다. 받는 자리에서
28일로 깎으면 1월 31일에 나가는 돈이 1월 28일로 적힌다.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator

from app.api.amounts import MAX_AMOUNT, integral_won
from app.domain.aggregation import PaymentMethod

__all__ = [
    "RecurringCreate",
    "RecurringDueOut",
    "RecurringListOut",
    "RecurringOut",
    "RecurringUpdate",
]

RecurringName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]


class RecurringOut(BaseModel):
    id: uuid.UUID
    name: str
    amount: Decimal
    day_of_month: int
    category_id: uuid.UUID | None
    tag_id: uuid.UUID | None
    payment_method: PaymentMethod | None
    is_active: bool
    # 이 예고로 마지막에 기록을 만든 날. 아직 한 번도 안 만들었으면 null.
    last_recorded_on: date | None


class RecurringDueOut(BaseModel):
    """곧 나갈 돈 한 줄. 홈 카드가 이 목록으로 그린다.

    **비어 있는 것이 정상이다.** 반복 지출을 안 적어 둔 사람에게는 아무것도 안 뜬다.
    """

    id: uuid.UUID
    name: str
    amount: Decimal
    # 실제로 나가는 날. 31일짜리가 2월이면 28·29일로 당겨진 값이다.
    due_on: date
    category_id: uuid.UUID | None
    tag_id: uuid.UUID | None
    payment_method: PaymentMethod | None
    # 오늘이 그날인가. 전날이면 false 다. 카드 문구가 이 값으로 갈린다.
    is_today: bool


class RecurringListOut(BaseModel):
    items: list[RecurringOut]


class RecurringCreate(BaseModel):
    name: RecurringName
    amount: Decimal = Field(gt=0, le=MAX_AMOUNT, description="원 단위 정수")
    day_of_month: int = Field(ge=1, le=31)
    category_id: uuid.UUID | None = None
    tag_id: uuid.UUID | None = None
    payment_method: PaymentMethod | None = None

    _check_amount = field_validator("amount")(integral_won)


class RecurringUpdate(BaseModel):
    """보낸 필드만 고친다.

    **분류·태그·결제수단은 null 이 '지운다' 다.** 골랐다가 되무를 수 있어야 한다.
    이름·금액·날짜·켜짐은 비워 둘 자리가 없어 null 을 보내면 422 다.
    """

    name: RecurringName | None = None
    amount: Decimal | None = Field(default=None, gt=0, le=MAX_AMOUNT)
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    category_id: uuid.UUID | None = None
    tag_id: uuid.UUID | None = None
    payment_method: PaymentMethod | None = None
    is_active: bool | None = None

    _check_amount = field_validator("amount")(integral_won)
