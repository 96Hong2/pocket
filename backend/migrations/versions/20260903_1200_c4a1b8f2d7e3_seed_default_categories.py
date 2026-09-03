"""기본 카테고리 시드

목록을 이 파일에 값으로 박아 둔 이유:
적용이 끝난 리비전은 다시 돌아도 같은 결과여야 한다. `app.domain.categories` 를 import 하면
나중에 목록을 고쳤을 때 이미 적용된 이 리비전의 의미가 같이 바뀌고, 새 환경과 기존 환경의
DB 가 달라진다. 대신 도메인 목록과 어긋나면 tests/test_default_category_seed.py 가 잡는다.

id 는 이름으로 만든 uuid5 다. 어느 환경에서 돌려도 같은 값이 나와, 기기마다 다른 id 를
프론트나 문서가 붙들 일이 없다.

Revision ID: c4a1b8f2d7e3
Revises: 9e46601ea881
Create Date: 2026-09-03 12:00:00.000000+09:00

"""
import uuid
from datetime import UTC, datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c4a1b8f2d7e3'
down_revision: Union[str, Sequence[str], None] = '9e46601ea881'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 기본 카테고리 id 를 만드는 고정 네임스페이스. 절대 바꾸지 않는다.
SEED_NAMESPACE = uuid.UUID('4f4b0d9e-9f7a-5b1e-8a3d-1c2f6f9a0b71')

# (이름, 종류, 아이콘 키, 정렬 순서)
DEFAULT_CATEGORIES: tuple[tuple[str, str, str, int], ...] = (
    ('식비', 'expense', '09_rice_bowl', 10),
    ('카페·간식', 'expense', '06_coffee', 20),
    ('교통', 'expense', '33_train', 30),
    ('쇼핑', 'expense', '34_shopping_cart', 40),
    ('생활', 'expense', '18_cleaning_tools', 50),
    ('주거·고정비', 'expense', '12_house', 60),
    ('여가·취미', 'expense', '35_paint_palette', 70),
    ('건강·미용', 'expense', '44_dumbbell', 80),
    ('기타', 'expense', '26_sparkles', 90),
    ('수입', 'income', '28_cash', 100),
    ('이체', 'transfer', '05_choice_arrows', 110),
)


def seed_id(name: str) -> uuid.UUID:
    """이름이 같으면 어느 환경에서도 같은 id 가 나온다."""
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
    """이미 있는 이름은 건드리지 않는다. 두 번 돌아도 중복이 생기지 않게.

    이름으로 거르는 이유: PostgreSQL 의 unique 인덱스는 NULLS NOT DISTINCT 라 막아 주지만
    SQLite 는 NULL 끼리 서로 다르게 봐서 그냥 두 벌이 쌓인다. 코드가 보장해야 한다.
    """
    conn = op.get_bind()
    taken = set(
        conn.scalars(sa.text('SELECT name FROM categories WHERE user_id IS NULL')).all()
    )
    # created_at/updated_at 의 server_default 는 now() 다. SQLite 에는 그 함수가 없어
    # 마이그레이션 스모크가 깨진다. 값을 직접 넣어 어느 DB 에서나 같게 돈다.
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
        for name, kind, icon_key, sort_order in DEFAULT_CATEGORIES
        if name not in taken
    ]
    if rows:
        op.bulk_insert(_table(), rows)


def downgrade() -> None:
    """시드로 넣은 행만 id 로 지운다. 사용자가 만든 카테고리는 남긴다.

    거래는 category_id 가 SET NULL 이라 남고, 카테고리 예산과 상호 규칙은 함께 지워진다.
    """
    conn = op.get_bind()
    ids = [seed_id(name) for name, _, _, _ in DEFAULT_CATEGORIES]
    table = _table()
    conn.execute(table.delete().where(table.c.id.in_(ids)))
