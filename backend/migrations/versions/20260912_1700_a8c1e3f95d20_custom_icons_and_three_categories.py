"""직접 건 아이콘 칸과 기본 지출 분류 셋(편의점·주유·구독)

두 가지를 함께 넣는다. 새 분류 셋이 이번에 들어온 아이콘 파일을 쓰기 때문이다.

**`icon_custom`**: 앱에 든 아이콘 말고 휴대폰 자판의 이모지나 직접 찍은 사진을 걸 수 있게
한 칸이다. 비어 있으면 예전과 똑같이 `icon_key` 를 그린다. 이미 있는 행은 건드리지 않는다.

**분류 셋**: 편의점(25) · 주유(35) · 구독(65). 빈 번호에 끼워 넣어 기존 분류의 자리는
하나도 안 옮긴다. 자리를 옮기면 이미 그 분류로 적어 둔 사람의 목록 순서가 흔들린다.

Revision ID: a8c1e3f95d20
Revises: f7b3c95d1e42
Create Date: 2026-09-12 17:00:00.000000+09:00

"""
import uuid
from datetime import UTC, datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a8c1e3f95d20'
down_revision: Union[str, Sequence[str], None] = 'f7b3c95d1e42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 첫 시드와 같은 네임스페이스여야 같은 이름이 같은 id 를 낸다.
SEED_NAMESPACE = uuid.UUID('4f4b0d9e-9f7a-5b1e-8a3d-1c2f6f9a0b71')

# (이름, 아이콘, 자리). 정본은 app/domain/categories.py 다.
ADDED = (
    ('편의점', '62_convenience_store', 25),
    ('주유', '61_fuel_pump', 35),
    ('구독', '63_subscription', 65),
)


def seed_id(name: str) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, name)


def _table() -> sa.Table:
    return sa.table(
        'categories',
        sa.column('id', sa.Uuid()),
        sa.column('user_id', sa.Uuid()),
        sa.column('name', sa.String()),
        sa.column('kind', sa.String()),
        sa.column('icon_key', sa.String()),
        sa.column('sort_order', sa.Integer()),
        sa.column('created_at', sa.DateTime(timezone=True)),
        sa.column('updated_at', sa.DateTime(timezone=True)),
    )


def upgrade() -> None:
    op.add_column('categories', sa.Column('icon_custom', sa.Text(), nullable=True))

    conn = op.get_bind()
    table = _table()

    # 두 번 돌아도 중복이 생기지 않게 없는 것만 넣는다.
    taken = set(conn.scalars(sa.text('SELECT name FROM categories WHERE user_id IS NULL')).all())
    rows = [
        {
            'id': seed_id(name),
            'user_id': None,
            'name': name,
            'kind': 'expense',
            'icon_key': icon_key,
            'sort_order': sort_order,
            'created_at': datetime.now(UTC),
            'updated_at': datetime.now(UTC),
        }
        for name, icon_key, sort_order in ADDED
        if name not in taken
    ]
    if rows:
        op.bulk_insert(table, rows)


def downgrade() -> None:
    conn = op.get_bind()
    table = _table()
    conn.execute(table.delete().where(table.c.id.in_([seed_id(name) for name, _, _ in ADDED])))
    op.drop_column('categories', 'icon_custom')
