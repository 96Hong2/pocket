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

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.errors import ApiError, ErrorCode
from app.domain.categories import CategoryColor, user_sort_order
from app.models import Category, CategoryBudget, MerchantRule, Transaction, User
from app.modules.categories.schemas import CategoryCreate, CategoryUpdate
from app.modules.settings import service as settings_service

__all__ = [
    "category_overrides",
    "create_category",
    "delete_category",
    "effective_color",
    "effective_icon",
    "effective_name",
    "list_categories",
    "quick_hidden_ids",
    "quick_order_ids",
    "renamed_ids_matching",
    "require_own",
    "require_owned",
    "require_seen",
    "set_quick",
    "set_quick_order",
    "update_category",
    "usage_counts",
]

_NOT_FOUND = "카테고리를 찾지 못했어요."
_DUPLICATE = "같은 이름의 카테고리가 이미 있어요."


def list_categories(session: Session, user: User) -> list[Category]:
    """기본 카테고리와 내 카테고리를 함께 준다. 남의 것은 보이지 않는다.

    사용자가 순서를 정해 뒀으면 그 순서가 앞이고, 정하지 않은 것은 뒤에 서버 순서대로 붙는다.
    화면이 앞자리 열한 개만 칩으로 세우므로 이 순서가 곧 "무엇이 먼저 보이나" 다.
    """
    stmt = (
        select(Category)
        .where(
            Category.deleted_at.is_(None),
            # NULL 은 IN 으로 못 잡는다. 기본 카테고리(user_id NULL)를 놓치지 않게 따로 쓴다.
            or_(Category.user_id == user.id, Category.user_id.is_(None)),
        )
        .order_by(Category.sort_order, Category.name)
    )
    return apply_order(list(session.scalars(stmt)), quick_order_ids(session, user))


def apply_order(rows: list[Category], order: list[str]) -> list[Category]:
    """정해 둔 순서를 앞에 세운다. 목록에 없는 것은 받은 순서 그대로 뒤에 붙는다.

    지운 분류의 id 가 순서 목록에 남아 있어도 여기서 그냥 안 걸린다.
    """
    if not order:
        return rows
    rank = {value: index for index, value in enumerate(order)}
    # 목록에 없는 것은 뒤로. 같은 칸이면 들어온 순서를 지킨다(sorted 가 안정 정렬이다).
    return sorted(rows, key=lambda row: rank.get(str(row.id), len(rank)))


def usage_counts(session: Session, user: User) -> dict[str, int]:
    """분류마다 그 분류로 적어 둔 기록이 몇 건인가.

    화면이 「자주 쓴 순서로」를 누를 때 쓰는 값이다. 순서를 서버가 정하지 않는 이유는
    쓸 때마다 칩이 자리를 옮기면 손이 기억한 자리가 무너지기 때문이다.
    옮길지 말지는 사용자가 누를 때 정한다.
    """
    stmt = (
        select(Transaction.category_id, func.count())
        .where(
            Transaction.user_id == user.id,
            Transaction.deleted_at.is_(None),
            Transaction.category_id.is_not(None),
        )
        .group_by(Transaction.category_id)
    )
    return {str(category_id): count for category_id, count in session.execute(stmt)}


# ── 기록 화면에 먼저 보일 분류 ──────────────────────────
#
# 사람마다 다른 값이라 카테고리 행에 못 둔다. 기본 분류는 모두가 같은 행을 보기 때문이다.
# 사용자 설정에 **숨긴 것**의 id 를 적는다. 비어 있는 것이 곧 「전부 보인다」 라서
# 새로 만든 분류도 저절로 보인다.


def quick_hidden_ids(session: Session, user: User) -> set[str]:
    row = settings_service.get_preferences(session, user)
    return {str(item) for item in row.quick_hidden_category_ids}


def set_quick(session: Session, user: User, category_id: uuid.UUID, quick: bool) -> None:
    """기록 화면에 보일지 끌지. 기본 분류에도 걸린다(내 설정에만 남는다)."""
    row = settings_service.get_preferences(session, user)
    hidden = [str(item) for item in row.quick_hidden_category_ids]
    key = str(category_id)
    if quick:
        if key not in hidden:
            return
        hidden = [item for item in hidden if item != key]
    else:
        if key in hidden:
            return
        hidden = [*hidden, key]
    # JSON 컬럼은 같은 리스트를 고쳐도 더러워졌다고 보지 않는다. 새 리스트를 넣는다.
    row.quick_hidden_category_ids = hidden
    session.commit()


