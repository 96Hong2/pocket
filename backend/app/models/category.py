"""카테고리. user_id 가 비면 모든 사용자에게 보이는 기본 카테고리다."""

from __future__ import annotations

import uuid
from enum import StrEnum

from sqlalchemy import ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Entity, SoftDeleteMixin, str_enum_type


class CategoryKind(StrEnum):
    EXPENSE = "expense"
    INCOME = "income"
    TRANSFER = "transfer"


class Category(Entity, SoftDeleteMixin):
    __tablename__ = "categories"
    __table_args__ = (
        # NULL 을 같은 값으로 봐야 기본 카테고리 이름도 중복되지 않는다.
        Index(
            "uq_categories_user_id_name",
            "user_id",
            "name",
            unique=True,
            postgresql_nulls_not_distinct=True,
        ),
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    kind: Mapped[CategoryKind] = mapped_column(
        str_enum_type(CategoryKind, name="category_kind"),
        nullable=False,
        server_default=CategoryKind.EXPENSE.value,
    )
    # public/icons/sm 의 파일 이름 (확장자 제외).
    icon_key: Mapped[str] = mapped_column(String(64), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
