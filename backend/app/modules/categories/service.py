"""카테고리 조회·소유 판정과 내가 만든 카테고리의 생성·수정·삭제.

거래 저장과 카테고리 예산 저장이 같은 소유 규칙을 본다. 두 곳에 나눠 적으면
한쪽만 고쳐져서, 한 화면에서는 막히고 다른 화면에서는 통과하는 값이 생긴다.

소유 판정이 둘이다. 이름이 비슷하니 고를 때 주의한다.
`require_owned` 는 기본 카테고리도 통과시킨다. 거래와 예산은 기본 분류에 붙어야 한다.
`require_own` 은 내가 만든 것만 통과시킨다. 고치고 지우는 자리는 이쪽이다.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.errors import ApiError, ErrorCode
from app.domain.categories import USER_CATEGORY_SORT_ORDER, CategoryKind
from app.models import Category, CategoryBudget, MerchantRule, User
from app.modules.categories.schemas import CategoryCreate, CategoryUpdate

__all__ = [
    "create_category",
    "delete_category",
    "list_categories",
    "require_own",
    "require_owned",
    "update_category",
]

_NOT_FOUND = "카테고리를 찾지 못했어요."
_DUPLICATE = "같은 이름의 카테고리가 이미 있어요."


def list_categories(session: Session, user: User) -> list[Category]:
    """기본 카테고리와 내 카테고리를 함께 준다. 남의 것은 보이지 않는다."""
    stmt = (
        select(Category)
        .where(
            Category.deleted_at.is_(None),
            # NULL 은 IN 으로 못 잡는다. 기본 카테고리(user_id NULL)를 놓치지 않게 따로 쓴다.
            or_(Category.user_id == user.id, Category.user_id.is_(None)),
        )
        .order_by(Category.sort_order, Category.name)
    )
    return list(session.scalars(stmt))


def require_owned(session: Session, user: User, category_id: uuid.UUID | None) -> None:
    """내 카테고리이거나 기본 카테고리(user_id NULL)여야 한다. None 은 '분류 없음'이라 통과."""
    if category_id is None:
        return
    found = session.scalar(
        select(Category.id).where(
            Category.id == category_id,
            Category.deleted_at.is_(None),
            # NULL 은 IN 으로 못 잡는다. 기본 카테고리(user_id NULL)를 놓치지 않게 따로 쓴다.
            or_(Category.user_id == user.id, Category.user_id.is_(None)),
        )
    )
    if found is None:
        raise ApiError(ErrorCode.INVALID_CATEGORY, "카테고리를 찾지 못했어요.", status_code=422)


def _my_row(session: Session, user: User, category_id: uuid.UUID, *, on_default: str) -> Category:
    """소유만 판정한다. 이미 지운 행도 그대로 돌려준다."""
    row = session.get(Category, category_id)
    if row is None or (row.user_id is not None and row.user_id != user.id):
        raise ApiError(ErrorCode.NOT_FOUND, _NOT_FOUND, status_code=404)
    if row.user_id is None:
        raise ApiError(ErrorCode.INVALID_REQUEST, on_default, status_code=422)
    return row


def require_own(
    session: Session, user: User, category_id: uuid.UUID, *, on_default: str
) -> Category:
    """내가 만든, 아직 살아 있는 카테고리.

    기본 카테고리는 모든 사용자가 같은 행을 본다. 여기서 `require_owned` 를 쓰면
    한 사람의 요청이 그 공용 행을 고치거나 지운다. 그래서 판정을 따로 둔다.
    기본 카테고리를 만났을 때 뭐라고 답할지는 부르는 쪽이 정한다.
    """
    row = _my_row(session, user, category_id, on_default=on_default)
    if row.deleted_at is not None:
        raise ApiError(ErrorCode.NOT_FOUND, _NOT_FOUND, status_code=404)
    return row


# ── 이름 겹침 ───────────────────────────────────────────


def _fold(name: str) -> str:
    """저장할 표기. 앞뒤 공백을 지우고 안쪽 연속 공백을 하나로 줄인다."""
    return " ".join(name.split())


def _key(name: str) -> str:
    """겹침을 볼 때 쓰는 값. 공백과 대소문자 차이는 같은 이름으로 본다.

    유니크 인덱스는 바이트가 같아야만 막는다. 그대로 두면 '카페 ' 와 '카페' 가
    목록에 나란히 서서, 사용자 눈에는 같은 이름이 두 줄로 보인다.
    """
    return _fold(name).casefold()


def _comparable(session: Session, user: User) -> list[Category]:
    """이름을 견줄 행 전부. 기본 카테고리와 내 것, 이미 지운 것까지 담는다.

    이 판정을 DB 에 맡길 수 없다. 유니크 키가 (user_id, name) 이라 기본 카테고리의
    '식비'와 내 '식비'는 서로 다른 자리로 통과하고, 공백을 접는 비교는 DB 마다 다르다.
    """
    stmt = (
        select(Category)
        .where(or_(Category.user_id == user.id, Category.user_id.is_(None)))
        .order_by(Category.sort_order, Category.name)
    )
    return list(session.scalars(stmt))


def _reject_duplicate(rows: list[Category], key: str, *, skip_id: uuid.UUID | None = None) -> None:
    taken = any(
        row.deleted_at is None and row.id != skip_id and _key(row.name) == key for row in rows
    )
    if taken:
        raise ApiError(ErrorCode.DUPLICATE_CATEGORY, _DUPLICATE, status_code=409)


def _duplicate_error() -> ApiError:
    """같은 이름이 동시에 들어와 DB 가 막은 경우.

    그대로 두면 전역 IntegrityError 핸들러가 "잠시 후 다시 시도" 라고 답한다.
    이름 충돌은 기다린다고 풀리지 않으니 거짓말이다.
    """
    return ApiError(ErrorCode.DUPLICATE_CATEGORY, _DUPLICATE, status_code=409)


def _free_name_slot(
    session: Session, rows: list[Category], user: User, key: str, *, keep_id: uuid.UUID
) -> None:
    """지운 행이 붙들고 있는 이름 자리를 비운다.

    유니크 인덱스에 `deleted_at` 이 없어서, 지운 행이 그 이름을 계속 잡고 있다.
    만들기는 그 행을 되살려 비켜 가지만 이름 바꾸기는 그럴 수 없다. 바꿀 행이 이미 살아 있어서다.
    그대로 두면 화면 어디에도 없는 이름 때문에 "이미 있어요" 가 나가고, 몇 번을 다시 눌러도
    풀리지 않는다.

    지운 행을 아주 지우지는 않는다. 거래가 그 행을 가리키고 있어 하드 삭제하면
    과거 기록이 분류를 잃는다. 이름만 아무도 못 쓰는 값으로 옮긴다.
    """
    for row in rows:
        if row.deleted_at is None or row.user_id != user.id or row.id == keep_id:
            continue
        if _key(row.name) == key:
            row.name = f"~{row.id.hex}"
            # 먼저 자리를 비우고 나서 새 이름을 붙인다. 한 번에 커밋하면 UPDATE 순서를
            # ORM 이 정하는데, 새 이름이 먼저 나가면 아직 안 비운 자리와 부딪힌다.
            session.flush()


# ── 쓰기 ────────────────────────────────────────────────


def create_category(session: Session, user: User, data: CategoryCreate) -> Category:
    """내 지출 분류를 하나 만든다. 지웠던 같은 이름이 있으면 그 행을 되살린다.

    되살리는 이유가 둘이다. 지운 행이 (user_id, name) 자리를 계속 잡고 있어 새로 넣으면
    터진다. 그리고 같은 id 가 돌아와야 그 분류로 적어 둔 과거 거래가 이름을 되찾는다.
    예산이 tombstone 을 되살리는 것과 같은 방식이다(ADR-0008).
    """
    name = _fold(data.name)
    key = _key(name)
    rows = _comparable(session, user)
    _reject_duplicate(rows, key)

    revived = next(
        (
            r
            for r in rows
            if r.deleted_at is not None and r.user_id == user.id and _key(r.name) == key
        ),
        None,
    )
    if revived is not None:
        revived.name = name
        revived.kind = CategoryKind.EXPENSE
        revived.icon_key = data.icon_key
        revived.sort_order = USER_CATEGORY_SORT_ORDER
        revived.deleted_at = None
        session.commit()
        session.refresh(revived)
        return revived

    row = Category(
        user_id=user.id,
        name=name,
        kind=CategoryKind.EXPENSE,
        icon_key=data.icon_key,
        sort_order=USER_CATEGORY_SORT_ORDER,
    )
    session.add(row)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise _duplicate_error() from None
    session.refresh(row)
    return row


def update_category(
    session: Session, user: User, category_id: uuid.UUID, data: CategoryUpdate
) -> Category:
    """보낸 필드만 바꾼다. 이름을 바꿀 때도 만들 때와 같은 겹침 판정을 지난다."""
    row = require_own(session, user, category_id, on_default="기본 카테고리는 고칠 수 없어요.")
    # null 은 안 보낸 것으로 본다. 이름과 아이콘은 비워 둘 수 있는 값이 아니다.
    payload = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}

    if "name" in payload:
        name = _fold(payload["name"])
        key = _key(name)
        rows = _comparable(session, user)
        _reject_duplicate(rows, key, skip_id=row.id)
        _free_name_slot(session, rows, user, key, keep_id=row.id)
        row.name = name
    if "icon_key" in payload:
        row.icon_key = payload["icon_key"]

    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise _duplicate_error() from None
    session.refresh(row)
    return row


def _live_category_budgets(session: Session, category_id: uuid.UUID) -> list[CategoryBudget]:
    """그 분류에 걸린 살아 있는 한도. 내 분류에는 내 예산만 붙는다."""
    return list(
        session.scalars(
            select(CategoryBudget).where(
                CategoryBudget.category_id == category_id,
                CategoryBudget.deleted_at.is_(None),
            )
        )
    )


def _live_rules(session: Session, user: User, category_id: uuid.UUID) -> list[MerchantRule]:
    return list(
        session.scalars(
            select(MerchantRule).where(
                MerchantRule.user_id == user.id,
                MerchantRule.category_id == category_id,
                MerchantRule.deleted_at.is_(None),
            )
        )
    )


def delete_category(session: Session, user: User, category_id: uuid.UUID) -> None:
    """분류와 거기 걸린 한도·기억한 규칙을 한 번에 지운다. 과거 거래는 그대로 둔다.

    거래의 분류까지 지우면 이미 본 지난달 리포트가 나중에 달라진다. 기억한 규칙은 반대다.
    남겨 두면 다음 캡처 분석이 죽은 분류를 후보에 붙이고, 저장이 묶음째 거절된다.
    이미 지운 것을 또 지우면 아무 일도 하지 않는다.
    """
    row = _my_row(session, user, category_id, on_default="기본 카테고리는 지울 수 없어요.")
    if row.deleted_at is not None:
        return

    now = datetime.now(UTC)
    row.deleted_at = now
    for limit in _live_category_budgets(session, row.id):
        limit.deleted_at = now
    for rule in _live_rules(session, user, row.id):
        rule.deleted_at = now
    session.commit()
