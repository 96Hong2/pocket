"""태그 조회·생성·수정·삭제와 소유 판정.

거래 저장과 반복 지출이 같은 소유 규칙을 본다. 두 곳에 나눠 적으면 한쪽만 고쳐져서,
한 화면에서는 막히고 다른 화면에서는 통과하는 값이 생긴다.

**태그를 지워도 거래는 그대로 둔다.** 거래의 태그까지 지우면 이미 본 지난달 리포트가
나중에 달라진다. 대신 지운 태그는 목록에서 사라지고, 리포트의 그 조각도 사라진다.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.errors import ApiError, ErrorCode
from app.domain.tags import TAGS_PER_USER_MAX, TagKind
from app.models import Tag, Transaction, User
from app.modules.tags.schemas import TagCreate, TagUpdate

__all__ = [
    "create_tag",
    "delete_tag",
    "list_tags",
    "require_owned",
    "update_tag",
    "usage_counts",
]

_NOT_FOUND = "태그를 찾지 못했어요."
_DUPLICATE = "같은 이름의 태그가 이미 있어요."
_TOO_MANY = f"태그는 종류마다 {TAGS_PER_USER_MAX}개까지 만들 수 있어요."


def _key(name: str) -> str:
    """겹침 판정용 열쇠. 띄어쓰기와 대소문자만 다른 이름을 같은 것으로 본다."""
    return "".join(name.split()).casefold()


def list_tags(session: Session, user: User) -> list[Tag]:
    """내 태그 전부. 종류가 섞여 있고 화면이 갈라 쓴다.

    기본 태그는 없다. 처음 온 사람의 목록은 비어 있는 것이 정상이다.
    """
    stmt = (
        select(Tag)
        .where(Tag.user_id == user.id, Tag.deleted_at.is_(None))
        .order_by(Tag.kind, Tag.sort_order, Tag.created_at)
    )
    return list(session.scalars(stmt))


def usage_counts(session: Session, user: User) -> dict[uuid.UUID, int]:
    """태그별로 몇 건이 달려 있나. 지우기 전에 무엇을 잃는지 말하는 데 쓴다."""
    rows = session.execute(
        select(Transaction.tag_id, func.count())
        .where(
            Transaction.user_id == user.id,
            Transaction.deleted_at.is_(None),
            Transaction.tag_id.is_not(None),
        )
        .group_by(Transaction.tag_id)
    ).all()
    return {tag_id: count for tag_id, count in rows if tag_id is not None}


def require_owned(session: Session, user: User, tag_id: uuid.UUID) -> Tag:
    """내 살아 있는 태그만 통과한다. 남의 것도 지운 것도 404 다."""
    row = session.get(Tag, tag_id)
    if row is None or row.user_id != user.id or row.deleted_at is not None:
        raise ApiError(ErrorCode.NOT_FOUND, _NOT_FOUND, status_code=404)
    return row


def require_kind(session: Session, user: User, tag_id: uuid.UUID, kind: TagKind) -> Tag:
    """그 종류의 태그인지까지 본다.

    수입 기록에 지출 태그를 달면 리포트가 번 돈과 쓴 돈을 한 조각에 더한다.
    목록을 갈라 두어도 화면이 잘못 보내면 여기가 마지막 방어선이다.
    """
    row = require_owned(session, user, tag_id)
    if row.kind is not kind:
        raise ApiError(
            ErrorCode.INVALID_REQUEST,
            "지출 태그와 수입 태그는 서로 바꿔 달 수 없어요.",
            status_code=422,
        )
    return row


def _live_of_kind(session: Session, user: User, kind: TagKind) -> list[Tag]:
    return [row for row in list_tags(session, user) if row.kind is kind]


def create_tag(session: Session, user: User, data: TagCreate) -> Tag:
    """태그를 하나 만든다. 같은 종류 안에서 이름이 겹치면 409 다.

    지운 태그의 이름은 다시 쓸 수 있다. 되살리지 않고 새 행을 만든다. 카테고리와 달리
    유니크 제약이 없어 자리를 붙들지 않고, 되살리면 옛 기록이 사라진 태그를 되찾아
    사용자가 지운 것이 조용히 돌아온다.
    """
    siblings = _live_of_kind(session, user, data.kind)
    if len(siblings) >= TAGS_PER_USER_MAX:
        raise ApiError(ErrorCode.INVALID_REQUEST, _TOO_MANY, status_code=422)

    key = _key(data.name)
    if any(_key(row.name) == key for row in siblings):
        raise ApiError(ErrorCode.CONFLICT, _DUPLICATE, status_code=409)

    row = Tag(
        user_id=user.id,
        name=data.name,
        color=data.color,
        kind=data.kind,
        # 새로 만든 것이 맨 뒤에 선다. 앞에 끼우면 손이 기억한 칩 자리가 매번 밀린다.
        sort_order=len(siblings),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def update_tag(session: Session, user: User, tag_id: uuid.UUID, data: TagUpdate) -> Tag:
    """보낸 필드만 바꾼다. 종류는 바꿀 수 없다."""
    row = require_owned(session, user, tag_id)
    payload = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}

    if "name" in payload:
        key = _key(payload["name"])
        taken = any(
            other.id != row.id and _key(other.name) == key
            for other in _live_of_kind(session, user, row.kind)
        )
        if taken:
            raise ApiError(ErrorCode.CONFLICT, _DUPLICATE, status_code=409)
        row.name = payload["name"]
    if "color" in payload:
        row.color = payload["color"]

    session.commit()
    session.refresh(row)
    return row


def delete_tag(session: Session, user: User, tag_id: uuid.UUID) -> None:
    """태그를 지운다. 그 태그로 적어 둔 기록은 태그만 떨어진다.

    거래를 건드리지 않는 이유는 위 모듈 설명에 있다. 이미 지운 것을 또 지우면 아무 일도
    하지 않는다(멱등).
    """
    row = session.get(Tag, tag_id)
    if row is None or row.user_id != user.id:
        raise ApiError(ErrorCode.NOT_FOUND, _NOT_FOUND, status_code=404)
    if row.deleted_at is not None:
        return
    row.deleted_at = datetime.now(UTC)
    session.commit()
