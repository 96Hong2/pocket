"""로그인 코드를 요청한 사람

`login_codes.requested_by_user_id` 는 그 코드 메일을 보내 달라고 한 사람이다. 받는 주소마다
상한만으로는 한 사람이 주소를 바꿔 가며 메일을 쏘는 것을 못 막아, 사람마다 하루 상한을
세는 데 쓴다.

칸을 더하기만 한다. 지금까지의 코드는 비어 있고, 비어 있는 줄은 사람별 상한에서 세지 않는다.
코드는 10분이면 죽고 상한 창은 하루라, 하루가 지나면 빈 줄은 셈에서 저절로 빠진다.
그 사람의 사용자 행이 사라지면 칸만 비운다.

Revision ID: d3f9b2a7e614
Revises: c5e8a1f3d7b2
Create Date: 2026-10-10 10:00:00.000000+09:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d3f9b2a7e614"
down_revision: Union[str, Sequence[str], None] = "c5e8a1f3d7b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 외래키를 칸 안에 붙여 만든다. 따로 `create_foreign_key` 를 부르면 sqlite 스모크가 멈춘다.
    op.add_column(
        "login_codes",
        sa.Column(
            "requested_by_user_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey(
                "users.id", name="fk_login_codes_requested_by_user_id", ondelete="SET NULL"
            ),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_login_codes_requested_by_user_id", "login_codes", ["requested_by_user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_login_codes_requested_by_user_id", table_name="login_codes")
    op.drop_column("login_codes", "requested_by_user_id")
