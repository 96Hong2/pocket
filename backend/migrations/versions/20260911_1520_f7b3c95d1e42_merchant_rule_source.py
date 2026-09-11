"""기억한 분류에 출처를 남긴다

목록이 쌓일수록 "이걸 내가 적었나, 앱이 기억했나" 를 알 수 없었다. 사용자가 직접 적는 길을
여는 김에 출처를 함께 남긴다. 이미 있는 행은 전부 앱이 기억한 것이다.

Revision ID: f7b3c95d1e42
Revises: d4a2e8c31b70
Create Date: 2026-09-11 15:20:00.000000+09:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f7b3c95d1e42'
down_revision: Union[str, Sequence[str], None] = 'd4a2e8c31b70'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 모델과 같은 이름이어야 한다. native_enum=False 라 실제로는 VARCHAR + CHECK 이다.
SOURCE_TYPE = sa.Enum(
    'learned',
    'manual',
    name='merchant_rule_source',
    native_enum=False,
    length=32,
)


def upgrade() -> None:
    op.add_column(
        'merchant_rules',
        sa.Column(
            'source',
            SOURCE_TYPE,
            nullable=False,
            server_default='learned',
        ),
    )


def downgrade() -> None:
    op.drop_column('merchant_rules', 'source')
