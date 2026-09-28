"""공유 가계부

가계부, 멤버, 초대, 가계부 분류, 공유 기록, 정산 여섯 표를 한 판에 올린다.
서로를 외래키로 가리켜서 따로 올리면 중간 판에서 가리킬 곳이 없다.

개인 거래 표(`transactions`)에는 손대지 않는다. 공유 기록을 거래 표에 섞지 않고 새 표에 둔
이유는 ADR-0042 에 있다. 개인 조회의 `user_id ==` 조건 예순네 곳을 하나도 안 고쳐도 된다.

사람을 가리키는 칸은 사용자 줄이 아니라 멤버 줄을 본다(SET NULL). 한 사람 줄이 지워질 때
상대의 공동 기록까지 CASCADE 로 사라지면 안 된다.

지금 멤버인 줄이 가계부마다 한 사람에 하나라는 것은 부분 unique 인덱스로 건다. 나간 줄은
남기므로 전체 unique 로 걸면 나갔다 다시 들어온 사람이 막힌다. sqlite 스모크에서도 부분
인덱스가 되도록 조건을 두 방언에 다 준다.

CHECK 이름은 `op.f()` 로 감싼다. 안 감싸면 이름 규칙이 한 번 더 붙어
`ck_books_ck_books_...` 가 되고, 모델과 이름이 어긋난다.

Revision ID: d6e1a93b7c20
Revises: c8d25f13ab97
Create Date: 2026-09-28 14:00:00.000000+09:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d6e1a93b7c20"
down_revision: Union[str, Sequence[str], None] = "c8d25f13ab97"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _entity_columns(*, soft_delete: bool) -> list[sa.Column]:
    columns = [
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]
    if soft_delete:
        columns.append(sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    return columns


def upgrade() -> None:
    op.create_table(
        "books",
        *_entity_columns(soft_delete=True),
        sa.Column(
            "kind",
            sa.Enum("couple", "family", "trip", "room", name="book_kind", native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=20), nullable=False),
        sa.Column(
            "settle_rule",
            sa.Enum("even", "none", name="settle_rule", native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column("monthly_budget", sa.Numeric(precision=14, scale=0), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by_user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.CheckConstraint(
            "monthly_budget IS NULL OR monthly_budget > 0",
            name=op.f("ck_books_monthly_budget_positive"),
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by_user_id"], ["users.id"], name="fk_books_deleted_by_user_id", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], name="fk_books_created_by_user_id", ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_books"),
    )

    op.create_table(
        "book_members",
        *_entity_columns(soft_delete=False),
        sa.Column("book_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("display_name", sa.String(length=10), nullable=False),
        sa.Column(
            "role",
            sa.Enum("owner", "member", name="book_role", native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], name="fk_book_members_book_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_book_members_user_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_book_members"),
    )
    op.create_index("ix_book_members_book_id", "book_members", ["book_id"])
    op.create_index("ix_book_members_user_id", "book_members", ["user_id"])
    op.create_index(
        "uq_book_members_book_id_user_id_active",
        "book_members",
        ["book_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("left_at IS NULL"),
        sqlite_where=sa.text("left_at IS NULL"),
    )

    op.create_table(
        "book_invites",
        *_entity_columns(soft_delete=False),
        sa.Column("book_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("created_by_member_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("max_joins", sa.Integer(), nullable=True),
        sa.Column("join_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.CheckConstraint("join_count >= 0", name=op.f("ck_book_invites_join_count_non_negative")),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], name="fk_book_invites_book_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["created_by_member_id"],
            ["book_members.id"],
            name="fk_book_invites_created_by_member_id",
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint("code", name="uq_book_invites_code"),
        sa.PrimaryKeyConstraint("id", name="pk_book_invites"),
    )
    op.create_index("ix_book_invites_book_id", "book_invites", ["book_id"])

    op.create_table(
        "book_categories",
        *_entity_columns(soft_delete=True),
        sa.Column("book_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("icon_key", sa.String(length=64), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["book_id"], ["books.id"], name="fk_book_categories_book_id", ondelete="CASCADE"
        ),
        sa.UniqueConstraint("book_id", "name", name="uq_book_categories_book_id_name"),
        sa.PrimaryKeyConstraint("id", name="pk_book_categories"),
    )
    op.create_index("ix_book_categories_book_id", "book_categories", ["book_id"])

    op.create_table(
        "book_entries",
        *_entity_columns(soft_delete=True),
        sa.Column("book_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=0), nullable=False),
        sa.Column("category_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=120), nullable=True),
        sa.Column("memo", sa.String(length=200), nullable=True),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("created_by_member_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("paid_by_member_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("updated_by_member_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("deleted_by_member_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("moved_out_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("amount > 0", name=op.f("ck_book_entries_amount_positive")),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], name="fk_book_entries_book_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["book_categories.id"],
            name="fk_book_entries_category_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_member_id"],
            ["book_members.id"],
            name="fk_book_entries_created_by_member_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["paid_by_member_id"],
            ["book_members.id"],
            name="fk_book_entries_paid_by_member_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_member_id"],
            ["book_members.id"],
            name="fk_book_entries_updated_by_member_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by_member_id"],
            ["book_members.id"],
            name="fk_book_entries_deleted_by_member_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_book_entries"),
    )
    op.create_index("ix_book_entries_book_id_occurred_on", "book_entries", ["book_id", "occurred_on"])

    op.create_table(
        "settlements",
        *_entity_columns(soft_delete=False),
        sa.Column("book_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("period", sa.String(length=7), nullable=False),
        sa.Column("transfers_snapshot", sa.JSON(), nullable=False),
        sa.Column("done_by_member_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("undone_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], name="fk_settlements_book_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["done_by_member_id"],
            ["book_members.id"],
            name="fk_settlements_done_by_member_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_settlements"),
    )
    op.create_index("ix_settlements_book_id_period", "settlements", ["book_id", "period"])


def downgrade() -> None:
    op.drop_index("ix_settlements_book_id_period", table_name="settlements")
    op.drop_table("settlements")

    op.drop_index("ix_book_entries_book_id_occurred_on", table_name="book_entries")
    op.drop_table("book_entries")

    op.drop_index("ix_book_categories_book_id", table_name="book_categories")
    op.drop_table("book_categories")

    op.drop_index("ix_book_invites_book_id", table_name="book_invites")
    op.drop_table("book_invites")

    op.drop_index(
        "uq_book_members_book_id_user_id_active",
        table_name="book_members",
        postgresql_where=sa.text("left_at IS NULL"),
        sqlite_where=sa.text("left_at IS NULL"),
    )
    op.drop_index("ix_book_members_user_id", table_name="book_members")
    op.drop_index("ix_book_members_book_id", table_name="book_members")
    op.drop_table("book_members")

    op.drop_table("books")
