"""사용자 설정. 첫 기록 전에는 아무것도 묻지 않으므로 전부 기본값이 있다."""

from __future__ import annotations

import uuid
from datetime import date, time
from enum import StrEnum

from sqlalchemy import Boolean, Date, ForeignKey, String, Text, Time, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Entity, str_enum_type


class HomeHero(StrEnum):
    REMAINING_BUDGET = "remaining_budget"
    INCOME_EXPENSE = "income_expense"
    INCOME_AND_BUDGET = "income_and_budget"


class RecordMethod(StrEnum):
    KEYPAD = "keypad"
    NL = "nl"
    SCREENSHOT = "screenshot"
    RECEIPT = "receipt"


class NotificationFrequency(StrEnum):
    WEEKLY_TWICE = "weekly_twice"
    DAILY = "daily"


class UserPreference(Entity):
    __tablename__ = "user_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    # 새 기간에 예산이 없으면 직전 기간 예산을 복사할지.
    budget_auto_carryover: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    home_hero: Mapped[HomeHero] = mapped_column(
        str_enum_type(HomeHero, name="home_hero"),
        nullable=False,
        server_default=HomeHero.REMAINING_BUDGET.value,
    )
    # 기록 시트를 마지막에 쓴 방식으로 열어 준다.
    last_record_method: Mapped[RecordMethod | None] = mapped_column(
        str_enum_type(RecordMethod, name="record_method"), nullable=True
    )
    # 리포트 기본은 소비만. 사용자가 켜면 수입까지 비교한다.
    report_include_income: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    # 사용자가 지키기로 한 소비 영역. 자동 감축 1순위로 추천하지 않는다.
    happy_spend_category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )


class NotificationSetting(Entity):
    __tablename__ = "notification_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    # 옵트인. 기본은 꺼져 있다.
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    remind_at: Mapped[time | None] = mapped_column(Time, nullable=True)
    frequency: Mapped[NotificationFrequency] = mapped_column(
        str_enum_type(NotificationFrequency, name="notification_frequency"),
        nullable=False,
        server_default=NotificationFrequency.WEEKLY_TWICE.value,
    )
    # 시간대 정본은 users.timezone 이다. 이 컬럼은 초기 스키마에 남아 있지만 아무도 읽지 않는다.
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, server_default="Asia/Seoul")
    # 마지막으로 알림을 보낸 현지 날짜. 같은 날 두 번 보내지 않으려고 남긴다.
    last_reminded_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # 스마트발송에 실을 익명키 원문. users.anon_key_hash 는 sha256 이라 되돌릴 수 없다.
    # **켤 때 채우고 끌 때 지운다.** 알림을 안 쓰는 사람 것은 남기지 않는다.
    # 길이 상한을 안 둔다. 토스 익명키의 최대 길이를 실측한 적이 없고, 넘치면 알림을
    # 켜는 것 자체가 500 이 된다. Text 는 이 크기에서 값이 같다.
    push_anon_key: Mapped[str | None] = mapped_column(Text, nullable=True)
