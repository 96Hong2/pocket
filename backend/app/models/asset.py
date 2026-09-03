"""자산관리. 정확한 계좌관리가 아니라 시점별 대략 스냅샷이다."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Entity, LargeMoneyColumn, SoftDeleteMixin, str_enum_type

# 자산 그룹의 정의는 domain 한 곳에 있다.
from app.domain.assets import AssetGroup

__all__ = ["AssetGroup", "AssetItem", "AssetSnapshot", "AssetSource"]


class AssetSource(StrEnum):
    MANUAL = "manual"
    SCREENSHOT = "screenshot"


class AssetSnapshot(Entity, SoftDeleteMixin):
    __tablename__ = "asset_snapshots"
    __table_args__ = (Index("ix_asset_snapshots_user_id_effective_on", "user_id", "effective_on"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # 사용자가 확인한 기준일. 순자산 추이는 이 날짜로 정렬한다.
    effective_on: Mapped[date] = mapped_column(Date, nullable=False)
    source: Mapped[AssetSource] = mapped_column(
        str_enum_type(AssetSource, name="asset_source"),
        nullable=False,
        server_default=AssetSource.MANUAL.value,
    )

    items: Mapped[list[AssetItem]] = relationship(
        back_populates="snapshot",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="AssetItem.sort_order",
    )


class AssetItem(Entity, SoftDeleteMixin):
    __tablename__ = "asset_items"
    __table_args__ = (CheckConstraint("amount >= 0", name="amount_non_negative"),)

    snapshot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("asset_snapshots.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 부채도 양수로 저장한다. 순자산에서 빼는 것은 group 이 결정한다.
    # group 은 SQL 예약어라 컬럼명만 asset_group 으로 둔다.
    group: Mapped[AssetGroup] = mapped_column(
        "asset_group", str_enum_type(AssetGroup, name="asset_group"), nullable=False
    )
    # 금융사·항목 표시명. 계좌·카드번호는 저장하지 않는다.
    label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    amount: Mapped[Decimal] = mapped_column(LargeMoneyColumn, nullable=False)
    # 캡처 인식값의 신뢰도. 직접 입력이면 1.0.
    confidence: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("1.0"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    snapshot: Mapped[AssetSnapshot] = relationship(back_populates="items")