def quick_order_ids(session: Session, user: User) -> list[str]:
    row = settings_service.get_preferences(session, user)
    return [str(item) for item in row.quick_category_order]


def set_quick_order(session: Session, user: User, ids: list[uuid.UUID]) -> None:
    """칩이 설 순서. 화면이 보고 있는 목록 전체를 그대로 보낸다.

    내가 볼 수 없는 분류가 섞여 오면 통째로 막는다. 조용히 걸러 내면 화면이 보낸 순서와
    저장된 순서가 달라지고, 다음에 열었을 때 방금 옮긴 것이 제자리로 돌아가 있다.
    """
    seen: set[str] = set()
    keys: list[str] = []
    for category_id in ids:
        require_owned(session, user, category_id)
        key = str(category_id)
        if key in seen:
            raise ApiError(ErrorCode.INVALID_REQUEST, "같은 분류가 두 번 왔어요.", status_code=422)
        seen.add(key)
        keys.append(key)

    row = settings_service.get_preferences(session, user)
    # JSON 컬럼은 같은 리스트를 고쳐도 더러워졌다고 보지 않는다. 새 리스트를 넣는다.
    row.quick_category_order = keys
    session.commit()


# ── 기본 분류를 내 화면에서만 다르게 부르기 ────────────
#
# 기본 분류는 **모두가 같은 한 행**을 본다. 이름·아이콘·색을 그 행에 적으면 한 사람이
# 고친 것이 전부에게 번진다. 그렇다고 못 고치게 막으면 「식비」 를 「밥값」 이라 부르는
# 사람은 기본 분류를 통째로 버리고 같은 것을 손으로 다시 만들어야 한다.
# `quick_hidden_category_ids` 와 같은 이유로 내 설정에 둔다.

#: 덮어쓸 수 있는 칸. 종류·순서는 없다. 종류를 바꾸면 그 분류로 적어 둔 지난 기록이
#: 종류와 어긋나고, 순서는 이미 `quick_category_order` 가 따로 갖고 있다.
OVERRIDE_KEYS = ("name", "icon_key", "icon_custom", "color")


def category_overrides(session: Session, user: User) -> dict[str, dict[str, str | None]]:
    """기본 분류에 내가 걸어 둔 값. 아무것도 안 고쳤으면 빈 dict 다."""
    row = settings_service.get_preferences(session, user)
    return {str(k): dict(v) for k, v in row.category_overrides.items()}


def renamed_ids_matching(
    overrides: dict[str, dict[str, str | None]], keyword: str
) -> list[uuid.UUID]:
    """그 사람이 **다르게 부르기로 한 이름**이 검색어에 걸리는 기본 분류의 id.

    검색은 `categories.name` 을 보는데, 그 칸에는 공용 이름이 들어 있다. 「식비」 를
    「밥값」 이라 부르기로 한 사람에게는 화면 어디에도 「식비」 가 없으므로, 그 말로는
    못 찾고 안 쓰는 말로만 찾히게 된다. 찾는 쪽이 부르는 이름으로 찾아야 한다.

    설정이 JSON 이라 SQL 로 join 할 수 없다. 걸리는 id 를 미리 뽑아 `IN` 조건으로 얹는다.
    덮어쓴 분류만 훑으므로 대개 빈 목록이고, 많아야 기본 분류 수(열여섯)다.

    **바꾼 이름에 안 걸리면 안 돌려준다.** 공용 이름으로 찾는 길은 SQL 쪽에 그대로 있다.
    그쪽까지 막으면 이름을 바꾸기 전에 적어 둔 기억으로 찾는 사람이 못 찾는다.
    """
    needle = " ".join(keyword.split()).casefold()
    if needle == "":
        return []
    found: list[uuid.UUID] = []
    for key, patch in overrides.items():
        name = patch.get("name")
        if not isinstance(name, str) or needle not in name.casefold():
            continue
        try:
            found.append(uuid.UUID(key))
        except ValueError:
            # 설정에 남은 옛 값. 있는 것만 골라 쓴다.
            continue
    return found


