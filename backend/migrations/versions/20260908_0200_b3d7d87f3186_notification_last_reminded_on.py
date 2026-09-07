"""알림을 마지막으로 보낸 날을 남긴다

발송기는 1분마다 깨어나 '지금이 그 사람의 알림 시각인가' 만 본다. 그 판정만으로는
같은 분에 두 번 깨거나 재시도가 겹칠 때 알림이 두 번 간다. 보낸 날을 남겨 두고
그 날 이미 보냈으면 건너뛴다.

날짜만 남긴다. 시각까지 남기면 '몇 시에 보냈나' 를 알 수 있지만 그건 로그가 할 일이고,
여기서 필요한 것은 '오늘 보냈나' 하나다.

Revision ID: b3d7d87f3186
Revises: a3f1c07b52d4
Create Date: 2026-09-08 02:00:00.000000+09:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b3d7d87f3186'
down_revision: Union[str, Sequence[str], None] = 'a3f1c07b52d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'notification_settings',
        sa.Column('last_reminded_on', sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('notification_settings', 'last_reminded_on')
