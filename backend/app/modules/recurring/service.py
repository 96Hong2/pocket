"""반복 지출 조회·생성·수정·삭제와 '곧 나갈 돈' 판정.

**거래를 여기서 만들지 않는다.** 예고를 기록으로 옮기는 것은 거래 저장 경로 하나뿐이고
(`modules/transactions/service.create_transaction`), 이 모듈은 그 뒤에 "적었다" 는 표시만
남긴다. 저장 규칙이 둘이 되면 한쪽만 예산·피드백을 갱신한다.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import ApiError, ErrorCode
from app.domain.recurring import next_due_on, remind_on, should_ask
from app.domain.tags import TagKind
from app.models import RecurringExpense, User
from app.modules.categories import service as categories
from app.modules.notifications.schemas import parse_hhmm
from app.modules.recurring.schemas import RecurringCreate, RecurringUpdate
from app.modules.tags import service as tags

__all__ = [
    "PushWindow",
    "create_recurring",
    "delete_recurring",
    "dismiss_recurring",
    "due_date_for",
    "due_today",
    "list_recurring",
    "mark_recorded",
    "require_owned",
]

_NOT_FOUND = "반복 지출을 찾지 못했어요."

# 한 사람이 걸어 둘 수 있는 수. 목록이 길어지면 홈 카드가 홈을 잡아먹는다.
RECURRING_MAX = 20


def list_recurring(session: Session, user: User) -> list[RecurringExpense]:
    """내 반복 지출 전부. 꺼 둔 것도 함께 준다. 화면이 흐리게 그린다."""
    stmt = (
        select(RecurringExpense)
        .where(RecurringExpense.user_id == user.id, RecurringExpense.deleted_at.is_(None))
        .order_by(RecurringExpense.day_of_month, RecurringExpense.created_at)
    )
    return list(session.scalars(stmt))


def require_owned(session: Session, user: User, row_id: uuid.UUID) -> RecurringExpense:
    row = session.get(RecurringExpense, row_id)
    if row is None or row.user_id != user.id or row.deleted_at is not None:
        raise ApiError(ErrorCode.NOT_FOUND, _NOT_FOUND, status_code=404)
    return row


def _check_links(session: Session, user: User, payload: dict) -> None:
    """분류와 태그가 내 것인지 본다. 남의 id 를 보내면 404 다.

    태그는 지출 종류여야 한다. 반복 지출로 만든 기록은 늘 지출이라, 수입 태그를 달면
    저장하는 순간 거래 저장 경로가 거절한다. 그때는 이미 설정 화면을 떠난 뒤다.
    """
    category_id = payload.get("category_id")
    if category_id is not None:
        categories.require_owned(session, user, category_id)
    tag_id = payload.get("tag_id")
    if tag_id is not None:
        tags.require_kind(session, user, tag_id, TagKind.EXPENSE)


def create_recurring(session: Session, user: User, data: RecurringCreate) -> RecurringExpense:
    if len(list_recurring(session, user)) >= RECURRING_MAX:
        raise ApiError(
            ErrorCode.INVALID_REQUEST,
            f"반복 지출은 {RECURRING_MAX}개까지 걸어 둘 수 있어요.",
            status_code=422,
        )
    payload = data.model_dump()
    _check_links(session, user, payload)

    row = RecurringExpense(
        user_id=user.id,
        name=data.name,
        amount=data.amount,
        day_of_month=data.day_of_month,
        category_id=data.category_id,
        tag_id=data.tag_id,
        payment_method=data.payment_method,
        remind_at=None if data.remind_at is None else parse_hhmm(data.remind_at),
        remind_lead_days=data.remind_lead_days,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def update_recurring(
    session: Session, user: User, row_id: uuid.UUID, data: RecurringUpdate
) -> RecurringExpense:
    """보낸 필드만 고친다. 분류·태그·결제수단만 null 이 '지운다' 다."""
    row = require_owned(session, user, row_id)
    payload = data.model_dump(exclude_unset=True)

    for field in ("name", "amount", "day_of_month", "is_active", "remind_lead_days"):
        if field in payload and payload[field] is None:
            raise ApiError(
                ErrorCode.INVALID_REQUEST, f"{field} 는 비울 수 없어요.", status_code=422
            )

    _check_links(session, user, payload)

    # 시각은 화면이 `HH:MM` 로 보낸다. 모델에는 time 으로 앉는다.
    if "remind_at" in payload:
        raw = payload.pop("remind_at")
        row.remind_at = None if raw is None else parse_hhmm(raw)

    for field, value in payload.items():
        if value is None and field not in {"category_id", "tag_id", "payment_method"}:
            continue
        setattr(row, field, value)

    # 날짜나 금액을 고쳤으면 「이번 달은 됐어요」 는 다른 예고에 대한 대답이다. 지운다.
    if {"day_of_month", "amount", "name"} & payload.keys():
        row.dismissed_on = None

    session.commit()
    session.refresh(row)
    return row


def delete_recurring(session: Session, user: User, row_id: uuid.UUID) -> None:
    """예고를 지운다. 그 예고로 이미 적은 거래는 그대로 둔다. 멱등이다."""
    row = session.get(RecurringExpense, row_id)
    if row is None or row.user_id != user.id:
        raise ApiError(ErrorCode.NOT_FOUND, _NOT_FOUND, status_code=404)
    if row.deleted_at is not None:
        return
    row.deleted_at = datetime.now(UTC)
    session.commit()


def due_today(session: Session, user: User, today: date) -> list[tuple[RecurringExpense, date]]:
    """오늘 물어볼 것들과 그 지출일. 가까운 날부터.

    꺼 둔 것은 빼고, 이미 적었거나 이번 회차를 넘긴 것도 뺀다. 판정 규칙은 domain 이
    갖고 있다(`domain/recurring.should_ask`).
    """
    due: list[tuple[RecurringExpense, date]] = []
    for row in list_recurring(session, user):
        if not row.is_active:
            continue
        day = should_ask(
            today,
            row.day_of_month,
            lead_days=row.remind_lead_days,
            last_recorded_on=row.last_recorded_on,
            dismissed_on=row.dismissed_on,
        )
        if day is not None:
            due.append((row, day))
    return sorted(due, key=lambda item: (item[1], item[0].created_at))


def due_date_for(row: RecurringExpense, today: date) -> date:
    """지금 적을 차례인 지출일. 차례가 아니면 422 다.

    막지 않으면 아무 때나 불러 **다음 달 날짜로** 거래가 생긴다. 달력에 아직 오지 않은
    지출이 앉아 있고, 이번 달 합계는 그대로라 사용자는 무슨 일이 났는지 알 수 없다.
    """
    day = should_ask(
        today,
        row.day_of_month,
        lead_days=row.remind_lead_days,
        last_recorded_on=row.last_recorded_on,
        dismissed_on=row.dismissed_on,
    )
    if day is None:
        raise ApiError(ErrorCode.INVALID_REQUEST, "지금은 적을 차례가 아니에요.", status_code=422)
    return day


def mark_recorded(session: Session, user: User, row_id: uuid.UUID, on: date) -> RecurringExpense:
    """이번 회차는 적었다고 남긴다. 거래를 만든 쪽이 성공한 뒤에 부른다."""
    row = require_owned(session, user, row_id)
    row.last_recorded_on = on
    session.commit()
    session.refresh(row)
    return row


def dismiss_recurring(
    session: Session, user: User, row_id: uuid.UUID, on: date
) -> RecurringExpense:
    """이번 회차는 묻지 않는다. 다음 달에는 다시 묻는다."""
    row = require_owned(session, user, row_id)
    row.dismissed_on = on
    session.commit()
    session.refresh(row)
    return row


@dataclass(frozen=True, slots=True)
class PushWindow:
    """오늘 이 예고를 몇 시에 알릴까. 알릴 것이 없으면 만들지 않는다."""

    row: RecurringExpense
    due_on: date
    at: time


def push_windows(
    session: Session, user: User, today: date, *, fallback_at: time
) -> list[PushWindow]:
    """오늘이 알림 날인 예고들과 그 시각.

    `due_today` 와 다르다. 그쪽은 **홈 카드**가 며칠 동안 서 있을지를 보고, 이쪽은
    **푸시를 오늘 보낼지**를 본다. 전날 알림으로 걸어 둔 것은 지출일 전날 하루만 울리고,
    그날은 카드만 서 있다. 알림이 이틀 연속 오면 그건 조르는 것이다.

    시각을 안 정한 예고는 기록 알림에 정해 둔 시각(`fallback_at`)을 따른다.
    """
    windows: list[PushWindow] = []
    for row in list_recurring(session, user):
        if not row.is_active:
            continue
        due = should_ask(
            today,
            row.day_of_month,
            lead_days=row.remind_lead_days,
            last_recorded_on=row.last_recorded_on,
            dismissed_on=row.dismissed_on,
        )
        if due is None or remind_on(due, row.remind_lead_days) != today:
            continue
        windows.append(PushWindow(row=row, due_on=due, at=row.remind_at or fallback_at))
    return sorted(windows, key=lambda item: (item.at, item.row.created_at))


def next_dates(row: RecurringExpense, today: date) -> tuple[date, date]:
    """다음 지출일과 그 회차를 알릴 날. 화면이 굵게 적는 값이다."""
    due = next_due_on(today, row.day_of_month)
    return due, remind_on(due, row.remind_lead_days)
