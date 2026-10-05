"""금액 종목 팔기의 남은 금액과 넣은 돈 전체

`asset_entries.remaining` 은 금액으로 적는 항목을 판 줄의 팔고 남은 금액이다. 0 이면 전부 팔았다.
판 몫은 받은 돈 ÷ (받은 돈 + 남은 금액)이다. 비어 있는 옛 팔기 줄은 지금 규칙(받은 돈 ÷ 지금 금액)
그대로 접는다. sell 줄의 `cost_basis` 는 넣은 돈을 모르는 항목을 팔 때 적은 넣은 돈 전체다.

거래(`transactions`)에도 같은 두 칸을 null 허용으로 더한다. 옛 번들은 안 보내므로 지금처럼 저장된다.

Revision ID: b4c7e2a9d051
Revises: a9d3e5f7c182
Create Date: 2026-10-05 11:00:00.000000+09:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4c7e2a9d051"
down_revision: Union[str, Sequence[str], None] = "a9d3e5f7c182"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("asset_entries", sa.Column("remaining", sa.Numeric(precision=16, scale=0), nullable=True))
    op.add_column("transactions", sa.Column("asset_remaining", sa.Numeric(precision=16, scale=0), nullable=True))
    op.add_column("transactions", sa.Column("asset_cost_basis", sa.Numeric(precision=16, scale=0), nullable=True))


def downgrade() -> None:
    op.drop_column("transactions", "asset_cost_basis")
    op.drop_column("transactions", "asset_remaining")
    op.drop_column("asset_entries", "remaining")
