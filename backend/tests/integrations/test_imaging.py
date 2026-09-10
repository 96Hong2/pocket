"""모델에게 보내기 전 사진 다듬기.

값과 정확도가 여기서 갈린다. 그리고 **위치 정보가 여기서 끊긴다.**
"""

from __future__ import annotations

import io

from PIL import Image

from app.integrations.imaging import MAX_LONG_EDGE, prepare_image
from app.integrations.llm import LlmImage


def _png(width: int, height: int, color: tuple[int, int, int] = (200, 30, 30)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buffer, format="PNG")
    return buffer.getvalue()


def _opened(image: LlmImage) -> Image.Image:
    return Image.open(io.BytesIO(image.data))


def test_긴_변을_상한까지_줄인다() -> None:
    before = LlmImage(media_type="image/png", data=_png(4000, 2000))

    after = prepare_image(before)

    assert max(_opened(after).size) == MAX_LONG_EDGE
    assert len(after.data) < len(before.data)


def test_이미_작은_사진은_키우지_않는다() -> None:
    before = LlmImage(media_type="image/png", data=_png(400, 300))

    assert _opened(prepare_image(before)).size == (400, 300)


def test_단색_테두리를_잘라낸다() -> None:
    """캡처는 위아래가 단색으로 남는 일이 잦다. 그만큼이 이미지 토큰으로 계산된다."""
    canvas = Image.new("RGB", (600, 800), (255, 255, 255))
    canvas.paste(Image.new("RGB", (600, 300), (10, 10, 10)), (0, 250))
    buffer = io.BytesIO()
    canvas.save(buffer, format="PNG")

    after = prepare_image(LlmImage(media_type="image/png", data=buffer.getvalue()))

    assert _opened(after).size == (600, 300)


def test_사진_전체가_한_색이면_손대지_않는다() -> None:
    """다 잘라내면 남는 것이 없다. 우리가 잘못 판단한 쪽으로 본다."""
    before = LlmImage(media_type="image/png", data=_png(500, 500))

    assert _opened(prepare_image(before)).size == (500, 500)


def test_EXIF_회전을_적용하고_메타데이터를_버린다() -> None:
    """영수증 사진에는 찍은 자리의 GPS 가 들어 있다. 여기서 끊지 않으면 그대로 나간다."""
    picture = Image.new("RGB", (200, 100), (120, 180, 90))
    exif = picture.getexif()
    # 274 = Orientation. 6 은 시계 방향 90도로 돌려서 보라는 뜻이다.
    exif[274] = 6
    # 34853 = GPS IFD. 찍은 자리가 여기 들어간다.
    exif[34853] = {1: "N", 2: (37.0, 30.0, 0.0)}
    buffer = io.BytesIO()
    picture.save(buffer, format="JPEG", exif=exif)
    before = LlmImage(media_type="image/jpeg", data=buffer.getvalue())

    after = prepare_image(before)

    # 눕혀 있던 것이 세워진다.
    assert _opened(after).size == (100, 200)
    # 위치 정보가 남지 않는다.
    assert not _opened(after).info.get("exif")


def test_투명한_사진은_PNG_로_남긴다() -> None:
    """JPEG 로 바꾸면 투명한 곳이 검게 칠해져 그 자리 글자가 사라진다."""
    buffer = io.BytesIO()
    Image.new("RGBA", (300, 200), (0, 0, 0, 0)).save(buffer, format="PNG")

    after = prepare_image(LlmImage(media_type="image/png", data=buffer.getvalue()))

    assert after.media_type == "image/png"


def test_못_다듬으면_원본을_그대로_보낸다() -> None:
    """다듬기는 거들 뿐이다. 여기서 막혀 사진을 못 읽는 편이 더 나쁘다."""
    broken = LlmImage(media_type="image/png", data=b"\x89PNG\r\n\x1a\n not really a png")

    assert prepare_image(broken) is broken
