"""카테고리 엔드포인트.

기본 카테고리는 모든 사용자가 같은 행을 본다. 그래서 이름·아이콘·색을 고치면 그 행이
아니라 **내 설정에 덮어쓰기**가 남는다. 남의 화면은 그대로다. 지우는 것만은 여전히
내가 만든 분류에서만 된다. 공용 행을 지우면 그 분류로 적어 둔 남의 기록이 분류를 잃는다.

`is_quick` 도 같은 이유로 내 설정에 남는다. 기록 화면에 무엇을 먼저 둘지는 각자 정할 일이다.
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
    CategoryOrderIn,
    CategoryOut,
    CategoryUpdate,
)

router = APIRouter(prefix="/categories", tags=["categories"], responses=ERROR_RESPONSES)


def _out(
    row: Category,
    hidden: set[str],
    overrides: dict[str, dict[str, str | None]],
    usage: dict[str, int] | None = None,
) -> CategoryOut:
    """행에 적힌 값이 아니라 **이 사람 화면에 보일 값**을 내보낸다.

    기본 분류를 다르게 부르기로 한 사람에게는 덮어쓰기가 이름·아이콘·색을 대신한다.
    화면이 둘을 합치게 두지 않는다. 합치는 자리가 둘이 되면 목록과 기록 시트가
    서로 다른 이름을 보여 준다.
    """
    icon_key, icon_custom = service.effective_icon(row, overrides)
    return CategoryOut(
        id=row.id,
        name=service.effective_name(row, overrides),
        kind=row.kind,
        icon_key=icon_key,
        icon_custom=icon_custom,
        color=service.effective_color(row, overrides),
        is_quick=str(row.id) not in hidden,
        sort_order=row.sort_order,
        is_default=row.user_id is None,
        usage_count=(usage or {}).get(str(row.id), 0),
    )


@router.get("", response_model=CategoryListOut)
def index(session: DbSession, user: CurrentUser) -> CategoryListOut:
    hidden = service.quick_hidden_ids(session, user)
    usage = service.usage_counts(session, user)
    overrides = service.category_overrides(session, user)
    rows = service.list_categories(session, user)
    return CategoryListOut(items=[_out(row, hidden, overrides, usage) for row in rows])


@router.put("/order", status_code=status.HTTP_204_NO_CONTENT)
def reorder(body: CategoryOrderIn, session: DbSession, user: CurrentUser) -> Response:
    """칩이 설 순서를 정한다.

    `/{category_id}` 보다 **먼저** 서야 한다. 뒤에 두면 "order" 가 uuid 로 읽혀 422 가 난다.
    """
    service.set_quick_order(session, user, body.ids)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create(body: CategoryCreate, session: DbSession, user: CurrentUser) -> CategoryOut:
    row = service.create_category(session, user, body)
    return _out(
        row, service.quick_hidden_ids(session, user), service.category_overrides(session, user)
    )


@router.patch("/{category_id}", response_model=CategoryOut)
def update(
    category_id: uuid.UUID, body: CategoryUpdate, session: DbSession, user: CurrentUser
) -> CategoryOut:
    """보낸 값만 바꾼다. 기록 화면에 보일지도, 기본 분류의 이름·아이콘·색도 내 설정에 남는다.

    **이름·아이콘·색을 먼저 고치고 `is_quick` 을 나중에 건다.** 반대로 두면, 이름이
    겹쳐 저장이 막힌 요청인데 칩만 먼저 꺼진다. 화면은 「저장하지 못했어요」 를 띄우는데
    기록 시트에서는 그 분류가 이미 사라져 있다. 두 쓰기가 한 트랜잭션이 아니라 순서로만
    갈리므로, 되돌릴 수 없는 쪽(칩 끄기)을 뒤에 둔다.
    """
    row = (
        service.update_category(session, user, category_id, body)
        if body.model_fields_set - {"is_quick"}
        else service.require_seen(session, user, category_id)
    )

    if body.is_quick is not None:
        service.require_owned(session, user, category_id)
        service.set_quick(session, user, category_id, body.is_quick)
    return _out(
        row, service.quick_hidden_ids(session, user), service.category_overrides(session, user)
    )


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def destroy(category_id: uuid.UUID, session: DbSession, user: CurrentUser) -> Response:
    service.delete_category(session, user, category_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
