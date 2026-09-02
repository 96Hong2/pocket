"""거래. 모든 입력 경로가 이 한 형태로 수렴한다."""

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
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Entity, Money, SoftDeleteMixin, str_enum_type


class TransactionType(StrEnum):
    EXPENSE = "expense"
    INCOME = "income"
    TRANSFER = "transfer"
    REFUND = "refund"


class TransactionSource(StrEnum):
    KEYPAD = "keypad"
    NL = "nl"
    SCREENSHOT = "screenshot"
    RECEIPT = "receipt"
    ASSET_SCREENSHOT = "asset_screenshot"
    NO_SPEND = "no_spend"


class Transaction(Entity, SoftDeleteMixin):
    __tablename__ = "transactions"
    __table_args__ = (
        # 금액은 항상 양수. 무지출일 표시만 0 을 허용한다.
        CheckConstraint(
            "amount > 0 OR source = 'no_spend'",
            name="amount_positive",
        ),
        CheckConstraint(
            "confidence >= 0 AND confidence <= 1",
            name="confidence_range",
        ),
        Index("ix_transactions_user_id_occurred_at", "user_id", "occurred_at"),
        Index("ix_transactions_user_id_type_occurred_at", "user_id", "type", "occurred_at"),
        Index("ix_transactions_user_id_fingerprint", "user_id", "fingerprint"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    type: Mapped[TransactionType] = mapped_column(
        str_enum_type(TransactionType, name="transaction_type"), nullable=False
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    merchant: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # 중복 판정과 자동 분류 규칙이 맞춰 보는 정규화된 상호명.
    merchant_normalized: Mapped[str | None] = mapped_column(String(120), nullable=True)

    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )

    source: Mapped[TransactionSource] = mapped_column(
        str_enum_type(TransactionSource, name="transaction_source"), nullable=False
    )
    # 0~1. 키패드처럼 사용자가 직접 넣은 값은 1.0.
    confidence: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("1.0"))

    # 거래목록·리포트에는 남고 예산 계산에서만 빠진다.
    excluded_from_budget: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )

    # sha256(날짜 | 금액 | 정규화 상호 | 종류). 캡처 중복 후보를 찾는 데 쓴다.
    fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)

    refund_of_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )
    import_batch_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("import_batches.id", ondelete="SET NULL"), nullable=True, index=True
    )
