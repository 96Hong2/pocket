"""사용자. 로그인 화면이 없고 익명 식별키 해시로만 식별한다.

2026-09-14 부터 **이메일을 연결할 수 있다.** 비밀번호는 없다. 여섯 자리 코드를 메일로 받아
그 자리에서 확인하면 이 기기가 그 사람이 된다. 토스 밖(앱스토어)으로 옮길 때 사람을 잃지
않으려는 자리이고, 기기를 바꿔도 기록을 이어 쓰는 길이기도 하다.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, ForeignKey, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Entity, SoftDeleteMixin, str_enum_type


class AgeBand(StrEnum):
    """연령대. 생년월일을 받지 않는다. 구간이면 집계에 충분하고 개인은 가려진다."""

    TEENS = "10s"
    TWENTIES = "20s"
    THIRTIES = "30s"
    FORTIES = "40s"
    FIFTIES = "50s"
    SIXTIES_PLUS = "60s_plus"


class Gender(StrEnum):
    FEMALE = "female"
    MALE = "male"
    # 「말하지 않을래요」. 묻지 않은 것과 갈라 둔다. 물었는데 안 답한 것도 답이다.
    UNDISCLOSED = "undisclosed"


class User(Entity, SoftDeleteMixin):
    __tablename__ = "users"

    # Apps in Toss 익명 식별키 해시. 이름·이메일·전화 같은 개인정보는 저장하지 않는다.
    # (이메일은 예외다. 사용자가 스스로 연결한 것만 아래 email 에 남는다.)
    anon_key_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)

    # 월 경계·하루 가용액 계산 기준 시간대.
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, server_default="Asia/Seoul")

    # 복구 UX 가 며칠 쉬었는지 판단할 때 쓴다.
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── 회원 (선택) ─────────────────────────────────────
    # 코드로 확인한 이메일. 확인 전에는 비어 있다. 소문자로 정규화해 저장한다.
    email: Mapped[str | None] = mapped_column(String(254), nullable=True, unique=True, index=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 연령대·성별. 둘 다 선택이고 「건너뛰기」 가 늘 있다. 분석에만 쓴다.
    age_band: Mapped[AgeBand | None] = mapped_column(
        str_enum_type(AgeBand, name="age_band"), nullable=True
    )
    gender: Mapped[Gender | None] = mapped_column(
        str_enum_type(Gender, name="gender"), nullable=True
    )
    # 연령대·성별을 물어본 시각. 건너뛰었어도 찍는다. 두 번 묻지 않기 위한 값이다.
    profile_asked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class UserDevice(Entity):
    """다른 기기의 익명키를 이 사람에게 잇는다.

    이메일로 확인한 사람이 새 기기에서 열면, 그 기기의 익명키가 여기 한 줄로 그 사람을
    가리킨다. `users.anon_key_hash` 는 처음 만든 기기 하나뿐이라 이 표가 나머지를 든다.
    조회는 이 표를 먼저 본다.
    """

    __tablename__ = "user_devices"

    anon_key_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )


class LoginCode(Entity):
    """메일로 보낸 여섯 자리 코드. 원문은 남기지 않고 해시만 둔다.

    한 번 쓰면 `consumed_at` 이 찍히고 다시는 안 통한다. 틀린 횟수가 상한을 넘어도 죽는다.
    """

    __tablename__ = "login_codes"

    email: Mapped[str] = mapped_column(String(254), nullable=False, index=True)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
