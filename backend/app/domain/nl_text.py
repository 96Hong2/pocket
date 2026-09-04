"""줄글에서 날짜와 금액을 읽는 규칙.

`점심 12000 스벅 4500 어제 택시 9000` 한 줄에 거래가 여럿 들어온다.
어디서 끊고 '어제'가 며칠인지는 결정적으로 정해져야 한다. 그래서 여기에 둔다.

모델에게 맡기지 않는 이유는 두 가지다. 날짜 환산은 오늘이 며칠인지에 달린 계산이고,
같은 문장이 매번 같은 결과여야 사용자가 고친 것이 다음번에도 그대로 먹는다.

이 모듈은 무엇이 식비인지 모른다. 그 판단은 분류의 몫이다.
여기서 하는 것은 '몇 조각인가 · 언제인가 · 얼마인가' 셋뿐이다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, timedelta

__all__ = [
    "Amount",
    "find_amounts",
    "read_date",
    "split_entries",
]

# 단위 없이 적은 숫자는 이 값 이상일 때만 금액으로 본다.
# 그러지 않으면 "커피 2잔 4500" 의 2 가 금액이 된다.
MIN_BARE_AMOUNT = 100

# 만 단위는 정규식이 따로 잡는다. 여기 남는 것은 천·원과 단위 없는 숫자다.
_UNIT_MULTIPLIER: dict[str | None, int] = {
    "천원": 1_000,
    "천": 1_000,
    "원": 1,
    None: 1,
}

# 만·천을 이어 쓴 표기를 한 덩어리로 잡는다. 앞 대안이 먼저 걸려야 "3만5천원" 이 갈리지 않는다.
# 단위가 없으면 뒤의 공백까지 먹지 않게 한다. 먹으면 조각을 끊는 자리가 뒤로 밀린다.
_AMOUNT = re.compile(
    r"(?P<man>\d[\d,]*)\s*만(?:\s*(?P<cheon>\d[\d,]*)\s*천)?(?:\s*(?P<sub>\d[\d,]*)\s*(?=원))?\s*원?"
    r"|(?P<num>\d[\d,]*)(?:\s*(?P<unit>천원|천|원))?"
)

# 숫자 뒤에 이런 말이 붙으면 금액이 아니라 개수다.
_COUNTING_UNITS = ("잔", "개", "명", "시", "분", "번", "층", "살", "인분", "인", "박", "일차")

_RELATIVE_DAYS: tuple[tuple[str, int], ...] = (
    ("그끄저께", 3),
    ("그끄제", 3),
    ("그저께", 2),
    ("엊그제", 2),
    ("그제", 2),
    ("어제", 1),
    ("오늘", 0),
)

_ISO_DATE = re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b")
# 연도를 함께 적으면 그 연도를 쓴다. 안 먹으면 "2026" 이 남아 금액으로 읽힌다.
_KOREAN_DATE = re.compile(
    r"(?:(?P<year>\d{4})\s*년\s*)?(?P<month>\d{1,2})\s*월\s*(?P<day>\d{1,2})\s*일"
)
_SLASH_DATE = re.compile(r"(?<!\d)(\d{1,2})/(\d{1,2})(?!\d)")
_DAYS_AGO = re.compile(r"(\d{1,3})\s*일\s*전")

_DATE_PATTERNS = (_ISO_DATE, _KOREAN_DATE, _SLASH_DATE, _DAYS_AGO)

# 콤마는 자릿수 구분("12,000")일 수 있어서 숫자가 뒤따르면 나누지 않는다.
_EXPLICIT_SPLIT = re.compile(r"[\n;·]|,(?!\d)")


@dataclass(frozen=True, slots=True)
class Amount:
    value: int
    start: int
    end: int


def _digits(raw: str) -> int:
    return int(raw.replace(",", ""))


def find_amounts(text: str) -> list[Amount]:
    """금액으로 읽히는 것을 앞에서부터 모두 찾는다. 날짜는 먼저 지우고 부른다."""
    found: list[Amount] = []
    for match in _AMOUNT.finditer(text):
        unit: str | None
        if match.group("man"):
            unit = "만"
            value = _digits(match.group("man")) * 10_000
            if match.group("cheon"):
                value += _digits(match.group("cheon")) * 1_000
            if match.group("sub"):
                value += _digits(match.group("sub"))
        else:
            raw = match.group("num")
            if not raw:
                continue
            unit = match.group("unit")
            value = _digits(raw) * _UNIT_MULTIPLIER[unit]
        if value <= 0:
            continue
        if unit is None:
            if value < MIN_BARE_AMOUNT:
                continue
            if text[match.end() :].lstrip().startswith(_COUNTING_UNITS):
                continue
        found.append(Amount(value=value, start=match.start(), end=match.end()))
    return found


def read_date(text: str, *, today: date | None) -> tuple[date | None, str]:
    """날짜 말을 하나 읽고, 그 말을 뺀 나머지 글을 함께 돌려준다.

    못 읽으면 `(None, 원문)` 이다. 비어 있는 것과 오늘을 섞지 않는다.
    부르는 쪽이 '모르면 오늘' 을 정한다.

    `today` 를 모르면 '어제' 같은 상대 표현은 며칠인지 정할 수 없어 None 으로 둔다.
    그래도 그 말은 글에서 걷어낸다. 남겨 두면 "2026-01-02" 의 2026 이 금액으로 읽힌다.
    """
    span = _find_date_span(text, today=today)
    if span is None:
        return None, text
    found, start, end = span
    rest = f"{text[:start]} {text[end:]}".strip()
    return found, rest


def split_entries(text: str) -> list[str]:
    """줄글을 거래 하나씩의 조각으로 나눈다.

    줄바꿈·세미콜론·가운뎃점·콤마가 있으면 그대로 따르고, 없으면 금액을 기준으로 끊는다.
    한국어로 적는 가계부는 `점심 12000` 처럼 이름이 앞, 금액이 뒤라 금액 끝이 조각의 끝이다.
    """
    pieces = [piece.strip() for piece in _EXPLICIT_SPLIT.split(text)]
    entries: list[str] = []
    for piece in pieces:
        if piece:
            entries.extend(_split_by_amount(piece))
    return entries


def _split_by_amount(text: str) -> list[str]:
    amounts = find_amounts(_blank_dates(text))
    if len(amounts) < 2:
        return [text] if text.strip() else []
    entries: list[str] = []
    cursor = 0
    for amount in amounts:
        chunk = text[cursor : amount.end].strip()
        if chunk:
            entries.append(chunk)
        cursor = amount.end
    tail = text[cursor:].strip()
    if tail and entries:
        # 마지막 금액 뒤에 남은 말은 그 조각에 붙인다. "9000 택시" 를 버리지 않는다.
        entries[-1] = f"{entries[-1]} {tail}"
    return entries


def _blank_dates(text: str) -> str:
    """날짜 말만 같은 길이의 공백으로 바꾼다. 자리를 지켜야 원문을 잘라낼 수 있다."""
    blanked = text
    for pattern in _DATE_PATTERNS:
        blanked = pattern.sub(lambda m: " " * len(m.group(0)), blanked)
    for word, _ in _RELATIVE_DAYS:
        blanked = blanked.replace(word, " " * len(word))
    return blanked


def _find_date_span(text: str, *, today: date | None) -> tuple[date | None, int, int] | None:
    """가장 앞에 나온 날짜 말의 값과 자리. 값을 못 정해도 자리는 돌려준다."""
    candidates: list[tuple[int, date | None, int, int]] = []

    match = _ISO_DATE.search(text)
    if match is not None:
        # 연·월·일이 다 적혀 있어 오늘을 몰라도 정할 수 있다.
        found = _safe_date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        candidates.append((match.start(), found, match.start(), match.end()))

    match = _KOREAN_DATE.search(text)
    if match is not None:
        month, day = int(match.group("month")), int(match.group("day"))
        year = match.group("year")
        if year is not None:
            # 연·월·일이 다 적혀 있어 오늘을 몰라도 정할 수 있다.
            found = _safe_date(int(year), month, day)
        else:
            found = _month_day(month, day, today=today) if today is not None else None
        candidates.append((match.start(), found, match.start(), match.end()))

    match = _SLASH_DATE.search(text)
    if match is not None:
        found = (
            _month_day(int(match.group(1)), int(match.group(2)), today=today)
            if today is not None
            else None
        )
        candidates.append((match.start(), found, match.start(), match.end()))

    match = _DAYS_AGO.search(text)
    if match is not None:
        ago = today - timedelta(days=int(match.group(1))) if today is not None else None
        candidates.append((match.start(), ago, match.start(), match.end()))

    for word, days in _RELATIVE_DAYS:
        index = text.find(word)
        if index >= 0:
            relative = today - timedelta(days=days) if today is not None else None
            candidates.append((index, relative, index, index + len(word)))

    if not candidates:
        return None
    _, found, start, end = min(candidates, key=lambda item: item[0])
    return found, start, end


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _month_day(month: int, day: int, *, today: date) -> date | None:
    found = _safe_date(today.year, month, day)
    if found is None:
        return None
    if found > today:
        # 가계부는 지난 일을 적는다. 오늘보다 뒤면 지난해로 본다.
        return _safe_date(today.year - 1, month, day)
    return found
