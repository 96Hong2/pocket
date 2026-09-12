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
    "InvalidCustomIcon",
    "normalize_custom_icon",
]

EMOJI_PREFIX = "emoji:"

# 데이터 URI 길이 상한(문자 수). base64 는 원본의 4/3 이라 실제 그림은 약 190KB 까지다.
# 256px 정사각 webp 는 보통 10~30KB 라 열 배 넘게 여유가 있다.
CUSTOM_ICON_MAX_LENGTH = 262_144

# 그림 형식은 셋만 받는다. svg 는 그 안에 스크립트를 담을 수 있어 뺀다.
_DATA_URI = re.compile(r"^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$")

# 이모지 하나. 살색 지정과 ZWJ 로 이어 붙인 것(가족 이모지 등)이 있어 넉넉히 잡는다.
_EMOJI_MAX_LENGTH = 24


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


def _clean_emoji(raw: str) -> str:
    glyph = raw.strip()
    if glyph == "" or len(glyph) > _EMOJI_MAX_LENGTH:
        raise InvalidCustomIcon("이모지 하나만 넣어 주세요.")
    # 글자·숫자만 온 것은 이모지가 아니라 이름이다. 아이콘 자리에 'ab' 가 박히면 안 된다.
    if glyph.isascii():
        raise InvalidCustomIcon("이모지 하나만 넣어 주세요.")
    return glyph
