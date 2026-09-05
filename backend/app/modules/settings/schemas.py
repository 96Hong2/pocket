"""설정 API 스키마.

지금 여는 값은 자동 이어쓰기와 홈 표시 방식 둘이다. 예산 화면의 토글과 홈이 각각 읽고 쓴다.
알림처럼 아직 화면이 없는 설정은 여기 열지 않는다.

홈 표시 방식은 모델의 enum 을 그대로 쓴다. 값 목록을 여기 다시 적지 않는다.
그래야 openapi.json 에 enum 이 실려 프론트 타입이 문자열로 뭉개지지 않는다.
"""

from __future__ import annotations

from pydantic import BaseModel

from app.models.preference import HomeHero

__all__ = ["PreferencesOut", "PreferencesPatch"]


class PreferencesOut(BaseModel):
    # 새 기간에 예산이 없으면 직전 기간 예산을 복사할지.
    budget_auto_carryover: bool
    # 홈 맨 위에 무엇을 크게 보여줄지.
    home_hero: HomeHero


class PreferencesPatch(BaseModel):
    """보낸 필드만 고친다.

    필드를 빼는 것과 null 을 보내는 것이 같다. 둘 다 "이 값은 그대로 둔다" 는 뜻이다.
    스키마가 null 을 허용한다고 말해 두고 실제로는 422 로 막으면, 생성 타입을 보고 쓴
    클라이언트가 런타임에야 막힌다. 넘어온 null 은 service 가 건너뛴다.
    """

    budget_auto_carryover: bool | None = None
    home_hero: HomeHero | None = None
