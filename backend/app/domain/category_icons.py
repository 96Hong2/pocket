"""내가 직접 올린 카테고리 아이콘의 규칙.

기본 아이콘은 `icon_key` 로 골라 앱에 들어 있는 파일을 가리킨다. 그것 말고
**휴대폰 자판의 이모지**나 **직접 찍은 사진**도 쓸 수 있어야 해서 값 하나를 더 둔다.

두 가지를 한 칸에 담는다. 아이콘은 어차피 하나만 걸리므로 칸을 둘로 나누면 둘 다 찬
행이 생기고, 그때 무엇을 그릴지 화면과 서버가 서로 다르게 답할 수 있다.

    emoji:🍔
    data:image/webp;base64,...

크기는 넉넉하게 잡되 상한은 둔다. 목록 API 가 카테고리를 한 번에 다 내려주므로,
사진 한 장이 커지면 그 화면 전체가 느려진다. 앱은 올리기 전에 정사각 256px 로 줄이고,
서버는 그보다 한참 큰 값에서만 막는다.
"""

from __future__ import annotations

import base64
import binascii
import re

__all__ = [
    "CUSTOM_ICON_MAX_LENGTH",
    "EMOJI_PREFIX",
    "NOT_EMOJI_MESSAGE",
    "InvalidCustomIcon",
    "is_emoji",
    "normalize_custom_icon",
]

EMOJI_PREFIX = "emoji:"

# 아이콘 자리에 글자가 왔을 때 하는 말. 화면도 같은 문구를 쓴다(frontend/src/shared/ui/emoji.ts).
NOT_EMOJI_MESSAGE = "이모지 형식이 아니에요. 휴대폰 자판의 이모지를 골라 주세요."

# 데이터 URI 길이 상한(문자 수). base64 는 원본의 4/3 이라 실제 그림은 약 190KB 까지다.
# 256px 정사각 webp 는 보통 10~30KB 라 열 배 넘게 여유가 있다.
CUSTOM_ICON_MAX_LENGTH = 262_144

# 그림 형식은 셋만 받는다. svg 는 그 안에 스크립트를 담을 수 있어 뺀다.
_DATA_URI = re.compile(r"^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$")

# 이모지 하나. 살색 지정과 ZWJ 로 이어 붙인 것(가족 이모지 등)이 있어 넉넉히 잡는다.
_EMOJI_MAX_LENGTH = 24

# 이모지가 사는 자리. 유니코드가 블록으로 갈라 둔 것을 그대로 옮겼다.
_EMOJI_RANGES: tuple[tuple[int, int], ...] = (
    (0x00A9, 0x00A9),  # ©
    (0x00AE, 0x00AE),  # ®
    (0x203C, 0x203C),
    (0x2049, 0x2049),
    (0x2122, 0x2122),
    (0x2139, 0x2139),
    (0x2194, 0x21AA),
    (0x231A, 0x231B),
    (0x2328, 0x2328),
    (0x23CF, 0x23CF),
    (0x23E9, 0x23FA),
    (0x24C2, 0x24C2),
    (0x25AA, 0x25AB),
    (0x25B6, 0x25B6),
    (0x25C0, 0x25C0),
    (0x25FB, 0x25FE),
    (0x2600, 0x27BF),  # 기타 기호와 딩벳
    (0x2934, 0x2935),
    (0x2B00, 0x2BFF),
    (0x3030, 0x3030),
    (0x303D, 0x303D),
    (0x3297, 0x3297),
    (0x3299, 0x3299),
    (0x1F000, 0x1F02F),
    (0x1F0A0, 0x1F0FF),
    (0x1F100, 0x1F1FF),  # 국기를 만드는 지역 표시 문자가 여기 있다
    (0x1F200, 0x1F2FF),
    (0x1F300, 0x1F5FF),
    (0x1F600, 0x1F64F),
    (0x1F650, 0x1F67F),
    (0x1F680, 0x1F6FF),
    (0x1F700, 0x1F7FF),
    (0x1F800, 0x1F8FF),
    (0x1F900, 0x1F9FF),
    (0x1FA00, 0x1FAFF),
)

