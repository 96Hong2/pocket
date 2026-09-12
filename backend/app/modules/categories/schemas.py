"""카테고리 API 스키마.

종류는 domain 의 enum 을 그대로 쓴다. 값 목록을 여기 다시 적지 않는다.
그래야 openapi.json 에 enum 이 실려 프론트 타입이 문자열로 뭉개지지 않는다.

만들 때 종류를 지출과 수입 중에서 고른다. 안 보내면 지출이다. 이체는 화살표 한 줄이라
사용자가 새로 만들 것이 없어 막는다.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from pydantic import BaseModel, StringConstraints, field_validator, model_validator

from app.domain.categories import CategoryKind
from app.domain.category_icons import (
    CUSTOM_ICON_MAX_LENGTH,
    InvalidCustomIcon,
    normalize_custom_icon,
)

__all__ = ["CategoryCreate", "CategoryListOut", "CategoryOut", "CategoryUpdate"]

# 길이는 공백을 지운 뒤에 잰다. 공백만 보낸 이름이 통과하면 목록에 빈 칩이 선다.
# 상한은 컬럼 폭과 같다. 여기서 안 막으면 DB 가 자르거나 터진다.
CategoryName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
IconKey = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
# 이모지 하나이거나 data:image URI 다. 형식 판정은 domain 이 한다.
CustomIcon = Annotated[str, StringConstraints(max_length=CUSTOM_ICON_MAX_LENGTH)]


def _clean_custom_icon(value: str | None) -> str | None:
    """왜 못 쓰는지는 domain 이 안다. 화면에 그대로 갈 문구라 여기서 새로 짓지 않는다."""
    try:
        return normalize_custom_icon(value)
    except InvalidCustomIcon as error:
        raise ValueError(str(error)) from error


class CategoryOut(BaseModel):
    id: uuid.UUID
    name: str
    kind: CategoryKind
    # frontend/public/icons/sm/<icon_key>.png 와 1:1 이다.
    icon_key: str
    # 내가 건 이모지나 사진. 있으면 화면이 icon_key 대신 이걸 그린다.
    icon_custom: str | None = None
    # 기록 시트의 칩에 먼저 보일지. 사람마다 다른 값이라 카테고리 행이 아니라
    # 내 설정에서 나온다(service.quick_hidden_ids). 화면은 이것으로 칩과 「더 보기」 를 가른다.
    is_quick: bool = True
    sort_order: int
    # 모든 사용자에게 보이는 기본 카테고리인지. 내가 만든 것은 false 다.
    is_default: bool


class CategoryListOut(BaseModel):
    items: list[CategoryOut]


class CategoryCreate(BaseModel):
    """종류는 만들 때만 정한다. 나중에 바꾸는 길은 두지 않았다.

    지출이던 분류를 수입으로 바꾸면 그 분류로 적어 둔 지난 거래가 종류와 어긋나고,
    이미 본 리포트의 숫자가 나중에 달라진다.

    `icon_key` 는 사진을 걸어도 함께 받는다. 컬럼이 NOT NULL 이기도 하고, 사진을 지웠을 때
    돌아갈 자리가 있어야 한다.
    """

    name: CategoryName
    icon_key: IconKey
    # 안 보내면 앱에 든 아이콘(icon_key)을 그린다.
    icon_custom: CustomIcon | None = None
    kind: CategoryKind = CategoryKind.EXPENSE

    @field_validator("icon_custom")
    @classmethod
    def _valid_custom(cls, value: str | None) -> str | None:
        return _clean_custom_icon(value)

    @field_validator("kind")
    @classmethod
    def _creatable(cls, value: CategoryKind) -> CategoryKind:
        if value is CategoryKind.TRANSFER:
            raise ValueError("이체는 새로 만들 수 없어요.")
        return value


class CategoryUpdate(BaseModel):
    """보낸 필드만 바꾼다. 종류와 순서는 서버가 정한 값을 그대로 둔다.

    필드를 빼는 것과 null 을 보내는 것이 같다. 둘 다 "이 값은 그대로 둔다" 는 뜻이고
    service 가 null 을 건너뛴다. 이름과 아이콘은 비워 둘 수 있는 값이 아니라 지우는 길을
    두지 않았다. 목표(`target_date`)·알림(`remind_at`)처럼 null 이 '지운다' 인 곳과 다르다.

    **아이콘 둘은 한 번에 하나만 보낸다.** 걸리는 아이콘은 어차피 하나라, 한쪽을 보내면
    다른 쪽이 지워진다. 사진을 걸었다가 기본 아이콘으로 되돌리는 길도 이것뿐이다
    (`icon_custom: null` 은 "그대로 둔다" 라서 되돌리기가 되지 않는다).
    """

    name: CategoryName | None = None
    icon_key: IconKey | None = None
    icon_custom: CustomIcon | None = None
    # 이 값만은 false 가 뜻이 있다. null 이 '그대로 둔다' 이고 false 는 '끈다' 다.
    # **기본 분류에도 걸린다.** 이름·아이콘과 달리 내 설정에만 남기 때문이다.
    is_quick: bool | None = None

    @field_validator("icon_custom")
    @classmethod
    def _valid_custom(cls, value: str | None) -> str | None:
        return _clean_custom_icon(value)

    @model_validator(mode="after")
    def _single_icon(self) -> CategoryUpdate:
        if {"icon_key", "icon_custom"} <= self.model_fields_set:
            raise ValueError("아이콘은 하나만 고를 수 있어요.")
        return self
