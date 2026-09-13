"""사용자 설정. 첫 기록 전에는 아무것도 묻지 않으므로 전부 기본값이 있다."""

from __future__ import annotations

import uuid
from datetime import date, time
from enum import StrEnum

from sqlalchemy import JSON, Boolean, Date, ForeignKey, String, Text, Time, text
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
    """기록 시트의 칩에서 **뺀** 분류의 id.

    보일 것이 아니라 **숨긴 것**을 적는다. 그래야 비어 있는 것이 곧 「전부 보인다」 라서
    기본값에 손댈 일이 없고, 새로 만든 분류도 저절로 보인다. 보일 것을 적으면 분류가
    하나 생길 때마다 이 목록을 함께 고쳐야 하고, 한 번이라도 빠뜨리면 만든 분류가
    어디에도 안 나온다.

    카테고리 행에 못 두는 이유는 기본 분류가 **모두가 같이 보는 한 행**이기 때문이다.
    거기에 적으면 한 사람이 끈 것이 전부에게 꺼진다.

    지운 분류의 id 가 남을 수 있다. 있는지만 보는 값이라 그대로 둔다.

    왜 컬럼도 조인 표도 아닌지는 ADR-0020 에 있다.
    """
    quick_hidden_category_ids: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, server_default=text("'[]'")
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
