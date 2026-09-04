"""사용자가 고친 분류를 기억하는 개인 규칙. 전역 사전보다 우선한다."""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Entity, SoftDeleteMixin


class MerchantRule(Entity, SoftDeleteMixin):
    __tablename__ = "merchant_rules"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "merchant_normalized",
            name="uq_merchant_rules_user_id_merchant_normalized",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    merchant_normalized: Mapped[str] = mapped_column(String(120), nullable=False)
    # 화면에 그대로 보여 줄 표기. 정규화하면 띄어쓰기와 대소문자가 사라져 읽기 나쁘다.
    merchant: Mapped[str | None] = mapped_column(String(120), nullable=True)
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 규칙이 실제로 몇 번 맞았는지. 자주 쓰는 카테고리를 앞에 배치할 때 쓴다.
    applied_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
