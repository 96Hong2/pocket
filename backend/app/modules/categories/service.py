"""카테고리 조회와 소유 판정.

거래 저장과 카테고리 예산 저장이 같은 소유 규칙을 본다. 두 곳에 나눠 적으면
한쪽만 고쳐져서, 한 화면에서는 막히고 다른 화면에서는 통과하는 값이 생긴다.
"""

from __future__ import annotations

import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.errors import ApiError, ErrorCode
from app.models import Category, User

__all__ = ["list_categories", "require_owned"]


def list_categories(session: Session, user: User) -> list[Category]:
    """기본 카테고리와 내 카테고리를 함께 준다. 남의 것은 보이지 않는다."""
    stmt = (
        select(Category)
        .where(
            Category.deleted_at.is_(None),
            # NULL 은 IN 으로 못 잡는다. 기본 카테고리(user_id NULL)를 놓치지 않게 따로 쓴다.
            or_(Category.user_id == user.id, Category.user_id.is_(None)),
        )
        .order_by(Category.sort_order, Category.name)
    )
    return list(session.scalars(stmt))


def require_owned(session: Session, user: User, category_id: uuid.UUID | None) -> None:
    """내 카테고리이거나 기본 카테고리(user_id NULL)여야 한다. None 은 '분류 없음'이라 통과."""
    if category_id is None:
        return
    found = session.scalar(
        select(Category.id).where(
            Category.id == category_id,
            Category.deleted_at.is_(None),
            # NULL 은 IN 으로 못 잡는다. 기본 카테고리(user_id NULL)를 놓치지 않게 따로 쓴다.
            or_(Category.user_id == user.id, Category.user_id.is_(None)),
        )
    )
    if found is None:
        raise ApiError(ErrorCode.INVALID_CATEGORY, "카테고리를 찾지 못했어요.", status_code=422)
