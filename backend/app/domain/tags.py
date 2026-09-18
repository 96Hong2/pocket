"""태그 색 정본.

**색을 자유 입력으로 받지 않는다.** 아무 hex 나 받으면 배경과 구분이 안 되는 색이
들어오고, 화면은 그 색으로 글자를 얹어야 한다. 대비를 매번 계산하느니 쓸 수 있는 색을
여기서 정해 둔다. 프론트의 칩 색도 이 키로 그린다(`frontend/src/features/tags/tagColors.ts`).

카테고리와 다른 축이다. 카테고리는 "무엇에 썼나"고 태그는 "어떤 묶음인가"다.
같은 식비라도 「출장」과 「데이트」로 갈리는 것이 태그다.
"""

from __future__ import annotations

from enum import StrEnum

__all__ = ["TAGS_PER_USER_MAX", "TAG_COLOR_VALUES", "TAG_NAME_MAX", "TagColor", "TagKind"]


class TagColor(StrEnum):
    """고를 수 있는 색. 여덟 개다.

    더 늘리지 않는다. 색이 열두 개가 넘으면 고르는 일 자체가 일이 되고, 두 색을 눈으로
    가르지 못해 태그가 섞인다.
    """

    SAGE = "sage"
    OCEAN = "ocean"
    LILAC = "lilac"
    CORAL = "coral"
    AMBER = "amber"
    MINT = "mint"
    ROSE = "rose"
    SLATE = "slate"


class TagKind(StrEnum):
    """지출 태그와 수입 태그는 서로 다른 목록이다.

    「출장」이 지출에도 수입에도 있는 사람이 있고, 그때 같은 태그로 묶으면 리포트가
    번 돈과 쓴 돈을 한 조각에 더한다. 목록부터 갈라 둔다.
    """

    EXPENSE = "expense"
    INCOME = "income"


TAG_COLOR_VALUES: tuple[str, ...] = tuple(color.value for color in TagColor)

# 칩 한 줄에 들어가는 길이. 넘치면 말줄임으로 뭉개져 무슨 태그인지 못 읽는다.
TAG_NAME_MAX = 12

# 한 사람이 만들 수 있는 태그 수(종류마다). 목록이 길어지면 고르는 데 10초를 다 쓴다.
TAGS_PER_USER_MAX = 20
