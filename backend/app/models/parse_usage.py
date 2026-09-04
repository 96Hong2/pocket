"""줄글·캡처 분석을 몇 번 불렀는지 남기는 기록.

비용이 얼마나 드는지 재기 위한 것이다. 그래서 **원문을 담지 않는다.**
남기는 것은 길이와 건수처럼 세는 값뿐이고, 이 표만 봐서는 무엇을 적었는지 알 수 없다.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Entity, str_enum_type
from app.models.transaction import TransactionSource


class ParseUsage(Entity):
    __tablename__ = "parse_usages"
    __table_args__ = (Index("ix_parse_usages_user_id_created_at", "user_id", "created_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    source: Mapped[TransactionSource] = mapped_column(
        str_enum_type(TransactionSource, name="transaction_source"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    # 스텁으로 잰 수치를 실제 모델의 성능으로 오해하지 않게 함께 남긴다.
    is_stub: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    # 글자 수만 센다. 무엇을 적었는지는 남기지 않는다.
    input_length: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    # 보내기 전에 가린 숫자 뭉치가 몇 개였는지. 가리는 규칙이 실제로 도는지 확인한다.
    redacted_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    candidate_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
