"""지출을 무엇으로 냈는지 적을 칸

신용카드·체크카드·현금을 갈라 적는다. 같은 10만원이라도 다음 달에 빠지는 돈이냐 이미
빠진 돈이냐가 다르고, 그것을 못 가르면 「이번 달에 쓴 돈」 과 「이번 달에 나간 돈」 이
같은 숫자로 뭉개진다.

**빈 칸을 허용한다.** 이미 적어 둔 기록에는 이 값이 없고, 앞으로도 안 고르고 넘어갈 수
있어야 한다. '모름' 을 값으로 두면 예전 기록과 일부러 안 고른 기록이 한 칸에 섞인다.

후보(`import_candidates`)에도 같은 칸을 둔다. 영수증에 「신용」 이 찍혀 있으면 읽어서
채우고, 저장할 때 거래로 그대로 넘어간다.

Revision ID: c7e2f48b91a5
Revises: b5d4a71c86e3
Create Date: 2026-09-13 01:00:00.000000+09:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c7e2f48b91a5"
down_revision: Union[str, None] = "b5d4a71c86e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 네이티브 enum 타입을 만들지 않는다. 값을 늘릴 때 ALTER TYPE 이 필요 없다
# (모델의 str_enum_type 과 같은 규칙이다).
_METHOD = sa.Enum(
    "credit",
    "debit",
    "cash",
    name="payment_method",
    native_enum=False,
    length=32,
)


def upgrade() -> None:
    op.add_column("transactions", sa.Column("payment_method", _METHOD, nullable=True))
    op.add_column("import_candidates", sa.Column("payment_method", _METHOD, nullable=True))


def downgrade() -> None:
    op.drop_column("import_candidates", "payment_method")
    op.drop_column("transactions", "payment_method")
