"""팔았어요로 받은 돈을 넣은 곳

`transactions.asset_proceeds_key` 는 팔기 기록이 받은 돈을 넣은 통장(예적금·현금 항목)의 키다.
비어 있으면 어디에도 안 넣은 것이고, 지금까지의 팔기 기록은 전부 비어 있다.

이 칸이 차 있으면 그 거래가 장부 줄을 둘 가진다. 판 종목의 sell 줄과 넣은 통장의 buy 줄이다.
`asset_entries.is_proceeds` 가 둘을 가른다. 기존 줄은 전부 false 다.

칸을 더하기만 한다. 기존 행의 값은 바꾸지 않는다. 옛 번들은 두 칸을 모르고 지금처럼 저장된다.

Revision ID: c5e8a1f3d7b2
Revises: b4c7e2a9d051
Create Date: 2026-10-07 21:30:00.000000+09:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5e8a1f3d7b2"
down_revision: Union[str, Sequence[str], None] = "b4c7e2a9d051"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("asset_proceeds_key", sa.Uuid(as_uuid=True), nullable=True))
    op.add_column(
        "asset_entries",
        sa.Column("is_proceeds", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("asset_entries", "is_proceeds")
    op.drop_column("transactions", "asset_proceeds_key")
