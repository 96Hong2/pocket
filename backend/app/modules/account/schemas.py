"""계정 요청·응답 본문."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.user import AgeBand, Gender

__all__ = [
    "EmailStartIn",
    "EmailVerifyIn",
    "EmailVerifyOut",
    "LoginCodePeekOut",
    "MeOut",
    "ProfilePatch",
    "ResetIn",
]


class ResetIn(BaseModel):
    """되돌릴 수 없는 요청이라 본문으로 한 번 더 못을 박는다.

    화면에서 이미 동의 체크를 받지만, 그 확인은 화면에만 있다. 잘못 만든 요청 하나가
    남의 몇 달치를 지우는 자리라, 서버도 뜻이 분명한 값을 요구한다.
    """

    confirm: Literal[True]


class MeOut(BaseModel):
    """내 계정. 화면이 「연결했나 · 무엇을 물었나」 를 이걸로 그린다."""

    # 코드로 확인한 이메일. 아직 연결 전이면 null.
    email: str | None
    age_band: AgeBand | None
    gender: Gender | None
    # 연령대·성별을 이미 물었나. 건너뛰었어도 true. 두 번 묻지 않는다.
    profile_asked: bool
    # 이메일 연결을 지금 쓸 수 있나. 운영에 메일 발송 수단이 없으면 false 고 화면은 입구를 감춘다.
    email_login_available: bool


class EmailStartIn(BaseModel):
    email: EmailStr


class EmailVerifyIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)

    @field_validator("code")
    @classmethod
    def _digits_only(cls, value: str) -> str:
        if not value.isdigit():
            raise ValueError("코드는 숫자 여섯 자리예요.")
        return value


class EmailVerifyOut(BaseModel):
    """확인 결과. `result` 가 무슨 일이 있었는지 말한다.

    - `linked`   이 기기의 계정에 이메일을 붙였다
    - `switched` 이 기기를 그 이메일의 기존 계정으로 옮겼다(이 기기에는 기록이 없었다)
    - `merged`   이 기기의 기록을 그 이메일의 기존 계정에 합쳤다
    """

    result: Literal["linked", "switched", "merged"]
    me: MeOut


class ProfilePatch(BaseModel):
    """연령대·성별. 둘 다 선택이다. 아무것도 안 보내도 「물었다」 는 표시만 남는다."""

    age_band: AgeBand | None = None
    gender: Gender | None = None


class LoginCodePeekOut(BaseModel):
    """로컬 전용. 스텁이 보낸 코드를 e2e 가 읽는다."""

    code: str
