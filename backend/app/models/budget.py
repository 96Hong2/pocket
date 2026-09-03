"""예산. 기간 단위 전체 예산과 선택적인 카테고리 예산."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Entity, MoneyColumn, SoftDeleteMixin


class Budget(Entity, SoftDeleteMixin):
    __tablename__ = "budgets"
    __table_args__ = (
        # 자동 이어쓰기가 지운 기간을 다시 만들지 않도록, 삭제된 행도 자리를 지킨다.
        UniqueConstraint("user_id", "period_start", name="uq_budgets_user_id_period_start"),
        CheckConstraint("period_end >= period_start", name="period_order"),
        CheckConstraint("amount >= 0", name="amount_non_negative"),
        Index("ix_budgets_user_id_period_start", "user_id", "period_start"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(MoneyColumn, nullable=False)
    # 직전 기간에서 자동 복사된 예산이면 true. 비차단 안내 배너를 띄우는 근거.
    is_auto_carried: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )

    category_budgets: Mapped[list[CategoryBudget]] = relationship(
        back_populates="budget",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class CategoryBudget(Entity, SoftDeleteMixin):
    __tablename__ = "category_budgets"
    __table_args__ = (
        UniqueConstraint(
            "budget_id", "category_id", name="uq_category_budgets_budget_id_category_id"
        ),
        CheckConstraint("amount >= 0", name="amount_non_negative"),
    )

    budget_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[Decimal] = mapped_column(MoneyColumn, nullable=False)

    budget: Mapped[Budget] = relationship(back_populates="category_budgets")
