"""수입 기본 카테고리를 셋으로 나눈다

수입이 '수입' 하나뿐이라 리포트의 수입 쪽이 늘 한 조각이었다. 지출만큼 잘게 나누지는
않는다. 월급·용돈·기타 수입 셋이면 대부분이 들어간다.

**옛 '수입' 행을 지우지 않고 '기타 수입'으로 이름만 옮긴다.** 지우면 그 분류로 적어 둔
거래의 분류가 통째로 빠진다(FK 가 SET NULL 이다). 이름을 옮기면 id 가 그대로라 과거 기록이
살아 있고, 뜻도 어긋나지 않는다. 그래서 '기타 수입' 의 id 는 uuid5('수입') 인 채로 남는다.
id 는 어차피 이름으로 읽는 값이 아니다.

Revision ID: a3f1c07b52d4
Revises: 2760e4b430b9
Create Date: 2026-09-07 19:00:00.000000+09:00

"""
import uuid
from datetime import UTC, datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a3f1c07b52d4'
down_revision: Union[str, Sequence[str], None] = '2760e4b430b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 첫 시드와 같은 네임스페이스여야 같은 이름이 같은 id 를 낸다.
SEED_NAMESPACE = uuid.UUID('4f4b0d9e-9f7a-5b1e-8a3d-1c2f6f9a0b71')

RENAMED_FROM = '수입'
RENAMED_TO = '기타 수입'

# (이름, 종류, 아이콘 키, 정렬 순서) 새로 넣는 것만.
ADDED_CATEGORIES: tuple[tuple[str, str, str, int], ...] = (
    ('월급', 'income', '28_cash', 100),
    ('용돈', 'income', '31_gift', 101),
)

# 이름을 옮긴 행이 앉을 자리. 새로 넣는 둘 뒤다.
RENAMED_SORT_ORDER = 102


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

    # 1. 옛 '수입' 을 '기타 수입' 으로. 아이콘도 동전으로 바꿔 월급과 겹치지 않게 한다.
    conn.execute(
        table.update()
        .where(table.c.user_id.is_(None), table.c.name == RENAMED_FROM)
        .values(name=RENAMED_TO, icon_key='01_coins', sort_order=RENAMED_SORT_ORDER)
    )

    # 2. 없는 것만 넣는다. 두 번 돌아도 중복이 생기지 않게.
    taken = set(conn.scalars(sa.text('SELECT name FROM categories WHERE user_id IS NULL')).all())
    stamped_at = datetime.now(UTC)
    rows = [
        {
            'id': seed_id(name),
            'user_id': None,
            'name': name,
            'kind': kind,
            'icon_key': icon_key,
            'sort_order': sort_order,
            'created_at': stamped_at,
            'updated_at': stamped_at,
        }
        for name, kind, icon_key, sort_order in ADDED_CATEGORIES
        if name not in taken
    ]
    if rows:
        op.bulk_insert(table, rows)


def downgrade() -> None:
    conn = op.get_bind()
    table = _table()
    conn.execute(table.delete().where(table.c.id.in_([seed_id(n) for n, _, _, _ in ADDED_CATEGORIES])))
    conn.execute(
        table.update()
        .where(table.c.user_id.is_(None), table.c.name == RENAMED_TO)
        .values(name=RENAMED_FROM, icon_key='28_cash', sort_order=100)
    )
