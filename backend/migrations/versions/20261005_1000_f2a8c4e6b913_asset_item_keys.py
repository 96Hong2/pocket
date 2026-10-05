"""자산 항목 고정 키와 종목 칸

스냅샷이 바뀌어도 같은 항목을 가리키는 `item_key` 와 종목 칸(종류, 매달 넣는 돈, 수량, 넣은 돈,
지금 1주 가격, 가격을 적은 날)을 `asset_items` 에 더한다(ADR-0044).

`item_key` 는 null 을 허용한다. 배포 중에 옛 리비전이 키 없이 행을 만들어도 저장이 안 막힌다.
기존 행의 키는 파이썬 uuid4 로 채운다. Postgres 전용 함수를 쓰면 sqlite 스모크가 멈춘다.
같은 사용자의 같은 (group, label) 은 같은 키라 지난달 대비가 안 끊긴다. 한 스냅샷에 같은
(group, label) 이 둘이면 몇 번째인지까지 맞춰 서로 다른 키를 준다.

Revision ID: f2a8c4e6b913
Revises: e7a4c2d9b15f
Create Date: 2026-10-05 10:00:00.000000+09:00

"""

import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2a8c4e6b913"
down_revision: Union[str, Sequence[str], None] = "e7a4c2d9b15f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_items = sa.table(
    "asset_items",
    sa.column("id", sa.Uuid(as_uuid=True)),
    sa.column("snapshot_id", sa.Uuid(as_uuid=True)),
    sa.column("asset_group", sa.String()),
    sa.column("label", sa.String()),
    sa.column("sort_order", sa.Integer()),
    sa.column("item_key", sa.Uuid(as_uuid=True)),
)
_snapshots = sa.table(
    "asset_snapshots",
    sa.column("id", sa.Uuid(as_uuid=True)),
    sa.column("user_id", sa.Uuid(as_uuid=True)),
)


def _backfill_item_keys() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.select(
            _items.c.id, _items.c.snapshot_id, _snapshots.c.user_id, _items.c.asset_group, _items.c.label
        )
        .select_from(_items.join(_snapshots, _snapshots.c.id == _items.c.snapshot_id))
        .order_by(_items.c.snapshot_id, _items.c.sort_order, _items.c.id)
    ).all()

    keys: dict[tuple, uuid.UUID] = {}
    seen: dict[tuple, int] = {}
    updates = []
    for row_id, snapshot_id, user_id, group, label in rows:
        name = (user_id, group, label)
        nth = seen.get((snapshot_id, *name), 0)
        seen[(snapshot_id, *name)] = nth + 1
        key = keys.setdefault((*name, nth), uuid.uuid4())
        updates.append({"row_id": row_id, "key": key})

    if updates:
        bind.execute(
            _items.update().where(_items.c.id == sa.bindparam("row_id")).values(item_key=sa.bindparam("key")),
            updates,
        )


def upgrade() -> None:
    op.add_column("asset_items", sa.Column("item_key", sa.Uuid(as_uuid=True), nullable=True))
    op.add_column("asset_items", sa.Column("kind", sa.String(length=32), nullable=True))
    op.add_column("asset_items", sa.Column("monthly_amount", sa.Numeric(precision=16, scale=0), nullable=True))
    op.add_column("asset_items", sa.Column("quantity", sa.Numeric(precision=20, scale=8), nullable=True))
    op.add_column("asset_items", sa.Column("cost_basis", sa.Numeric(precision=16, scale=0), nullable=True))
    op.add_column("asset_items", sa.Column("unit_price", sa.Numeric(precision=16, scale=0), nullable=True))
    op.add_column("asset_items", sa.Column("price_noted_on", sa.Date(), nullable=True))
    _backfill_item_keys()
    op.create_index(
        "uq_asset_items_snapshot_id_item_key", "asset_items", ["snapshot_id", "item_key"], unique=True
    )


def downgrade() -> None:
    op.drop_index("uq_asset_items_snapshot_id_item_key", table_name="asset_items")
    op.drop_column("asset_items", "price_noted_on")
    op.drop_column("asset_items", "unit_price")
    op.drop_column("asset_items", "cost_basis")
    op.drop_column("asset_items", "quantity")
    op.drop_column("asset_items", "monthly_amount")
    op.drop_column("asset_items", "kind")
    op.drop_column("asset_items", "item_key")