def _patch_of(row: Category, overrides: dict[str, dict[str, str | None]]) -> dict[str, str | None]:
    """그 행에 걸린 덮어쓰기. 내가 만든 분류에는 걸리지 않는다."""
    if row.user_id is not None:
        return {}
    return overrides.get(str(row.id)) or {}


def effective_name(row: Category, overrides: dict[str, dict[str, str | None]]) -> str:
    """화면에 실제로 보이는 이름. 안 고쳤으면 행에 적힌 이름 그대로다."""
    value = _patch_of(row, overrides).get("name")
    return value if isinstance(value, str) and value != "" else row.name


def effective_icon(
    row: Category, overrides: dict[str, dict[str, str | None]]
) -> tuple[str, str | None]:
    """화면에 실제로 그려지는 (icon_key, icon_custom).

    아이콘은 둘 중 하나만 걸린다. 덮어쓰기에 한 짝이라도 있으면 그 짝을 통째로 쓴다.
    `icon_key` 만 남기고 `icon_custom` 은 원래 행 것을 쓰면, 기본 사진을 떼려고 아이콘을
    고른 사람에게 사진이 그대로 남는다.
    """
    patch = _patch_of(row, overrides)
    if "icon_key" not in patch and "icon_custom" not in patch:
        return row.icon_key, row.icon_custom
    key = patch.get("icon_key")
    custom = patch.get("icon_custom")
    return (key if isinstance(key, str) and key != "" else row.icon_key), custom


def effective_color(
    row: Category, overrides: dict[str, dict[str, str | None]]
) -> CategoryColor | None:
    """화면에 깔리는 바탕색. 안 고른 분류는 None 이고 화면이 무채색 바탕을 쓴다.

    **모르는 값은 색이 없는 것으로 본다.** 색 이름은 빼지 않기로 했지만(domain/tags.py),
    설정 JSON 에는 옛 판이 적어 둔 값이 남을 수 있다. 그 하나 때문에 목록 전체가
    500 으로 막히면 카테고리를 고칠 길이 아예 사라진다.
    """
    patch = _patch_of(row, overrides)
    value = patch.get("color") if "color" in patch else row.color
    try:
        return CategoryColor(value) if value is not None else None
    except ValueError:
        return None


def _write_override(
    session: Session, user: User, category_id: uuid.UUID, patch: dict[str, str | None]
) -> None:
    """그 분류의 덮어쓰기를 **통째로 갈아 끼운다.** 빈 덮어쓰기는 칸째 지운다.

    칸별로 합치지 않는 이유는 「원래대로 되돌리기」 때문이다. 합치는 방식이면 되돌리는
    것을 「안 보냈다」 와 구별할 수 없어, 한 번 고친 이름을 영영 못 되돌린다.
    부르는 쪽이 바뀐 뒤의 전체 상태를 만들어 온다.

    덮어쓰기가 비면 그 사람은 다시 기본값을 따라간다. 나중에 기본 이름이 바뀌면
    그 사람 화면도 같이 바뀐다.
    """
    row = settings_service.get_preferences(session, user)
    current = {str(k): dict(v) for k, v in row.category_overrides.items()}
    key = str(category_id)
    kept = {k: v for k, v in patch.items() if k in OVERRIDE_KEYS}
    if kept:
        current[key] = kept
    else:
        current.pop(key, None)
    # JSON 컬럼은 같은 dict 를 고쳐도 더러워졌다고 보지 않는다. 새 dict 를 넣는다.
    row.category_overrides = current
    session.commit()


def promote_new(session: Session, user: User, category_id: uuid.UUID) -> None:
    """방금 만든 분류를 순서의 맨 앞에 끼운다.

    순서를 한 번이라도 정한 사람에게는 목록에 없는 분류가 전부 뒤로 밀린다. 그대로 두면
    방금 만든 분류가 「더 보기」 뒤에서 시작해, 만들자마자 찾지 못한다.
    아직 순서를 정한 적이 없으면 아무것도 하지 않는다. 서버 순서가 이미 제자리를 준다.
    """
    row = settings_service.get_preferences(session, user)
    current = [str(item) for item in row.quick_category_order]
    if not current:
        return
    key = str(category_id)
    row.quick_category_order = [key, *(item for item in current if item != key)]
    session.commit()


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


