"""SQLAlchemy 선언 베이스와 공통 믹스인."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import DateTime, Enum as SAEnum, MetaData, Numeric, Uuid, func
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column

# 제약·인덱스 이름을 규칙으로 고정해야 alembic 이 이름 없는 제약도 지울 수 있다.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s",
    "pk": "pk_%(table_name)s",
}

# 금액 컬럼 타입. 소수점 없는 원 단위이고 양수로 저장한다. 의미는 type 이 구분한다.
# 이름 끝에 Column 을 붙인 이유: app/domain/money.py 의 값 객체 Money 와 헷갈리지 않기 위해서다.
MoneyColumn = Numeric(14, 0)
LargeMoneyColumn = Numeric(16, 0)


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)

    type_annotation_map = {
        uuid.UUID: Uuid(as_uuid=True),
        datetime: DateTime(timezone=True),
        Decimal: MoneyColumn,
    }


def str_enum_type(enum_class: type[StrEnum], *, name: str) -> SAEnum:
    """StrEnum 을 DB 에 문자열로 저장한다. 네이티브 enum 타입을 만들지 않아 값 추가가 쉽다."""
    return SAEnum(
        enum_class,
        name=name,
        native_enum=False,
        length=32,
        validate_strings=True,
        values_callable=lambda members: [member.value for member in members],
    )


class UUIDPrimaryKeyMixin:
    @declared_attr
    def id(cls) -> Mapped[uuid.UUID]:
        return mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    @declared_attr
    def created_at(cls) -> Mapped[datetime]:
        return mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    @declared_attr
    def updated_at(cls) -> Mapped[datetime]:
        return mapped_column(
            DateTime(timezone=True),
            nullable=False,
            server_default=func.now(),
            onupdate=func.now(),
        )


class SoftDeleteMixin:
    """삭제해도 행을 남긴다. 집계는 deleted_at IS NULL 인 행만 센다."""

    @declared_attr
    def deleted_at(cls) -> Mapped[datetime | None]:
        return mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None


class Entity(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __abstract__ = True
