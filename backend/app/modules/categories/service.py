"""카테고리 조회."""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Category, User

__all__ = ["list_categories"]


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