def require_seen(session: Session, user: User, category_id: uuid.UUID) -> Category:
    """내가 볼 수 있는 카테고리 행. 기본 분류도 통과한다. 고치지 않고 돌려줄 때만 쓴다."""
    require_owned(session, user, category_id)
    row = session.get(Category, category_id)
    if row is None:
        raise ApiError(ErrorCode.NOT_FOUND, _NOT_FOUND, status_code=404)
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


def _reject_duplicate(
    rows: list[Category],
    key: str,
    overrides: dict[str, dict[str, str | None]],
    *,
    skip_id: uuid.UUID | None = None,
) -> None:
    """**행에 적힌 이름이 아니라 그 사람 화면에 보이는 이름으로 견준다.**

    기본 「식비」 를 「밥값」 이라 부르기로 한 사람에게는 행 이름이 무엇이든 목록에
    「밥값」 이 서 있다. 행 이름만 보면 그 사람이 내 분류 「밥값」 을 또 만들 수 있고,
    그러면 같은 이름 두 줄이 나란히 선다.
    """
    taken = any(
        row.deleted_at is None and row.id != skip_id and _key(effective_name(row, overrides)) == key
        for row in rows
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
    session: Session,
    rows: list[Category],
    user: User,
    key: str,
    *,
    keep_id: uuid.UUID | None = None,
) -> None:
    """지운 행이 붙들고 있는 이름 자리를 비운다.

    유니크 인덱스에 `deleted_at` 이 없어서, 지운 행이 그 이름을 계속 잡고 있다.
    이름 바꾸기는 그 행을 되살려 비켜 갈 수 없다. 바꿀 행이 이미 살아 있어서다.
    만들기도 종류가 다르면 되살릴 수 없어 이리로 온다.
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
    """내 분류를 하나 만든다. 지웠던 같은 이름이 있으면 그 행을 되살린다.

    되살리는 이유가 둘이다. 지운 행이 (user_id, name) 자리를 계속 잡고 있어 새로 넣으면
    터진다. 그리고 같은 id 가 돌아와야 그 분류로 적어 둔 과거 거래가 이름을 되찾는다.
    예산이 tombstone 을 되살리는 것과 같은 방식이다(ADR-0008).

    되살리는 것은 종류가 같을 때뿐이다. 지웠던 지출 '보너스' 를 수입 '보너스' 로 되살리면
    그 분류로 적어 둔 지난 지출이 수입 분류를 달게 되고, 이미 본 리포트가 나중에 달라진다.
    종류가 다르면 이름 자리만 비우고 새 행을 만든다.
    """
    name = _fold(data.name)
    key = _key(name)
    rows = _comparable(session, user)
    overrides = category_overrides(session, user)
    _reject_duplicate(rows, key, overrides)

    revived = next(
        (
            r
            for r in rows
            if r.deleted_at is not None and r.user_id == user.id and _key(r.name) == key
        ),
        None,
    )
    if revived is not None and revived.kind is data.kind:
        revived.name = name
        revived.icon_key = data.icon_key
        revived.icon_custom = data.icon_custom
        # 되살릴 때도 보낸 색을 건다. 안 걸면 지우기 전의 옛 색이 따라와서,
        # 다른 색을 골라 다시 만든 사람이 저장하자마자 옛 색을 본다.
        revived.color = data.color
        revived.sort_order = user_sort_order(data.kind)
        revived.deleted_at = None
        session.commit()
        session.refresh(revived)
        promote_new(session, user, revived.id)
        return revived
    if revived is not None:
        _free_name_slot(session, rows, user, key)

    row = Category(
        user_id=user.id,
        name=name,
        kind=data.kind,
        icon_key=data.icon_key,
        icon_custom=data.icon_custom,
        color=data.color,
        sort_order=user_sort_order(data.kind),
    )
    session.add(row)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise _duplicate_error() from None
    session.refresh(row)
    promote_new(session, user, row.id)
    return row


def _payload_of(data: CategoryUpdate) -> dict[str, str | None]:
    """보낸 칸만 남긴다.

    `color` 만 `None` 을 살려 둔다. 색은 **안 고를 수 있는 값**이라 되돌릴 길이 있어야
    하는데, 이름·아이콘처럼 null 을 「그대로 둔다」 로 읽으면 한 번 고른 색을 영영 못 뗀다.
    이름과 아이콘은 비워 둘 수 있는 값이 아니라 지금까지처럼 null 을 걸러 낸다.
    """
    sent = data.model_dump(exclude_unset=True)
    return {k: v for k, v in sent.items() if v is not None or k == "color"}


def update_category(
    session: Session, user: User, category_id: uuid.UUID, data: CategoryUpdate
) -> Category:
    """보낸 필드만 바꾼다. 이름을 바꿀 때도 만들 때와 같은 겹침 판정을 지난다.

    **기본 분류는 행을 안 고치고 내 설정에 덮어쓰기를 남긴다.** 그 한 행을 모두가 같이
    보기 때문이다. 어느 쪽이든 돌려주는 것은 행이고, 화면에 실제로 보일 값은 부르는 쪽이
    `effective_*` 로 합쳐 읽는다.
    """
    payload = _payload_of(data)
    # 소유 판정을 먼저 한다. 남의 분류는 지금까지처럼 404 다. 기본 분류인지 아닌지는
    # 그다음 문제라, 여기서 순서를 뒤집으면 남의 분류에 422 가 나간다.
    found = session.get(Category, category_id)
    if found is None or (found.user_id is not None and found.user_id != user.id):
        raise ApiError(ErrorCode.NOT_FOUND, _NOT_FOUND, status_code=404)
    if found.user_id is None:
        _override_default(session, user, found, payload)
        return found

    row = require_own(session, user, category_id, on_default="기본 카테고리는 고칠 수 없어요.")
    overrides = category_overrides(session, user)

    if "name" in payload:
        name = _fold(str(payload["name"]))
        key = _key(name)
        rows = _comparable(session, user)
        _reject_duplicate(rows, key, overrides, skip_id=row.id)
        _free_name_slot(session, rows, user, key, keep_id=row.id)
        row.name = name
    # 걸리는 아이콘은 하나다. 한쪽을 보내면 다른 쪽은 지운다.
    # 기본 아이콘으로 되돌리는 길이 이것뿐이다.
    if "icon_key" in payload:
        row.icon_key = str(payload["icon_key"])
        row.icon_custom = None
    if "icon_custom" in payload:
        row.icon_custom = payload["icon_custom"]
    if "color" in payload:
        row.color = payload["color"]

    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise _duplicate_error() from None
    session.refresh(row)
    return row


def _override_default(
    session: Session, user: User, row: Category, payload: dict[str, str | None]
) -> None:
    """기본 분류를 내 화면에서만 다르게 만든다. 공용 행에는 손대지 않는다.

    **지금 내 화면에 보이는 값에서 출발해 보낸 칸만 바꾼다.** 그리고 기본값과 같아진
    칸은 덮어쓰기에서 뺀다. 「밥값」 으로 고쳤다가 「식비」 로 되돌린 사람에게 빈 껍데기가
    남지 않는다.
    """
    overrides = category_overrides(session, user)
    name = effective_name(row, overrides)
    icon_key, icon_custom = effective_icon(row, overrides)
    color = effective_color(row, overrides)

    if "name" in payload:
        name = _fold(str(payload["name"]))
        _reject_duplicate(_comparable(session, user), _key(name), overrides, skip_id=row.id)
    # 아이콘은 한 짝으로 움직인다. 한쪽을 보내면 다른 쪽을 비워, 사진을 떼려고 아이콘을
    # 고른 사람에게 사진이 남지 않는다.
    if "icon_key" in payload:
        icon_key, icon_custom = str(payload["icon_key"]), None
    if "icon_custom" in payload:
        icon_custom = payload["icon_custom"]
    if "color" in payload:
        # 스키마가 이미 값을 검사했다. 여기서 모르는 색이 들어올 길은 없다.
        sent = payload["color"]
        color = CategoryColor(sent) if sent is not None else None

    patch: dict[str, str | None] = {}
    if name != row.name:
        patch["name"] = name
    if icon_key != row.icon_key or icon_custom != row.icon_custom:
        patch["icon_key"] = icon_key
        patch["icon_custom"] = icon_custom
    if color != row.color:
        patch["color"] = color

    _write_override(session, user, row.id, patch)


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
