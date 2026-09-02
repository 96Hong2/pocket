"""사용자. 로그인 화면이 없고 익명 식별키 해시로만 식별한다."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Entity, SoftDeleteMixin


class User(Entity, SoftDeleteMixin):
    __tablename__ = "users"

    # Apps in Toss 익명 식별키 해시. 이름·이메일·전화 같은 개인정보는 저장하지 않는다.
    anon_key_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)

    # 월 경계·하루 가용액 계산 기준 시간대.
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, server_default="Asia/Seoul")

    # 복구 UX 가 며칠 쉬었는지 판단할 때 쓴다.
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
