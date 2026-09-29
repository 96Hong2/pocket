"""공유 가계부에 줄글·캡처·영수증으로 적기, 옮기기 되돌리기

검토 묶음이 어느 공유 가계부에 적을 것인지(`import_batches.book_id`), 후보가 고른 공유 분류와
저장된 공유 기록(`import_candidates.book_category_id`, `book_entry_id`)을 둔다. 후보의
`category_id` 는 개인 분류 외래키라 공유 분류를 담을 수 없다.

공유 기록에는 옮기기로 이어진 개인 거래를 적는다. 되돌리기가 새 거래를 만들지 않고 원본을
그대로 살리려면 어느 거래였는지 알아야 한다. 거래가 지워져도 기록은 남으므로 SET NULL 이다.

외래키는 칸 안에 붙여 만든다. 따로 `create_foreign_key` 를 부르면 sqlite 스모크가 멈춘다.

Revision ID: e7a4c2d9b15f
Revises: d6e1a93b7c20
Create Date: 2026-09-29 10:00:00.000000+09:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e7a4c2d9b15f"
down_revision: Union[str, Sequence[str], None] = "d6e1a93b7c20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _link(table: str, column: str, target: str, ondelete: str) -> None:
    op.add_column(
        table,
        sa.Column(
            column,
            sa.Uuid(as_uuid=True),
            sa.ForeignKey(f"{target}.id", name=f"fk_{table}_{column}", ondelete=ondelete),
            nullable=True,
        ),
    )


def upgrade() -> None:
    _link("import_batches", "book_id", "books", "CASCADE")
    _link("import_candidates", "book_category_id", "book_categories", "SET NULL")
    _link("import_candidates", "book_entry_id", "book_entries", "SET NULL")
    _link("book_entries", "moved_from_transaction_id", "transactions", "SET NULL")
    _link("book_entries", "moved_to_transaction_id", "transactions", "SET NULL")


def downgrade() -> None:
    op.drop_column("book_entries", "moved_to_transaction_id")
    op.drop_column("book_entries", "moved_from_transaction_id")
    op.drop_column("import_candidates", "book_entry_id")
    op.drop_column("import_candidates", "book_category_id")
    op.drop_column("import_batches", "book_id")
