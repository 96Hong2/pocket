"""자산 장부와 거래·검토 후보의 자산 칸

`asset_entries` 는 항목 값의 정본인 장부다(ADR-0044). 들어온 순서(created_at)로 접는다.
side 는 buy(넣었어요, 부채는 갚았어요), sell(팔았어요), set(여기서부터 이 값) 셋이다.
`cost_basis` 는 set 줄만 쓴다. 금액 종목은 넣은 돈과 지금 금액 두 값이라 금액 칸 하나로 모자란다.

거래(`transactions`)와 검토 후보(`import_candidates`)에는 「어디에」 와 넣었어요·팔았어요, 수량을
null 허용으로 더한다. 옛 번들은 이 칸을 안 보내므로 지금처럼 저장된다.

외래키는 칸 안에 붙여 만든다. 따로 `create_foreign_key` 를 부르면 sqlite 스모크가 멈춘다.

Revision ID: a9d3e5f7c182
Revises: f2a8c4e6b913
Create Date: 2026-10-05 10:10:00.000000+09:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a9d3e5f7c182"
down_revision: Union[str, Sequence[str], None] = "f2a8c4e6b913"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "asset_entries",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("item_key", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column(
            "side",
            sa.Enum("buy", "sell", "set", name="asset_entry_side", native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column("quantity", sa.Numeric(precision=20, scale=8), nullable=True),
        sa.Column("amount", sa.Numeric(precision=16, scale=0), nullable=False),
        sa.Column("cost_basis", sa.Numeric(precision=16, scale=0), nullable=True),
        sa.Column("transaction_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.CheckConstraint("amount >= 0", name=op.f("ck_asset_entries_amount_non_negative")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_asset_entries_user_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["transaction_id"], ["transactions.id"], name="fk_asset_entries_transaction_id", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_asset_entries"),
    )
    op.create_index("ix_asset_entries_user_id_item_key", "asset_entries", ["user_id", "item_key"])
    op.create_index("ix_asset_entries_transaction_id", "asset_entries", ["transaction_id"])

    op.add_column("transactions", sa.Column("asset_item_key", sa.Uuid(as_uuid=True), nullable=True))
    op.add_column("transactions", sa.Column("asset_side", sa.String(length=32), nullable=True))
    op.add_column("transactions", sa.Column("asset_quantity", sa.Numeric(precision=20, scale=8), nullable=True))

    op.add_column("import_candidates", sa.Column("asset_item_key", sa.Uuid(as_uuid=True), nullable=True))
    op.add_column("import_candidates", sa.Column("asset_side", sa.String(length=32), nullable=True))
    op.add_column(
        "import_candidates", sa.Column("asset_quantity", sa.Numeric(precision=20, scale=8), nullable=True)
    )
    op.add_column("import_candidates", sa.Column("asset_name", sa.String(length=80), nullable=True))


def downgrade() -> None:
    op.drop_column("import_candidates", "asset_name")
    op.drop_column("import_candidates", "asset_quantity")
    op.drop_column("import_candidates", "asset_side")
    op.drop_column("import_candidates", "asset_item_key")
    op.drop_column("transactions", "asset_quantity")
    op.drop_column("transactions", "asset_side")
    op.drop_column("transactions", "asset_item_key")
    op.drop_index("ix_asset_entries_transaction_id", table_name="asset_entries")
    op.drop_index("ix_asset_entries_user_id_item_key", table_name="asset_entries")
    op.drop_table("asset_entries")
