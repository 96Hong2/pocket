"""기록 화면에 먼저 보일 분류 표시와 '주유' 되돌리기

**`quick_hidden_category_ids`**: 기록 시트의 분류 칩을 사용자가 고를 수 있게 한다.
**보일 것이 아니라 숨긴 것**을 적는다. 그래야 빈 목록이 곧 「전부 보인다」 라서 이미 쓰던
사람의 화면이 이 마이그레이션 하나로 비지 않고, 새로 만든 분류도 저절로 보인다.

카테고리 행이 아니라 사용자 설정에 두는 이유는 기본 분류가 **모두가 같이 보는 한 행**이기
때문이다. 거기에 적으면 한 사람이 끈 것이 전부에게 꺼진다.

**'주유' 제거**: 하루 전에 기본 분류로 넣었다가 뺀다(a8c1e3f95d20). 차가 없으면 아예 안 쓰는
갈래라 모두에게 보이는 자리에 둘 것이 아니었다. 아이콘 `61_fuel_pump` 는 남아 있어서
필요한 사람은 직접 만들어 쓴다.

**지우기 전에 옮긴다.** 그 분류로 이미 적어 둔 것이 있으면 그냥 지울 때 분류가 통째로
빠진다(FK 가 SET NULL). 가장 가까운 '교통' 으로 옮긴 뒤 지운다. 카테고리 예산만은 한 예산에
한 분류라, '교통' 한도가 이미 있으면 옮기지 않고 지운다(두 한도를 더하면 사용자가 정한 적
없는 숫자가 된다). 기억한 분류는 (사용자, 상호)로 유일해서 겹치지 않는다.

Revision ID: b5d4a71c86e3
Revises: a8c1e3f95d20
Create Date: 2026-09-12 21:00:00.000000+09:00

"""
import uuid
from datetime import UTC, datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b5d4a71c86e3'
down_revision: Union[str, Sequence[str], None] = 'a8c1e3f95d20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEED_NAMESPACE = uuid.UUID('4f4b0d9e-9f7a-5b1e-8a3d-1c2f6f9a0b71')

DROPPED_NAME = '주유'
DROPPED_ICON_KEY = '61_fuel_pump'
DROPPED_SORT_ORDER = 35
MOVED_TO_NAME = '교통'

# 한 예산에 한 분류만 허용한다. 옮기기 전에 겹치는 것을 걷어 낸다.
BUDGET_TABLE = 'category_budgets'


def seed_id(name: str) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, name)


def upgrade() -> None:
    op.add_column(
        'user_preferences',
        sa.Column(
            'quick_hidden_category_ids', sa.JSON(), nullable=False, server_default=sa.text("'[]'")
        ),
    )

    conn = op.get_bind()
    categories = sa.table(
        'categories',
        sa.column('id', sa.Uuid()),
        sa.column('user_id', sa.Uuid()),
        sa.column('name', sa.String()),
    )
    old = seed_id(DROPPED_NAME)
    new = conn.scalar(
        sa.select(categories.c.id).where(
            categories.c.user_id.is_(None), categories.c.name == MOVED_TO_NAME
        )
    )
    if new is None:
        return

    # 옮기면 겹칠 한도부터 걷어 낸다. 안 그러면 유니크 제약에 걸려 배포가 멈춘다.
    budgets = sa.table(
        BUDGET_TABLE, sa.column('budget_id', sa.Uuid()), sa.column('category_id', sa.Uuid())
    )
    conn.execute(
        budgets.delete().where(
            budgets.c.category_id == old,
            budgets.c.budget_id.in_(
                sa.select(budgets.c.budget_id).where(budgets.c.category_id == new)
            ),
        )
    )

    for name in ('transactions', 'import_candidates', BUDGET_TABLE, 'merchant_rules'):
        table = sa.table(name, sa.column('category_id', sa.Uuid()))
        conn.execute(
            table.update().where(table.c.category_id == old).values(category_id=new)
        )

    prefs = sa.table('user_preferences', sa.column('happy_spend_category_id', sa.Uuid()))
    conn.execute(
        prefs.update()
        .where(prefs.c.happy_spend_category_id == old)
        .values(happy_spend_category_id=new)
    )
    conn.execute(categories.delete().where(categories.c.id == old))


def downgrade() -> None:
    conn = op.get_bind()
    table = sa.table(
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
    taken = conn.scalar(
        sa.select(sa.func.count())
        .select_from(table)
        .where(table.c.user_id.is_(None), table.c.name == DROPPED_NAME)
    )
    if not taken:
        stamped_at = datetime.now(UTC)
        op.bulk_insert(
            table,
            [
                {
                    'id': seed_id(DROPPED_NAME),
                    'user_id': None,
                    'name': DROPPED_NAME,
                    'kind': 'expense',
                    'icon_key': DROPPED_ICON_KEY,
                    'sort_order': DROPPED_SORT_ORDER,
                    'created_at': stamped_at,
                    'updated_at': stamped_at,
                }
            ],
        )
    op.drop_column('user_preferences', 'quick_hidden_category_ids')
