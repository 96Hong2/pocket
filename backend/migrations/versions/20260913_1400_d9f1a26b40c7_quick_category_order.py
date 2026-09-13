"""기록 화면에 보일 분류의 순서

칩은 이제 앞자리 열한 개만 세우고 나머지는 「더 보기」 뒤로 간다. 그러면 **무엇이 앞에
서는지**가 값이 되므로, 사용자가 그 순서를 정할 자리가 필요하다.

`quick_hidden_category_ids` 와 같은 이유로 카테고리 행이 아니라 사용자 설정에 둔다.
기본 분류는 모두가 같은 행을 봐서, 거기에 순서를 적으면 한 사람이 옮긴 것이 전부에게 옮겨진다.

**빈 목록이 곧 「서버가 준 순서 그대로」다.** 목록에 없는 분류는 지금까지와 같은 자리에
서므로, 이 마이그레이션 하나로 이미 쓰던 사람의 칩 순서가 바뀌지 않는다. 새로 만든 분류도
목록에 없으니 저절로 제자리에 선다.

Revision ID: d9f1a26b40c7
Revises: c7e2f48b91a5
Create Date: 2026-09-13 14:00:00.000000+09:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d9f1a26b40c7"
down_revision: Union[str, Sequence[str], None] = "c7e2f48b91a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "user_preferences"
COLUMN = "quick_category_order"


def upgrade() -> None:
    op.add_column(
        TABLE,
        sa.Column(COLUMN, sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )


def downgrade() -> None:
    op.drop_column(TABLE, COLUMN)
