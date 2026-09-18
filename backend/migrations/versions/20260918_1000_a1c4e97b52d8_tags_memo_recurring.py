"""태그 · 메모 · 반복 지출

한 판에 셋을 같이 넣는다. 셋이 같은 화면(기록 한 줄)에 붙고, 반복 지출이 태그를
가리키기 때문에 따로 올리면 중간 판에서 외래키가 갈 곳이 없다.

옛 행은 전부 메모도 태그도 없는 것이 사실이라 NULL 이 그대로 맞다.

Revision ID: a1c4e97b52d8
Revises: f5a3d82c71b9
Create Date: 2026-09-18 10:00:00.000000+09:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1c4e97b52d8"
down_revision: Union[str, Sequence[str], None] = "f5a3d82c71b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tags",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column(
            "color",
            sa.Enum(
                "sage",
                "ocean",
                "lilac",
                "coral",
                "amber",
                "mint",
                "rose",
                "slate",
                name="tag_color",
                native_enum=False,
                length=32,
            ),
            server_default="sage",
            nullable=False,
        ),
        sa.Column(
            "kind",
            sa.Enum("expense", "income", name="tag_kind", native_enum=False, length=32),
            server_default="expense",
            nullable=False,
        ),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_tags_user_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_tags"),
    )
    op.create_index("ix_tags_user_id_kind", "tags", ["user_id", "kind"])

    op.create_table(
        "recurring_expenses",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=0), nullable=False),
        sa.Column("day_of_month", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("tag_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column(
            "payment_method",
            sa.Enum("credit", "debit", "cash", name="payment_method", native_enum=False, length=32),
            nullable=True,
        ),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("last_recorded_on", sa.Date(), nullable=True),
        sa.Column("dismissed_on", sa.Date(), nullable=True),
        sa.CheckConstraint("amount > 0", name="ck_recurring_expenses_amount_positive"),
        sa.CheckConstraint(
            "day_of_month >= 1 AND day_of_month <= 31",
            name="ck_recurring_expenses_day_of_month_range",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_recurring_expenses_user_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name="fk_recurring_expenses_category_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"], ["tags.id"], name="fk_recurring_expenses_tag_id", ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_recurring_expenses"),
    )
    op.create_index(
        "ix_recurring_expenses_user_id_day_of_month",
        "recurring_expenses",
        ["user_id", "day_of_month"],
    )

    op.add_column("transactions", sa.Column("memo", sa.String(length=200), nullable=True))
    # 외래키를 칸 안에 붙여 만든다. 따로 `create_foreign_key` 를 부르면 sqlite 가
    # 제약 ALTER 를 못 해 마이그레이션 스모크가 통째로 건너뛰어진다.
    op.add_column(
        "transactions",
        sa.Column(
            "tag_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("tags.id", name="fk_transactions_tag_id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_transactions_tag_id", "transactions", ["tag_id"])


def downgrade() -> None:
    op.drop_index("ix_transactions_tag_id", table_name="transactions")
    op.drop_column("transactions", "tag_id")
    op.drop_column("transactions", "memo")

    op.drop_index("ix_recurring_expenses_user_id_day_of_month", table_name="recurring_expenses")
    op.drop_table("recurring_expenses")

    op.drop_index("ix_tags_user_id_kind", table_name="tags")
    op.drop_table("tags")
