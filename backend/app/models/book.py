"""공유 가계부. 개인 거래 표와 따로 둔다(ADR-0042).

개인 조회는 전부 `user_id ==` 로 거른다. 공유 기록을 거래 표에 섞으면 그 조건이 틀린
자리마다 남의 돈이 새거나 내 합계가 흔들린다. 그래서 가계부, 멤버, 초대, 분류, 기록, 정산을
새 표에 둔다.

사람을 가리키는 칸은 멤버 줄을 본다. 사용자 줄을 곧장 보면 한 사람 줄이 지워질 때 상대의
공동 기록까지 CASCADE 로 사라진다. 멤버 줄이 없어져도 기록은 남고 그 칸만 비운다.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Entity, MoneyColumn, SoftDeleteMixin, str_enum_type
from app.domain.books import (
    BOOK_NAME_MAX,
    ENTRY_MEMO_MAX,
    ENTRY_TITLE_MAX,
    MEMBER_NAME_MAX,
    BookKind,
    BookRole,
    SettleRule,
)

__all__ = [
    "Book",
    "BookCategory",
    "BookEntry",
    "BookInvite",
    "BookKind",
    "BookMember",
    "BookRole",
    "SettleRule",
    "Settlement",
]


class Book(Entity, SoftDeleteMixin):
    __tablename__ = "books"
    __table_args__ = (
        CheckConstraint(
            "monthly_budget IS NULL OR monthly_budget > 0", name="monthly_budget_positive"
        ),
    )

    kind: Mapped[BookKind] = mapped_column(
        str_enum_type(BookKind, name="book_kind"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(BOOK_NAME_MAX), nullable=False)
    settle_rule: Mapped[SettleRule] = mapped_column(
        str_enum_type(SettleRule, name="settle_rule"), nullable=False
    )
    # 달마다 같은 예산. 비우면 예산이 없다.
    monthly_budget: Mapped[Decimal | None] = mapped_column(MoneyColumn, nullable=True)
    # 만든 사람의 시간대를 옮겨 적는다. 멤버마다 시간대가 달라도 이번 달은 하나여야 한다.
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class BookMember(Entity):
    __tablename__ = "book_members"
    __table_args__ = (
        # 나간 줄은 남긴다. 한 사람이 지금 멤버인 줄은 가계부마다 하나다.
        Index(
            "uq_book_members_book_id_user_id_active",
            "book_id",
            "user_id",
            unique=True,
            postgresql_where=text("left_at IS NULL"),
            sqlite_where=text("left_at IS NULL"),
        ),
    )

    book_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 다른 멤버 화면에 보이는 이름. 사용자 표에는 이름 칸이 없다.
    display_name: Mapped[str] = mapped_column(String(MEMBER_NAME_MAX), nullable=False)
    role: Mapped[BookRole] = mapped_column(
        str_enum_type(BookRole, name="book_role"), nullable=False
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # 나가거나 내보내지면 찍는다. 그 사람이 적은 기록이 이 줄을 가리키므로 줄은 지우지 않는다.
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 관리자가 내보냈으면 찍는다. 그 뒤에도 살아 있는 링크로는 다시 못 들어온다.
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BookInvite(Entity):
    __tablename__ = "book_invites"
    __table_args__ = (CheckConstraint("join_count >= 0", name="join_count_non_negative"),)

    book_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(16), nullable=False, unique=True)
    created_by_member_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("book_members.id", ondelete="SET NULL"), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # 새 초대가 나오면 앞의 것을 닫는다. 연인·부부 초대는 한 사람이 들어오면 닫는다.
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    max_joins: Mapped[int | None] = mapped_column(Integer, nullable=True)
    join_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))


class BookCategory(Entity, SoftDeleteMixin):
    __tablename__ = "book_categories"
    __table_args__ = (UniqueConstraint("book_id", "name"),)

    book_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    # public/icons/sm 의 파일 이름(확장자 제외).
    icon_key: Mapped[str] = mapped_column(String(64), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)


class BookEntry(Entity, SoftDeleteMixin):
    """같이 쓴 돈 한 줄. 1차는 지출만 받아 종류 칸이 없다."""

    __tablename__ = "book_entries"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        Index("ix_book_entries_book_id_occurred_on", "book_id", "occurred_on"),
    )

    book_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(MoneyColumn, nullable=False)
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("book_categories.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str | None] = mapped_column(String(ENTRY_TITLE_MAX), nullable=True)
    memo: Mapped[str | None] = mapped_column(String(ENTRY_MEMO_MAX), nullable=True)
    # 적는 사람 화면의 날짜 그대로다. 시각으로 두면 멤버마다 시간대가 달라 날이 갈린다.
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    created_by_member_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("book_members.id", ondelete="SET NULL"), nullable=True
    )
    paid_by_member_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("book_members.id", ondelete="SET NULL"), nullable=True
    )
    # 적은 사람이 아닌 멤버가 마지막으로 고쳤으면 그 멤버. 적은 사람이 고쳤으면 비운다.
    updated_by_member_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("book_members.id", ondelete="SET NULL"), nullable=True
    )
    deleted_by_member_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("book_members.id", ondelete="SET NULL"), nullable=True
    )
    # 내 가계부로 옮겨 지웠으면 찍는다. 개인 거래가 이미 생겼으니 되돌리기로 살리지 않는다.
    moved_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 옮기기로 이어진 내 거래. 되돌리기가 새로 만들지 않고 그 거래를 그대로 살린다.
    moved_from_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )
    moved_to_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )


class Settlement(Entity):
    """정산을 끝냈다는 표시. 그때 보낼 돈을 그대로 적어 두어 나중에 바뀌었는지 견준다.

    되돌리면 지우지 않고 undone_at 을 찍는다. 그 달의 지금 상태는 안 되돌린 줄 중 마지막이다.
    """

    __tablename__ = "settlements"
    __table_args__ = (Index("ix_settlements_book_id_period", "book_id", "period"),)

    book_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"), nullable=False
    )
    # 'YYYY-MM', 여행 가계부는 'all'.
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    # [{from, to, amount}] 멤버 id 와 금액을 문자열로 적는다.
    transfers_snapshot: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    done_by_member_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("book_members.id", ondelete="SET NULL"), nullable=True
    )
    done_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    undone_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
