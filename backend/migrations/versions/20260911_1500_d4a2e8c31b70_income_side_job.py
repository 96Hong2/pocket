"""수입 기본 카테고리에 '부업' 을 넣는다

월급도 용돈도 아닌 돈이 '기타 수입' 한 칸에 몰렸다. 부업은 그중 가장 자주 적히는 갈래라
따로 세운다. 나머지 기본 분류는 건드리지 않는다.

**'기타 수입' 의 자리만 뒤로 민다(102 → 104).** 기타는 목록 끝에 있어야 어디까지가 실제
갈래인지 읽힌다. 이름과 id 는 그대로라 그 분류로 적어 둔 거래는 아무 영향이 없다.

Revision ID: d4a2e8c31b70
Revises: c81f4b6d2a97
Create Date: 2026-09-11 15:00:00.000000+09:00

"""
import uuid
from datetime import UTC, datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd4a2e8c31b70'
down_revision: Union[str, Sequence[str], None] = 'c81f4b6d2a97'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 첫 시드와 같은 네임스페이스여야 같은 이름이 같은 id 를 낸다.
SEED_NAMESPACE = uuid.UUID('4f4b0d9e-9f7a-5b1e-8a3d-1c2f6f9a0b71')

ADDED_NAME = '부업'
ADDED_ICON_KEY = '20_computer'
ADDED_SORT_ORDER = 103

# 끝자리로 물러나는 기존 분류.
MOVED_NAME = '기타 수입'
MOVED_SORT_ORDER = 104
MOVED_SORT_ORDER_BEFORE = 102


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
    conn = op.get_bind()
    table = _table()

    conn.execute(
        table.update()
        .where(table.c.user_id.is_(None), table.c.name == MOVED_NAME)
        .values(sort_order=MOVED_SORT_ORDER)
    )

    # 두 번 돌아도 중복이 생기지 않게 없을 때만 넣는다.
    taken = set(conn.scalars(sa.text('SELECT name FROM categories WHERE user_id IS NULL')).all())
    if ADDED_NAME in taken:
        return

    stamped_at = datetime.now(UTC)
    op.bulk_insert(
        table,
        [
            {
                'id': seed_id(ADDED_NAME),
                'user_id': None,
                'name': ADDED_NAME,
                'kind': 'income',
                'icon_key': ADDED_ICON_KEY,
                'sort_order': ADDED_SORT_ORDER,
                'created_at': stamped_at,
                'updated_at': stamped_at,
            }
        ],
    )


def downgrade() -> None:
    conn = op.get_bind()
    table = _table()
    conn.execute(table.delete().where(table.c.id == seed_id(ADDED_NAME)))
    conn.execute(
        table.update()
        .where(table.c.user_id.is_(None), table.c.name == MOVED_NAME)
        .values(sort_order=MOVED_SORT_ORDER_BEFORE)
    )
