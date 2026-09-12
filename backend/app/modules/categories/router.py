"""카테고리 엔드포인트.

기본 카테고리는 모든 사용자가 같은 행을 보므로 이름·아이콘은 조회만 된다.
내가 만든 분류는 이름과 아이콘을 고치고 지울 수 있고, 지워도 과거 거래는 그대로 남는다.

**`is_quick` 만은 기본 카테고리에도 걸린다.** 그 값은 카테고리 행이 아니라 내 설정에 남아
다른 사람에게 번지지 않는다. 기록 화면에 무엇을 먼저 둘지는 각자 정할 일이다.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES
from app.models import Category
from app.modules.categories import service
from app.modules.categories.schemas import (
    CategoryCreate,
    CategoryListOut,
    CategoryOut,
    CategoryUpdate,
)

router = APIRouter(prefix="/categories", tags=["categories"], responses=ERROR_RESPONSES)


def _out(row: Category, hidden: set[str]) -> CategoryOut:
    return CategoryOut(
        id=row.id,
        name=row.name,
        kind=row.kind,
        icon_key=row.icon_key,
        icon_custom=row.icon_custom,
        is_quick=str(row.id) not in hidden,
        sort_order=row.sort_order,
        is_default=row.user_id is None,
    )


@router.get("", response_model=CategoryListOut)
def index(session: DbSession, user: CurrentUser) -> CategoryListOut:
    hidden = service.quick_hidden_ids(session, user)
    rows = service.list_categories(session, user)
    return CategoryListOut(items=[_out(row, hidden) for row in rows])


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create(body: CategoryCreate, session: DbSession, user: CurrentUser) -> CategoryOut:
    row = service.create_category(session, user, body)
    return _out(row, service.quick_hidden_ids(session, user))


@router.patch("/{category_id}", response_model=CategoryOut)
def update(
    category_id: uuid.UUID, body: CategoryUpdate, session: DbSession, user: CurrentUser
) -> CategoryOut:
    # 기록 화면에 보일지는 내 설정이라 기본 분류에도 건다. 나머지 값은 내가 만든 것만 고친다.
    if body.is_quick is not None:
        service.require_owned(session, user, category_id)
        service.set_quick(session, user, category_id, body.is_quick)

    row = (
        service.update_category(session, user, category_id, body)
        if body.model_fields_set - {"is_quick"}
        else service.require_seen(session, user, category_id)
    )
    return _out(row, service.quick_hidden_ids(session, user))


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def destroy(category_id: uuid.UUID, session: DbSession, user: CurrentUser) -> Response:
    service.delete_category(session, user, category_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
