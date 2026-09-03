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
    "CategoryKind",
    "DefaultCategory",
    "default_category_icons",
    "expense_category_names",
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


# 순서가 곧 화면에 보이는 순서다. 자주 쓰는 것을 앞에 둔다.
DEFAULT_CATEGORIES: tuple[DefaultCategory, ...] = (
    DefaultCategory("식비", CategoryKind.EXPENSE, "09_rice_bowl", 10),
    DefaultCategory("카페·간식", CategoryKind.EXPENSE, "06_coffee", 20),
    DefaultCategory("교통", CategoryKind.EXPENSE, "33_train", 30),
    DefaultCategory("쇼핑", CategoryKind.EXPENSE, "34_shopping_cart", 40),
    DefaultCategory("생활", CategoryKind.EXPENSE, "18_cleaning_tools", 50),
    DefaultCategory("주거·고정비", CategoryKind.EXPENSE, "12_house", 60),
    DefaultCategory("여가·취미", CategoryKind.EXPENSE, "35_paint_palette", 70),
    DefaultCategory("건강·미용", CategoryKind.EXPENSE, "44_dumbbell", 80),
    DefaultCategory("기타", CategoryKind.EXPENSE, "26_sparkles", 90),
    DefaultCategory("수입", CategoryKind.INCOME, "28_cash", 100),
    # 이체는 화살표다. 집계에서 빠지는 대신 목록에는 라벨과 함께 남는다.
    DefaultCategory("이체", CategoryKind.TRANSFER, "05_choice_arrows", 110),
)


def expense_category_names() -> tuple[str, ...]:
    """LLM 분류 후보로 넘기는 지출 카테고리 이름."""
    return tuple(c.name for c in DEFAULT_CATEGORIES if c.kind is CategoryKind.EXPENSE)


def default_category_icons() -> dict[str, str]:
    """카테고리 이름 → 아이콘 키. 프론트 매핑과 대조하는 데 쓴다."""
    return {c.name: c.icon_key for c in DEFAULT_CATEGORIES}
