"""회원: 이메일 연결과 연령대·성별, 다른 기기 잇기, 로그인 코드

토스 밖(앱스토어)으로 옮길 때 사람을 잃지 않으려면 익명키 말고 붙잡을 것이 하나 있어야
한다. 비밀번호 없이 **이메일 + 여섯 자리 코드**로 확인하고, 확인한 이메일을 `users.email`
에 둔다. 연령대·성별은 선택이라 비어 있어도 된다.

`user_devices` 는 새 기기의 익명키를 기존 사람에게 잇는다. `users.anon_key_hash` 는 처음
만든 기기 하나뿐이라 이 표가 나머지를 든다. `login_codes` 는 코드 해시만 남긴다.

Revision ID: e3b7c9d1a4f2
Revises: d9f1a26b40c7
Create Date: 2026-09-14 15:00:00.000000+09:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e3b7c9d1a4f2"
down_revision: Union[str, Sequence[str], None] = "d9f1a26b40c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

AGE_BAND = sa.Enum(
    "10s", "20s", "30s", "40s", "50s", "60s_plus", name="age_band", native_enum=False, length=32
)
GENDER = sa.Enum("female", "male", "undisclosed", name="gender", native_enum=False, length=32)


def upgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(length=254), nullable=True))
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("age_band", AGE_BAND, nullable=True))
    op.add_column("users", sa.Column("gender", GENDER, nullable=True))
    op.add_column("users", sa.Column("profile_asked_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "user_devices",
        sa.Column("anon_key_hash", sa.String(length=128), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_user_devices_user_id"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_devices")),
    )
    op.create_index(
        op.f("ix_user_devices_anon_key_hash"), "user_devices", ["anon_key_hash"], unique=True
    )
    op.create_index(op.f("ix_user_devices_user_id"), "user_devices", ["user_id"], unique=False)

    op.create_table(
        "login_codes",
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("code_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_login_codes")),
    )
    op.create_index(op.f("ix_login_codes_email"), "login_codes", ["email"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_login_codes_email"), table_name="login_codes")
    op.drop_table("login_codes")
    op.drop_index(op.f("ix_user_devices_user_id"), table_name="user_devices")
    op.drop_index(op.f("ix_user_devices_anon_key_hash"), table_name="user_devices")
    op.drop_table("user_devices")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_column("users", "profile_asked_at")
    op.drop_column("users", "gender")
    op.drop_column("users", "age_band")
    op.drop_column("users", "email_verified_at")
    op.drop_column("users", "email")
