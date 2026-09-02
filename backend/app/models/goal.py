"""목표와 목표 기여액. 진행률은 출처가 분명한 값으로만 계산한다."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Entity, Money, SoftDeleteMixin, str_enum_type


class GoalStatus(StrEnum):
    ACTIVE = "active"
    ACHIEVED = "achieved"
    ARCHIVED = "archived"


class GoalContributionSource(StrEnum):
    MANUAL = "manual"
    ASSET_SNAPSHOT = "asset_snapshot"


class Goal(Entity, SoftDeleteMixin):
    __tablename__ = "goals"
    __table_args__ = (
        CheckConstraint("target_amount > 0", name="target_amount_positive"),
        CheckConstraint("initial_amount >= 0", name="initial_amount_non_negative"),
        # 다중 목표는 범위 밖이므로 진행 중인 목표를 하나로 묶는다.
        Index(
            "uq_goals_user_id_active",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'active' AND deleted_at IS NULL"),
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(60), nullable=False)
    target_amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # 목표를 만들 때 이미 모아둔 금액.
    initial_amount: Mapped[Decimal] = mapped_column(Money, nullable=False, server_default=text("0"))
    status: Mapped[GoalStatus] = mapped_column(
        str_enum_type(GoalStatus, name="goal_status"),
        nullable=False,
        server_default=GoalStatus.ACTIVE.value,
    )

    contributions: Mapped[list[GoalContribution]] = relationship(
        back_populates="goal",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class GoalContribution(Entity, SoftDeleteMixin):
    __tablename__ = "goal_contributions"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        Index("ix_goal_contributions_goal_id_occurred_on", "goal_id", "occurred_on"),
    )

    goal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("goals.id", ondelete="CASCADE"), nullable=False
    )
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    source: Mapped[GoalContributionSource] = mapped_column(
        str_enum_type(GoalContributionSource, name="goal_contribution_source"),
        nullable=False,
        server_default=GoalContributionSource.MANUAL.value,
    )

    goal: Mapped[Goal] = relationship(back_populates="contributions")
