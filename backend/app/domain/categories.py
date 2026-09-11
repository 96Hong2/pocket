"""기본 카테고리 정본.

이 목록이 유일한 출처다. 마이그레이션 시드, LLM 분류 힌트, 프론트 아이콘 매핑이
전부 여기서 나온다. 다른 파일에 이름을 다시 적지 않는다.

`icon_key` 는 `frontend/public/icons/sm/<icon_key>.png` 와 1:1로 맞는다.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

__all__ = [
    "DEFAULT_CATEGORIES",
    "FIXED_COST_CATEGORY",
    "USER_CATEGORY_SORT_ORDER",
    "USER_INCOME_SORT_ORDER",
    "CategoryKind",
    "DefaultCategory",
    "default_category_icons",
    "expense_category_names",
    "income_category_names",
    "user_sort_order",
]


class CategoryKind(StrEnum):
    EXPENSE = "expense"
    INCOME = "income"
    TRANSFER = "transfer"


@dataclass(frozen=True, slots=True)
class DefaultCategory:
    name: str
    kind: CategoryKind
    icon_key: str
    sort_order: int


# 고정비를 추정할 때 들여다보는 기본 분류. 이름을 다른 파일에 다시 적지 않게 여기서 내보낸다.
FIXED_COST_CATEGORY = "주거·고정비"


# 순서가 곧 화면에 보이는 순서다. 자주 쓰는 것을 앞에 둔다.
DEFAULT_CATEGORIES: tuple[DefaultCategory, ...] = (
    DefaultCategory("식비", CategoryKind.EXPENSE, "09_rice_bowl", 10),
    DefaultCategory("카페·간식", CategoryKind.EXPENSE, "06_coffee", 20),
    DefaultCategory("교통", CategoryKind.EXPENSE, "33_train", 30),
    DefaultCategory("쇼핑", CategoryKind.EXPENSE, "34_shopping_cart", 40),
    DefaultCategory("생활", CategoryKind.EXPENSE, "18_cleaning_tools", 50),
    DefaultCategory(FIXED_COST_CATEGORY, CategoryKind.EXPENSE, "12_house", 60),
    DefaultCategory("여가·취미", CategoryKind.EXPENSE, "35_paint_palette", 70),
    DefaultCategory("건강·미용", CategoryKind.EXPENSE, "44_dumbbell", 80),
    DefaultCategory("기타", CategoryKind.EXPENSE, "26_sparkles", 90),
    # 수입도 어디서 온 돈인지 갈라야 리포트의 수입 쪽이 한 조각으로 뭉치지 않는다.
    # 지출만큼 잘게 나누지 않는다. '기타 수입' 은 끝자리를 지킨다.
    DefaultCategory("월급", CategoryKind.INCOME, "28_cash", 100),
    DefaultCategory("용돈", CategoryKind.INCOME, "31_gift", 101),
    DefaultCategory("부업", CategoryKind.INCOME, "20_computer", 103),
    DefaultCategory("기타 수입", CategoryKind.INCOME, "01_coins", 104),
    # 이체는 화살표다. 집계에서 빠지는 대신 목록에는 라벨과 함께 남는다.
    DefaultCategory("이체", CategoryKind.TRANSFER, "05_choice_arrows", 110),
)


# 사용자가 직접 만든 지출 분류가 앉는 자리. 기본 지출 분류(10~80) 뒤, '기타'(90) 앞이다.
# 컬럼 기본값인 0 을 그대로 쓰면 내가 만든 것이 '식비'보다 앞에 서서 목록이 뒤집힌다.
# '기타'는 지출 목록의 끝에 남겨 둔다. 마지막 자리가 흔들리면 어디까지가 지출인지 읽기 어렵다.
USER_CATEGORY_SORT_ORDER = 85

# 내가 만든 수입 분류가 앉는 자리. 기본 수입(100~102) 뒤, '이체'(110) 앞이다.
# 지출과 달리 '기타 수입' 앞에 끼우지 않는다. 그러려면 기본 수입 번호를 다시 매겨야 하고,
# 이미 저장된 행의 순서를 마이그레이션으로 옮기는 값이 이 정렬에 걸맞지 않다.
USER_INCOME_SORT_ORDER = 105


def user_sort_order(kind: CategoryKind) -> int:
    """내가 만든 분류가 그 종류의 목록에서 앉는 자리."""
    return USER_INCOME_SORT_ORDER if kind is CategoryKind.INCOME else USER_CATEGORY_SORT_ORDER


def expense_category_names() -> tuple[str, ...]:
    """LLM 분류 후보로 넘기는 지출 카테고리 이름."""
    return tuple(c.name for c in DEFAULT_CATEGORIES if c.kind is CategoryKind.EXPENSE)


def income_category_names() -> tuple[str, ...]:
    """LLM 분류 후보로 넘기는 수입 카테고리 이름."""
    return tuple(c.name for c in DEFAULT_CATEGORIES if c.kind is CategoryKind.INCOME)


def default_category_icons() -> dict[str, str]:
    """카테고리 이름 → 아이콘 키. 프론트 매핑과 대조하는 데 쓴다."""
    return {c.name: c.icon_key for c in DEFAULT_CATEGORIES}
