"""반복 지출. 매달 같은 날 나가는 돈을 미리 적어 둔다.

**거래를 자동으로 만들지 않는다.** 구독을 해지했는데 가계부에는 계속 찍히면, 그 가계부는
사실이 아니게 된다. 여기 있는 것은 "그날 이런 돈이 나갈 거예요" 라는 예고뿐이고,
기록으로 만드는 것은 사람이 누른다.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Entity, MoneyColumn, SoftDeleteMixin, str_enum_type
from app.domain.aggregation import PaymentMethod

__all__ = ["RecurringExpense"]


class RecurringExpense(Entity, SoftDeleteMixin):
    __tablename__ = "recurring_expenses"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        # 31일에 걸어 둔 것은 그 달 마지막 날로 당겨 본다. 2월이 없는 달이 되지 않게.
        CheckConstraint("day_of_month >= 1 AND day_of_month <= 31", name="day_of_month_range"),
        Index("ix_recurring_expenses_user_id_day_of_month", "user_id", "day_of_month"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # 무엇이 나가나. 「넷플릭스」 처럼 그 사람이 알아볼 이름이다. 그대로 거래의 상호가 된다.
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MoneyColumn, nullable=False)
    day_of_month: Mapped[int] = mapped_column(Integer, nullable=False)

    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    tag_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tags.id", ondelete="SET NULL"), nullable=True
    )
    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        str_enum_type(PaymentMethod, name="payment_method"), nullable=True
    )

    # 잠시 꺼 두는 자리. 지우면 이력이 사라지지만 끄면 다시 켤 수 있다.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    # 이 예고로 기록을 만든 마지막 날. 같은 달에 두 번 묻지 않는 기준이다.
    last_recorded_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # 「이번 달은 됐어요」 를 누른 날. 그 달 안에는 다시 묻지 않는다.
    dismissed_on: Mapped[date | None] = mapped_column(Date, nullable=True)
