"""사용자 한 달 시작일

`users.month_start_day` 는 예산·리포트·결산의 한 달이 시작하는 날(1 ~ 28)이다(ADR-0046).
기본 1 이라 이 칸이 생겨도 지금 사용자의 기간은 그대로 달력 월이다.

범위 제약은 PostgreSQL 에만 건다. sqlite 는 있는 표에 제약을 더하지 못해 스모크가 멈춘다.

Revision ID: b4c7e2d9f310
Revises: a9d3e5f7c182
Create Date: 2026-10-05 11:00:00.000000+09:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4c7e2d9f310"
down_revision: Union[str, Sequence[str], None] = "a9d3e5f7c182"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("month_start_day", sa.SmallInteger(), server_default=sa.text("1"), nullable=False),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.create_check_constraint(
            op.f("ck_users_month_start_day_range"),
            "users",
            "month_start_day >= 1 AND month_start_day <= 28",
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.drop_constraint(op.f("ck_users_month_start_day_range"), "users", type_="check")
    op.drop_column("users", "month_start_day")
