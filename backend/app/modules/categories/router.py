"""카테고리 엔드포인트."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES
from app.modules.categories import service
from app.modules.categories.schemas import CategoryListOut, CategoryOut

router = APIRouter(prefix="/categories", tags=["categories"], responses=ERROR_RESPONSES)


@router.get("", response_model=CategoryListOut)
def index(session: DbSession, user: CurrentUser) -> CategoryListOut:
    rows = service.list_categories(session, user)
    return CategoryListOut(
        items=[
            CategoryOut(
                id=row.id,
                name=row.name,
                kind=row.kind,
                icon_key=row.icon_key,
                sort_order=row.sort_order,
                is_default=row.user_id is None,
            )
            for row in rows
        ]
    )
