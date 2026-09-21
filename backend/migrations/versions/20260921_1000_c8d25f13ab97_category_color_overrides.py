"""카테고리 바탕색과 기본 분류 덮어쓰기

분류마다 아이콘 뒤에 바탕색을 깐다. 안 고른 분류는 비어 있고 화면이 무채색 바탕을 쓴다.
색 목록은 태그와 같은 열넷이다.

기본 분류는 모두가 같은 한 행을 본다. 그 행에 이름을 고쳐 적으면 한 사람이 바꾼 이름이
전부에게 번지므로, 이름·아이콘·색을 고치면 **내 설정에 덮어쓰기**가 남는다.
기록 화면에 보일지(`quick_hidden_category_ids`)를 설정에 둔 것과 같은 이유다.

Revision ID: c8d25f13ab97
Revises: b3f71d2ac845
Create Date: 2026-09-21 10:00:00.000000+09:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c8d25f13ab97"
down_revision: Union[str, Sequence[str], None] = "b3f71d2ac845"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 색 값에 CHECK 를 걸지 않는다. 태그 색과 같은 이유로, 나중에 색을 더 늘릴 때
    # 마이그레이션이 필요 없어야 한다(app/domain/tags.py).
    op.add_column("categories", sa.Column("color", sa.String(length=16), nullable=True))
    op.add_column(
        "user_preferences",
        sa.Column(
            "category_overrides",
            sa.JSON(),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "category_overrides")
    op.drop_column("categories", "color")
