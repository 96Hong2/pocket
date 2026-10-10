"""공유 가계부 시작일, 회비 비율과 금액, 입금 기록

`books.month_start_day` 는 가계부의 한 달이 시작하는 날(1 ~ 28)이다(ADR-0050). 기본 1 이라
지금 가계부는 그대로 달력 월이다. `books.share_percents` 는 멤버 id 별 회비 비율이고 비면 똑같이,
`books.dues_amount` 는 각자 입금 가계부의 한 달 회비다. 둘 다 지금 가계부는 비어 있다.

`book_entries.kind` 는 expense 또는 deposit 이다. 지금 기록은 전부 expense 로 채운다.
다른 enum 칸처럼 VARCHAR 로 두고 값 제약은 걸지 않는다.

칸을 더하기만 한다. 옛 번들은 이 칸들을 모르고 지금처럼 쓴다.
범위 제약은 PostgreSQL 에만 건다. sqlite 는 있는 표에 제약을 더하지 못해 스모크가 멈춘다.

내려갈 때는 입금 줄에 지운 표시를 먼저 한다. 앞 리비전의 코드는 종류를 몰라 입금을 지출로 센다.
지운 표시만 하므로 다시 올리면 `kind` 는 expense 로 채워져 살아나지 않는다. 시작일, 비율, 회비는
버린다. 그 사이 시작일로 끝낸 정산의 기간 키는 달력 월로 다시 읽힌다.

Revision ID: d8f2b6a4c913
Revises: c5e8a1f3d7b2
Create Date: 2026-10-10 15:00:00.000000+09:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d8f2b6a4c913"
down_revision: Union[str, Sequence[str], None] = "c5e8a1f3d7b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "books",
        sa.Column("month_start_day", sa.SmallInteger(), server_default=sa.text("1"), nullable=False),
    )
    op.add_column("books", sa.Column("share_percents", sa.JSON(), nullable=True))
    op.add_column("books", sa.Column("dues_amount", sa.Numeric(14, 0), nullable=True))
    op.add_column(
        "book_entries",
        sa.Column("kind", sa.String(length=32), server_default=sa.text("'expense'"), nullable=False),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.create_check_constraint(
            op.f("ck_books_month_start_day_range"),
            "books",
            "month_start_day >= 1 AND month_start_day <= 28",
        )
        op.create_check_constraint(
            op.f("ck_books_dues_amount_positive"),
            "books",
            "dues_amount IS NULL OR dues_amount > 0",
        )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE book_entries SET deleted_at = CURRENT_TIMESTAMP "
            "WHERE kind = 'deposit' AND deleted_at IS NULL"
        )
    )
    if op.get_bind().dialect.name == "postgresql":
        op.drop_constraint(op.f("ck_books_dues_amount_positive"), "books", type_="check")
        op.drop_constraint(op.f("ck_books_month_start_day_range"), "books", type_="check")
    op.drop_column("book_entries", "kind")
    op.drop_column("books", "dues_amount")
    op.drop_column("books", "share_percents")
    op.drop_column("books", "month_start_day")
