"""카테고리 API 스키마.

종류는 domain 의 enum 을 그대로 쓴다. 값 목록을 여기 다시 적지 않는다.
그래야 openapi.json 에 enum 이 실려 프론트 타입이 문자열로 뭉개지지 않는다.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel

from app.domain.categories import CategoryKind

__all__ = ["CategoryListOut", "CategoryOut"]


class CategoryOut(BaseModel):
    id: uuid.UUID
    name: str
    kind: CategoryKind
    # frontend/public/icons/sm/<icon_key>.png 와 1:1 이다.
    icon_key: str
    sort_order: int
    # 모든 사용자에게 보이는 기본 카테고리인지. 내가 만든 것은 false 다.
    is_default: bool


class CategoryListOut(BaseModel):
    items: list[CategoryOut]
