"""어느 모델이 읽었고 재시도까지 갔는지 남긴다

읽는 모델이 둘이 됐다. 값싼 것으로 먼저 읽고, 서버 검증에 걸린 것만 비싼 것으로 다시 읽는다.
재시도가 얼마나 자주 도는지 모르면 「되도록 안 부른다」를 지키고 있는지 알 수 없다.
provider 만 남기면 luna 와 terra 가 둘 다 `openai` 라 구분이 안 된다.

Revision ID: c81f4b6d2a97
Revises: e5c2a71f04bd
Create Date: 2026-09-11 00:30:00.000000+09:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c81f4b6d2a97'
down_revision: Union[str, Sequence[str], None] = 'e5c2a71f04bd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'parse_usages',
        sa.Column('model', sa.String(length=64), nullable=True),
    )
    op.add_column(
        'parse_usages',
        sa.Column(
            'escalated',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
        ),
    )


def downgrade() -> None:
    op.drop_column('parse_usages', 'escalated')
    op.drop_column('parse_usages', 'model')
