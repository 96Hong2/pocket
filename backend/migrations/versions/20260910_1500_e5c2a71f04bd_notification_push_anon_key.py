"""알림을 켠 사람의 익명키를 보관한다

발송기는 토스 스마트발송을 부를 때 `x-anon-key` 로 누구에게 보낼지 말해야 한다.
그런데 `users.anon_key_hash` 는 sha256 이라 되돌릴 수 없다. 원문을 안 남긴다는 결정
(`api/deps.py`) 을 통째로 뒤집지 않으려고, **알림을 켠 사람 것만** 여기에 둔다.

수명이 동의와 같다. 켤 때 채우고 끌 때 지운다. 알림을 안 쓰는 사람의 익명키는
어디에도 남지 않는다.

Revision ID: e5c2a71f04bd
Revises: b3d7d87f3186
Create Date: 2026-09-10 15:00:00.000000+09:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e5c2a71f04bd'
down_revision: Union[str, Sequence[str], None] = 'b3d7d87f3186'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'notification_settings',
        sa.Column('push_anon_key', sa.String(length=256), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('notification_settings', 'push_anon_key')
