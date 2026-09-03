"""설정 API 스키마.

지금 여는 값은 자동 이어쓰기 하나뿐이다. 예산 화면의 토글이 이 값을 읽고 쓴다.
앱 설정 전체(홈 히어로·알림 등)는 뒤 마일스톤 몫이라 여기서 미리 열지 않는다.
"""

from __future__ import annotations

from pydantic import BaseModel, field_validator

__all__ = ["PreferencesOut", "PreferencesPatch"]


class PreferencesOut(BaseModel):
    # 새 기간에 예산이 없으면 직전 기간 예산을 복사할지.
    budget_auto_carryover: bool


class PreferencesPatch(BaseModel):
    """보낸 필드만 고친다. 빠진 필드는 지금 값을 그대로 둔다."""

    budget_auto_carryover: bool | None = None

    @field_validator("budget_auto_carryover")
    @classmethod
    def _reject_null(cls, value: bool | None) -> bool:
        """필드를 빼는 것과 null 을 보내는 것은 다르다.

        기본값이 있는 컬럼이라 null 을 그대로 넣으면 제약 위반이 나고, 화면은 요청 형식
        오류 대신 '다시 시도해 주세요' 를 보게 된다. 여기서 422 로 떨어뜨린다.
        """
        if value is None:
            raise ValueError("자동 이어쓰기 설정에는 true 나 false 를 보내 주세요.")
        return value
