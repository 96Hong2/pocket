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
    Numeric,
    String,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Entity, LargeMoneyColumn, SoftDeleteMixin, str_enum_type

# 자산 그룹과 장부 줄 종류의 정의는 domain 한 곳에 있다.
from app.domain.asset_ledger import EntrySide, InvestKind
from app.domain.assets import AssetGroup

__all__ = [
    "AssetEntry",
    "AssetGroup",
    "AssetItem",
    "AssetSnapshot",
    "AssetSource",
    "EntrySide",
    "InvestKind",
]

# 수량. 코인 0.003개, 소수점 주식까지 받는다.
QuantityColumn = Numeric(20, 8)


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
    __table_args__ = (
        CheckConstraint("amount >= 0", name="amount_non_negative"),
        Index("uq_asset_items_snapshot_id_item_key", "snapshot_id", "item_key", unique=True),
    )

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

    # 스냅샷이 바뀌어도 같은 항목을 가리키는 키. 거래와 장부가 이 키로 항목을 찾는다.
    # 배포 중 옛 리비전이 만든 행만 비어 있을 수 있다.
    item_key: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    # 투자 그룹의 종류. 수량 종목인지 금액 종목인지가 여기서 갈린다.
    kind: Mapped[InvestKind | None] = mapped_column(
        str_enum_type(InvestKind, name="invest_kind"), nullable=True
    )
    monthly_amount: Mapped[Decimal | None] = mapped_column(LargeMoneyColumn, nullable=True)
    # 아래 셋은 장부를 접은 결과의 사본이다. 정본은 asset_entries 다.
    quantity: Mapped[Decimal | None] = mapped_column(QuantityColumn, nullable=True)
    cost_basis: Mapped[Decimal | None] = mapped_column(LargeMoneyColumn, nullable=True)
    # 지금 1주 가격(수량 종목). 금액 종목은 amount 가 지금 금액이다.
    unit_price: Mapped[Decimal | None] = mapped_column(LargeMoneyColumn, nullable=True)
    # 지금 가격이나 지금 금액을 적은 날. 비어 있으면 평가 수익률을 내지 않는다.
    price_noted_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    snapshot: Mapped[AssetSnapshot] = relationship(back_populates="items")


class AssetEntry(Entity, SoftDeleteMixin):
    """자산 장부 한 줄. 항목 값은 이 줄들을 들어온 순서(created_at)로 접은 결과다."""

    __tablename__ = "asset_entries"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="amount_non_negative"),
        Index("ix_asset_entries_user_id_item_key", "user_id", "item_key"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    item_key: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    side: Mapped[EntrySide] = mapped_column(
        str_enum_type(EntrySide, name="asset_entry_side"), nullable=False
    )
    quantity: Mapped[Decimal | None] = mapped_column(QuantityColumn, nullable=True)
    # buy 는 넣은 돈(부채는 갚은 돈), sell 은 받은 돈, set 은 잔액이나 지금 금액.
    amount: Mapped[Decimal] = mapped_column(LargeMoneyColumn, nullable=False)
    # set 줄만 쓴다. 금액 종목과 수량 종목의 넣은 돈.
    cost_basis: Mapped[Decimal | None] = mapped_column(LargeMoneyColumn, nullable=True)
    # 거래에서 온 줄. 손 수정과 시작 값 줄은 비어 있다.
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"), nullable=True, index=True
    )
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
