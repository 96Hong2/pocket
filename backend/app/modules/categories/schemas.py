"""카테고리 API 스키마.

종류는 domain 의 enum 을 그대로 쓴다. 값 목록을 여기 다시 적지 않는다.
그래야 openapi.json 에 enum 이 실려 프론트 타입이 문자열로 뭉개지지 않는다.

만들 때 kind 를 받지 않는다. 서버가 지출로 고정한다. 기록 시트의 칩이 지출만 걸러
보여주기 때문에, 수입 분류를 만들면 정작 고를 자리가 화면에 없다.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from pydantic import BaseModel, StringConstraints

from app.domain.categories import CategoryKind

__all__ = ["CategoryCreate", "CategoryListOut", "CategoryOut", "CategoryUpdate"]

# 길이는 공백을 지운 뒤에 잰다. 공백만 보낸 이름이 통과하면 목록에 빈 칩이 선다.
# 상한은 컬럼 폭과 같다. 여기서 안 막으면 DB 가 자르거나 터진다.
CategoryName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
IconKey = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]


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


class CategoryCreate(BaseModel):
    name: CategoryName
    icon_key: IconKey


class CategoryUpdate(BaseModel):
    """보낸 필드만 바꾼다. 종류와 순서는 서버가 정한 값을 그대로 둔다."""

    name: CategoryName | None = None
    icon_key: IconKey | None = None
