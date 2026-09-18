"""태그. 카테고리와 다른 축으로 기록을 묶는다."""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Entity, SoftDeleteMixin, str_enum_type

# 색과 종류의 정본은 domain 이다. 여기서 값을 다시 적지 않는다.
from app.domain.tags import TagColor, TagKind

__all__ = ["Tag", "TagColor", "TagKind"]


class Tag(Entity, SoftDeleteMixin):
    __tablename__ = "tags"
    __table_args__ = (
        # 지출과 수입은 서로 다른 목록이라 이름이 겹쳐도 된다. 같은 종류 안에서만 막는다.
        # 지운 태그의 이름은 다시 쓸 수 있어야 하므로 deleted_at 도 키에 넣는다.
        Index("ix_tags_user_id_kind", "user_id", "kind"),
    )

    # 기본 태그는 없다. 태그는 그 사람이 스스로 만드는 묶음이다.
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    color: Mapped[TagColor] = mapped_column(
        str_enum_type(TagColor, name="tag_color"),
        nullable=False,
        server_default=TagColor.SAGE.value,
    )
    kind: Mapped[TagKind] = mapped_column(
        str_enum_type(TagKind, name="tag_kind"),
        nullable=False,
        server_default=TagKind.EXPENSE.value,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
