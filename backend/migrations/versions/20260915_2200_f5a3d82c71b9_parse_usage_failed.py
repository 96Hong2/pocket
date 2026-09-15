"""분석 사용량에 실패한 호출도 남긴다

성공한 호출만 세고 있었다. 모델을 부르다 죽으면 표에 한 줄도 안 남아, 실패가 이어지는
동안 하루 상한·1분 상한이 줄지 않는다. 답이 안 나오는 사진 한 장이면 같은 사람이 유료
호출을 무제한으로 낼 수 있다. 돈이 나가는 것은 답이 아니라 호출이다.

옛 행은 전부 성공한 것이라 기본값 false 가 그대로 사실이다.

Revision ID: f5a3d82c71b9
Revises: e3b7c9d1a4f2
Create Date: 2026-09-15 22:00:00.000000+09:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f5a3d82c71b9"
down_revision: Union[str, Sequence[str], None] = "e3b7c9d1a4f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "parse_usages",
        sa.Column("failed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("parse_usages", "failed")
