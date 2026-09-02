"""캡처·영수증·줄글 일괄 입력의 검토 단위.

원본 이미지와 OCR/LLM 원문은 저장하지 않는다. 구조화된 후보만 남긴다.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Entity, Money, str_enum_type
from app.models.transaction import TransactionSource, TransactionType


class ImportBatchStatus(StrEnum):
    PENDING = "pending"
    ANALYZING = "analyzing"
    READY = "ready"
    COMMITTED = "committed"
    FAILED = "failed"


class ImportBatch(Entity):
    __tablename__ = "import_batches"
    __table_args__ = (Index("ix_import_batches_user_id_created_at", "user_id", "created_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    source: Mapped[TransactionSource] = mapped_column(
        str_enum_type(TransactionSource, name="transaction_source"), nullable=False
    )
    status: Mapped[ImportBatchStatus] = mapped_column(
        str_enum_type(ImportBatchStatus, name="import_batch_status"),
        nullable=False,
        server_default=ImportBatchStatus.PENDING.value,
    )
    # 화면에 몇 건 인식됐고 몇 건 저장됐는지 보여주는 값.
    detected_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    committed_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    # 재시도 화면에서 무엇이 실패했는지 구분하는 코드. 원문은 담지 않는다.
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    candidates: Mapped[list[ImportCandidate]] = relationship(
        back_populates="batch",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ImportCandidate.sort_order",
    )


class ImportCandidate(Entity):
    __tablename__ = "import_candidates"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="confidence_range"),
    )

    import_batch_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("import_batches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    type: Mapped[TransactionType] = mapped_column(
        str_enum_type(TransactionType, name="transaction_type"), nullable=False
    )
    merchant: Mapped[str | None] = mapped_column(String(120), nullable=True)
    merchant_normalized: Mapped[str | None] = mapped_column(String(120), nullable=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    confidence: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("1.0"))
    fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # 기존 거래와 정확히 일치하는 중복 후보. 기본 미선택으로 보여준다.
    is_duplicate: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    is_selected: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    # 저장을 마치면 만들어진 거래를 가리킨다.
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )

    batch: Mapped[ImportBatch] = relationship(back_populates="candidates")
