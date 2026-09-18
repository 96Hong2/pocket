"""태그 API 스키마.

색과 종류는 domain 의 enum 을 그대로 쓴다. 값 목록을 여기 다시 적지 않아야
openapi.json 에 enum 이 실리고, 프론트 타입이 문자열로 뭉개지지 않는다.

**종류는 만들 때만 정한다.** 지출 태그를 수입 태그로 바꾸면 그 태그로 적어 둔 지난
기록이 종류와 어긋나고, 이미 본 리포트의 숫자가 나중에 달라진다. 카테고리와 같은 규칙이다.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from pydantic import BaseModel, StringConstraints

from app.domain.tags import TAG_NAME_MAX, TagColor, TagKind

__all__ = ["TagCreate", "TagListOut", "TagOut", "TagUpdate"]

# 길이는 공백을 지운 뒤에 잰다. 공백만 보낸 이름이 통과하면 목록에 빈 칩이 선다.
TagName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=TAG_NAME_MAX)
]


class TagOut(BaseModel):
    id: uuid.UUID
    name: str
    color: TagColor
    kind: TagKind
    sort_order: int
    # 이 태그로 적어 둔 기록 수. 지우기 전에 "몇 건이 이 태그를 잃나" 를 말하는 데 쓴다.
    usage_count: int = 0


class TagListOut(BaseModel):
    items: list[TagOut]


class TagCreate(BaseModel):
    name: TagName
    color: TagColor = TagColor.SAGE
    kind: TagKind = TagKind.EXPENSE


class TagUpdate(BaseModel):
    """보낸 필드만 바꾼다. null 은 '그대로 둔다' 다.

    이름도 색도 비워 둘 수 있는 값이 아니라 지우는 길을 두지 않았다.
    """

    name: TagName | None = None
    color: TagColor | None = None
