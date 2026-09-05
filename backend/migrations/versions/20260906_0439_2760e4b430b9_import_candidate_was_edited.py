"""읽어 온 값을 사람이 고쳤는지

이 제품의 북극성은 '손 안 대고 저장된 비율' 이다. 저장하는 순간 고쳤는지를 남기지 않으면
나중에 어떤 방법으로도 되살릴 수 없다. 그래서 출시 전에 넣는다.

무엇을 어떻게 고쳤는지는 담지 않는다. 고쳤다는 사실 하나면 그 비율이 나온다.
기존 행은 고친 적 없는 것으로 본다(false).

Revision ID: 2760e4b430b9
Revises: bcf9baa5e4fd
Create Date: 2026-09-06 04:39:50.048209+09:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2760e4b430b9'
down_revision: Union[str, Sequence[str], None] = 'bcf9baa5e4fd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'import_candidates',
        sa.Column('was_edited', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    )


def downgrade() -> None:
    op.drop_column('import_candidates', 'was_edited')
