"""공유 가계부의 값 목록과 규칙 상수.

가계부 종류·돈 나누기·멤버 역할의 값은 여기 하나에만 적는다. 모델·스키마가 이 enum 을
그대로 써야 openapi.json 에 값 목록이 실려 프론트 타입이 문자열로 뭉개지지 않는다.
종류마다 처음 심는 분류도 여기가 정본이다.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from types import MappingProxyType
from typing import Final

__all__ = [
    "BOOK_CATEGORY_SEEDS",
    "BOOK_NAME_MAX",
    "DEFAULT_BOOK_NAMES",
    "DEFAULT_SETTLE_RULES",
    "ENTRY_MEMO_MAX",
    "ENTRY_TITLE_MAX",
    "FALLBACK_CATEGORY",
    "INVITE_CODE_BYTES",
    "INVITE_CODE_PATTERN",
    "INVITE_DAYS",
    "MAX_BOOKS_PER_USER",
    "MAX_ENTRIES_PER_DAY",
    "MAX_MEMBERS",
    "MEMBER_NAME_MAX",
    "RESTORE_DAYS",
    "SHARE_PERCENT_STEP",
    "TRIP_PERIOD",
    "BookCategorySeed",
    "BookEntryKind",
    "BookKind",
    "BookRole",
    "SettleRule",
    "category_seeds",
    "invite_max_joins",
]


class BookKind(StrEnum):
    """누구와 같이 쓰나. 기본 이름, 돈 나누기 기본값, 처음 심는 분류가 여기서 갈린다."""

    COUPLE = "couple"
    FAMILY = "family"
    TRIP = "trip"
    ROOM = "room"


class SettleRule(StrEnum):
    """회비를 내는 방식. 값은 처음 만든 그대로 두고 화면 이름만 바꿨다(ADR-0050).

    none 은 「각자 입금」 이다. 정한 비율대로 먼저 넣고 같이 쓰니 정산이 없다.
    even 은 「나중에 정산」 이다. 각자 내고 기간이 끝나면 비율(없으면 인원수)대로 나눈다.
    값을 바꾸면 이미 깔린 옛 화면이 보내는 값이 422 가 된다.
    """

    EVEN = "even"
    NONE = "none"


class BookEntryKind(StrEnum):
    """공유 기록의 종류. 입금은 회비를 넣은 것이라 쓴 돈 합계, 정산, 리포트 어디에도 안 든다."""

    EXPENSE = "expense"
    DEPOSIT = "deposit"


class BookRole(StrEnum):
    """가계부마다 관리자는 한 명이다. 이름 바꾸기, 완료하기, 지우기, 내보내기는 관리자만 한다."""

    OWNER = "owner"
    MEMBER = "member"


# 한 가계부에 같이 있을 수 있는 사람 수.
MAX_MEMBERS: Final = 10
# 한 사람이 지금 멤버로 같이 쓰는 가계부 수. 만들기와 들어오기를 끝없이 되풀이하지 못하게.
MAX_BOOKS_PER_USER: Final = 20
# 한 가계부에 24시간 동안 적을 수 있는 기록 수(입금, 옮겨 온 것, 가져오기 포함).
MAX_ENTRIES_PER_DAY: Final = 500
# 초대 링크가 사는 날.
INVITE_DAYS: Final = 7
# token_urlsafe(9) 는 12글자다. 추측하기 어렵고 링크에 넣기 짧다.
INVITE_CODE_BYTES: Final = 9
INVITE_CODE_PATTERN: Final = r"^[A-Za-z0-9_-]{12}$"
# 지운 가계부를 되살릴 수 있는 날.
RESTORE_DAYS: Final = 30
# 여행 가계부 정산은 달로 끊지 않고 전체를 한 번에 본다.
TRIP_PERIOD: Final = "all"
# 회비 비율은 이 단위로만 정한다. 화면 게이지가 10% 씩 움직인다.
SHARE_PERCENT_STEP: Final = 10

BOOK_NAME_MAX: Final = 20
MEMBER_NAME_MAX: Final = 10
ENTRY_TITLE_MAX: Final = 120
ENTRY_MEMO_MAX: Final = 200

# 옮기기에서 같은 이름의 분류가 없을 때 쓰는 자리. 모든 종류가 이 이름을 갖고 있다.
FALLBACK_CATEGORY: Final = "기타"

# 만들기 화면이 이름 칸에 미리 채워 두는 이름. 프론트 bookText.ts 의 DEFAULT_NAME 과 같은 값이다.
# 연인이라고 같은 집에 사는 것은 아니라서 「우리 집」 같은 말을 쓰지 않는다.
DEFAULT_BOOK_NAMES: Final = MappingProxyType(
    {
        BookKind.COUPLE: "둘이 쓰는 돈",
        BookKind.FAMILY: "가족 생활비",
        BookKind.TRIP: "여행 경비",
        BookKind.ROOM: "공동 생활비",
    }
)

# 만들기 화면에서 미리 골라 두는 돈 나누기.
DEFAULT_SETTLE_RULES: Final = MappingProxyType(
    {
        BookKind.COUPLE: SettleRule.EVEN,
        BookKind.FAMILY: SettleRule.NONE,
        BookKind.TRIP: SettleRule.EVEN,
        BookKind.ROOM: SettleRule.EVEN,
    }
)


@dataclass(frozen=True, slots=True)
class BookCategorySeed:
    name: str
    icon_key: str
    sort_order: int


def _seeds(*pairs: tuple[str, str]) -> tuple[BookCategorySeed, ...]:
    """적은 순서가 곧 화면 순서다."""
    return tuple(
        BookCategorySeed(name, icon_key, (index + 1) * 10)
        for index, (name, icon_key) in enumerate(pairs)
    )


# icon_key 는 frontend/public/icons/sm/<icon_key>.png 파일 이름이다.
BOOK_CATEGORY_SEEDS: Final = MappingProxyType(
    {
        BookKind.COUPLE: _seeds(
            ("장보기", "34_shopping_cart"),
            ("외식·배달", "76_burger"),
            ("주거비", "12_house"),
            ("공과금", "64_utility_bill"),
            ("생활", "18_cleaning_tools"),
            ("데이트", "07_heart"),
            ("여가·취미", "35_paint_palette"),
            ("경조사", "31_gift"),
            (FALLBACK_CATEGORY, "26_sparkles"),
        ),
        BookKind.FAMILY: _seeds(
            ("장보기", "34_shopping_cart"),
            ("외식·배달", "76_burger"),
            ("공과금", "64_utility_bill"),
            ("생활", "18_cleaning_tools"),
            ("의료", "74_medicine"),
            ("교육", "56_graduation_cap"),
            ("경조사", "31_gift"),
            ("여가·취미", "35_paint_palette"),
            (FALLBACK_CATEGORY, "26_sparkles"),
        ),
        BookKind.TRIP: _seeds(
            ("숙소", "12_house"),
            ("교통", "33_train"),
            ("식비", "09_rice_bowl"),
            ("카페", "06_coffee"),
            ("놀거리", "36_game_controller"),
            ("기념품", "31_gift"),
            ("장보기", "34_shopping_cart"),
            (FALLBACK_CATEGORY, "26_sparkles"),
        ),
        BookKind.ROOM: _seeds(
            ("월세", "52_key"),
            ("공과금", "64_utility_bill"),
            ("인터넷", "20_computer"),
            ("생필품", "18_cleaning_tools"),
            ("장보기", "34_shopping_cart"),
            ("외식·배달", "76_burger"),
            (FALLBACK_CATEGORY, "26_sparkles"),
        ),
    }
)


def category_seeds(kind: BookKind) -> tuple[BookCategorySeed, ...]:
    return BOOK_CATEGORY_SEEDS[kind]


def invite_max_joins(kind: BookKind) -> int | None:
    """연인·부부 초대는 한 사람이 들어오면 닫는다. 나머지는 인원 상한만 본다."""
    return 1 if kind is BookKind.COUPLE else None
