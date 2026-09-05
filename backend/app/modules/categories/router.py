"""카테고리 엔드포인트.

기본 카테고리는 모든 사용자가 같은 행을 보므로 조회만 된다.
내가 만든 분류는 이름과 아이콘을 고치고 지울 수 있고, 지워도 과거 거래는 그대로 남는다.
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


def _out(row: Category) -> CategoryOut:
    return CategoryOut(
        id=row.id,
        name=row.name,
        kind=row.kind,
        icon_key=row.icon_key,
        sort_order=row.sort_order,
        is_default=row.user_id is None,
    )


@router.get("", response_model=CategoryListOut)
def index(session: DbSession, user: CurrentUser) -> CategoryListOut:
    return CategoryListOut(items=[_out(row) for row in service.list_categories(session, user)])


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create(body: CategoryCreate, session: DbSession, user: CurrentUser) -> CategoryOut:
    return _out(service.create_category(session, user, body))


@router.patch("/{category_id}", response_model=CategoryOut)
def update(
    category_id: uuid.UUID, body: CategoryUpdate, session: DbSession, user: CurrentUser
) -> CategoryOut:
    return _out(service.update_category(session, user, category_id, body))


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def destroy(category_id: uuid.UUID, session: DbSession, user: CurrentUser) -> Response:
    service.delete_category(session, user, category_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
