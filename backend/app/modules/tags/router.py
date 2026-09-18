"""태그 엔드포인트.

목록 하나가 지출 태그와 수입 태그를 같이 준다. 화면이 `kind` 로 갈라 쓴다.
따로 두 번 부르면 태그를 만든 직후 한쪽만 새로 와서, 방금 만든 것이 안 보인다.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES
from app.models import Tag
from app.modules.tags import service
from app.modules.tags.schemas import TagCreate, TagListOut, TagOut, TagUpdate

router = APIRouter(prefix="/tags", tags=["tags"], responses=ERROR_RESPONSES)


def _out(row: Tag, usage: dict[uuid.UUID, int]) -> TagOut:
    return TagOut(
        id=row.id,
        name=row.name,
        color=row.color,
        kind=row.kind,
        sort_order=row.sort_order,
        usage_count=usage.get(row.id, 0),
    )


def _list(session: DbSession, user: CurrentUser) -> TagListOut:
    usage = service.usage_counts(session, user)
    return TagListOut(items=[_out(row, usage) for row in service.list_tags(session, user)])


@router.get("", response_model=TagListOut)
def index(session: DbSession, user: CurrentUser) -> TagListOut:
    return _list(session, user)


@router.post("", response_model=TagListOut, status_code=status.HTTP_201_CREATED)
def create(body: TagCreate, session: DbSession, user: CurrentUser) -> TagListOut:
    """만든 뒤 목록 전체를 돌려준다. 화면이 받은 것을 그대로 캐시에 넣는다."""
    service.create_tag(session, user, body)
    return _list(session, user)


@router.patch("/{tag_id}", response_model=TagListOut)
def update(tag_id: uuid.UUID, body: TagUpdate, session: DbSession, user: CurrentUser) -> TagListOut:
    service.update_tag(session, user, tag_id, body)
    return _list(session, user)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def destroy(tag_id: uuid.UUID, session: DbSession, user: CurrentUser) -> Response:
    """태그만 지운다. 그 태그로 적어 둔 기록은 남는다."""
    service.delete_tag(session, user, tag_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
