"""아이콘에 걸 수 있는 값의 규칙.

실기기에서 나온 두 가지를 여기서 못 박는다. **숫자 키캡은 이모지인데 막혔고**
(`7️⃣` 을 넣으면 「요청 형식이 아닙니다」), **한글 자음 한 글자는 이모지가 아닌데 통과했다**
(아이콘 자리에 'ㅋ' 이 박혔다). 아스키인지만 보던 옛 판정의 결과다.
"""

from __future__ import annotations

import base64

import pytest

from app.domain.category_icons import (
    EMOJI_PREFIX,
    NOT_EMOJI_MESSAGE,
    InvalidCustomIcon,
    is_emoji,
    normalize_custom_icon,
)


@pytest.mark.parametrize(
    "glyph",
    ["🍔", "⏰", "♥️", "🇰🇷", "👍🏽", "👨‍👩‍👧", "7️⃣", "#️⃣", "⭐", "🫠"],
)
def test_이모지는_통과한다(glyph: str) -> None:
    assert is_emoji(glyph)


@pytest.mark.parametrize("glyph", ["7", "ㅋ", "가", "a", "ab", "€", "１", " ", ""])
def test_이모지가_아닌_글자는_막힌다(glyph: str) -> None:
    assert not is_emoji(glyph)


def test_숫자만_넣으면_이모지가_아니라고_말해_준다() -> None:
    with pytest.raises(InvalidCustomIcon) as caught:
        normalize_custom_icon(f"{EMOJI_PREFIX}7")
    assert str(caught.value) == NOT_EMOJI_MESSAGE


def test_한글_자음도_같은_말로_막힌다() -> None:
    with pytest.raises(InvalidCustomIcon) as caught:
        normalize_custom_icon(f"{EMOJI_PREFIX}ㅋ")
    assert str(caught.value) == NOT_EMOJI_MESSAGE


def test_숫자_키캡은_이모지라_통과한다() -> None:
    assert normalize_custom_icon(f"{EMOJI_PREFIX}7️⃣") == f"{EMOJI_PREFIX}7️⃣"


def test_사진은_그대로_통과한다() -> None:
    encoded = base64.b64encode(b"fake-webp").decode()
    value = f"data:image/webp;base64,{encoded}"
    assert normalize_custom_icon(value) == value


def test_빈_값은_기본_아이콘으로_되돌린다() -> None:
    assert normalize_custom_icon("") is None
    assert normalize_custom_icon(None) is None
