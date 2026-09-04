"""설정 API 스키마.

지금 여는 값은 자동 이어쓰기 하나뿐이다. 예산 화면의 토글이 이 값을 읽고 쓴다.
앱 설정 전체(홈 히어로·알림 등)는 뒤 마일스톤 몫이라 여기서 미리 열지 않는다.
"""

from __future__ import annotations

from pydantic import BaseModel

__all__ = ["PreferencesOut", "PreferencesPatch"]


class PreferencesOut(BaseModel):
    # 새 기간에 예산이 없으면 직전 기간 예산을 복사할지.
    budget_auto_carryover: bool


class PreferencesPatch(BaseModel):
    """보낸 필드만 고친다.

    필드를 빼는 것과 null 을 보내는 것이 같다. 둘 다 "이 값은 그대로 둔다" 는 뜻이다.
    스키마가 null 을 허용한다고 말해 두고 실제로는 422 로 막으면, 생성 타입을 보고 쓴
    클라이언트가 런타임에야 막힌다. 넘어온 null 은 service 가 건너뛴다.
    """

    budget_auto_carryover: bool | None = None