# 혼자서는 이모지가 아니고 붙어서만 뜻이 있는 것들: 살색·변형 선택자·ZWJ·국기 태그.
_ATTACHMENT_RANGES: tuple[tuple[int, int], ...] = (
    (0x200D, 0x200D),
    (0xFE0E, 0xFE0F),
    (0x1F3FB, 0x1F3FF),
    (0xE0020, 0xE007F),
)

_KEYCAP_MARK = 0x20E3
_VARIATION_EMOJI = 0xFE0F
# 키캡이 될 수 있는 밑글자. 0~9 와 # 과 * 뿐이다.
_KEYCAP_BASES = {ord(ch) for ch in "0123456789#*"}


class InvalidCustomIcon(ValueError):
    """값이 이모지도 그림도 아닐 때. 문구가 그대로 사용자에게 간다."""


def normalize_custom_icon(value: str | None) -> str | None:
    """저장해도 되는 값인지 보고 다듬는다. 비었으면 None(기본 아이콘을 쓴다)."""
    if value is None:
        return None
    value = value.strip()
    if value == "":
        return None

    if len(value) > CUSTOM_ICON_MAX_LENGTH:
        raise InvalidCustomIcon("사진이 너무 커요. 조금 작은 사진으로 골라 주세요.")

    if value.startswith(EMOJI_PREFIX):
        return EMOJI_PREFIX + _clean_emoji(value[len(EMOJI_PREFIX) :])

    match = _DATA_URI.match(value)
    if match is None:
        raise InvalidCustomIcon("이 아이콘은 쓸 수 없어요. 아이콘을 다시 골라 주세요.")

    # 형식만 맞고 내용이 깨진 값이 들어오면 화면에서 빈 네모가 된다. 여기서 걸러 낸다.
    try:
        base64.b64decode(match.group(2), validate=True)
    except (binascii.Error, ValueError) as error:
        raise InvalidCustomIcon("사진을 읽지 못했어요. 다시 골라 주세요.") from error

    return value


def is_emoji(glyph: str) -> bool:
    """이 글자가 이모지인가.

    글자가 아스키인지만 보던 때가 있었는데, 그러면 `\u314b` 나 `\uac00` 처럼 아스키가 아닌
    한글이 전부 통과했다. 아이콘 자리에 자음 한 글자가 박혔다. 반대로 `7` 은 막혔지만
    `7\ufe0f\u20e3` 도 같이 막혔다.

    그래서 코드 포인트를 하나씩 본다. **적어도 하나는 이모지여야 하고**, 나머지는 붙이는
    것(살색·변형 선택자·ZWJ·국기 태그)만 올 수 있다. 숫자 키캡(`1\ufe0f\u20e3`)은 밑글자가
    숫자라 따로 본다.
    """
    if glyph == "":
        return False
    codes = [ord(ch) for ch in glyph]
    if _KEYCAP_MARK in codes:
        return _is_keycap(codes)

    found = False
    for code in codes:
        if _in_ranges(code, _EMOJI_RANGES):
            found = True
        elif not _in_ranges(code, _ATTACHMENT_RANGES):
            return False
    return found


def _clean_emoji(raw: str) -> str:
    glyph = raw.strip()
    if glyph == "" or len(glyph) > _EMOJI_MAX_LENGTH:
        raise InvalidCustomIcon(NOT_EMOJI_MESSAGE)
    if not is_emoji(glyph):
        raise InvalidCustomIcon(NOT_EMOJI_MESSAGE)
    return glyph


def _is_keycap(codes: list[int]) -> bool:
    """`3\ufe0f\u20e3` 같은 키캡. 밑글자는 숫자나 #·* 하나뿐이다."""
    if codes[-1] != _KEYCAP_MARK or codes[0] not in _KEYCAP_BASES:
        return False
    return all(code in {_VARIATION_EMOJI, _KEYCAP_MARK} for code in codes[1:])


def _in_ranges(code: int, ranges: tuple[tuple[int, int], ...]) -> bool:
    return any(low <= code <= high for low, high in ranges)
