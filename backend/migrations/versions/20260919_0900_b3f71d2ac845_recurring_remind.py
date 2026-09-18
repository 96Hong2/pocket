"""반복 지출 알림 시각과 전날·당일

예고마다 몇 시에 알릴지와 며칠 전에 알릴지를 따로 갖는다. 비워 두면 기록 알림에
정해 둔 시각을 따르고, 전날·당일은 안 고르면 **당일**이다.

옛 행은 전부 당일(0)로 시작한다. 그 전에는 전날부터 물었지만, 대부분은 빠져나간
그날 적는 것이 자연스럽다는 지적을 받아 기본을 바꿨다.

Revision ID: b3f71d2ac845
Revises: a1c4e97b52d8
Create Date: 2026-09-19 09:00:00.000000+09:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3f71d2ac845"
down_revision: Union[str, Sequence[str], None] = "a1c4e97b52d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("recurring_expenses", sa.Column("remind_at", sa.Time(), nullable=True))
    op.add_column(
        "recurring_expenses",
        sa.Column(
            "remind_lead_days", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
    )
    # 제약은 칸을 만든 뒤에 건다. sqlite 는 제약 ALTER 를 못 해 배치 모드로 돈다.
    with op.batch_alter_table("recurring_expenses") as batch:
        batch.create_check_constraint(
            "ck_recurring_expenses_remind_lead_days_range",
            "remind_lead_days >= 0 AND remind_lead_days <= 1",
        )


def downgrade() -> None:
    with op.batch_alter_table("recurring_expenses") as batch:
        batch.drop_constraint("ck_recurring_expenses_remind_lead_days_range", type_="check")
    op.drop_column("recurring_expenses", "remind_lead_days")
    op.drop_column("recurring_expenses", "remind_at")
