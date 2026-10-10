"""모델에게 보내기 전 사진 다듬기.

값과 정확도가 여기서 갈린다. 그리고 **위치 정보가 여기서 끊긴다.**
"""

from __future__ import annotations

import io
import logging

import pytest
from PIL import Image, ImageChops, ImageFile

from app.integrations import imaging
from app.integrations.imaging import max_long_edge, prepare_image
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

    assert max(_opened(after).size) == max_long_edge()
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


# ── 큰 사진의 메모리 ────────────────────────────────────────
#
# 다듬기가 원본 해상도 RGB 사본을 여러 벌 만들면 512Mi 인스턴스가 죽는다. 예외로 안 잡히고
# 컨테이너째 내려가 같은 인스턴스의 다른 요청도 함께 실패한다.


def _old_trim_box(picture: Image.Image) -> tuple[int, int, int, int] | None:
    """띠로 나누기 전의 판정. 결과가 같아야 화면이 받는 사진이 그대로다."""
    flat = picture.convert("RGB")
    background = Image.new("RGB", flat.size, flat.getpixel((0, 0)))
    diff = ImageChops.difference(flat, background).convert("L")
    return diff.point(lambda value: 255 if value > 12 else 0).getbbox()


@pytest.mark.parametrize("mode", ["RGB", "RGBA", "P", "L"])
def test_띠로_나눠_봐도_잘라내는_자리가_같다(mode: str) -> None:
    """띠(약 100만 화소)를 여러 개 걸치는 그림에서 예전 판정과 같은 상자가 나와야 한다."""
    canvas = Image.new("RGB", (1000, 3000), (250, 250, 250))
    canvas.paste(Image.new("RGB", (700, 600), (20, 40, 60)), (150, 500))
    canvas.paste(Image.new("RGB", (40, 30), (200, 10, 10)), (900, 2800))
    # 팔레트로 바꿀 때 점묘가 끼면 테두리가 사라진다. 색 수를 줄이기만 한다.
    picture = (
        canvas.convert("P", palette=Image.Palette.ADAPTIVE, colors=8)
        if mode == "P"
        else canvas.convert(mode)
    )

    trimmed = imaging._trim_border(picture)

    expected = _old_trim_box(picture)
    assert expected == (150, 500, 940, 2830)
    assert trimmed.size == (expected[2] - expected[0], expected[3] - expected[1])


def _decoded_sizes(monkeypatch: pytest.MonkeyPatch) -> list[tuple[int, int]]:
    """실제로 풀어 낸 그림 크기를 받아 적는다.

    Pillow 가 잡는 메모리는 tracemalloc 에 안 잡혀서 이렇게 잰다.
    """
    sizes: list[tuple[int, int]] = []
    original = ImageFile.ImageFile.load

    def load(self: ImageFile.ImageFile):  # type: ignore[no-untyped-def]
        result = original(self)
        sizes.append(self.size)
        return result

    monkeypatch.setattr(ImageFile.ImageFile, "load", load)
    return sizes


def _compared_sizes(monkeypatch: pytest.MonkeyPatch) -> list[int]:
    """여백을 찾느라 만든 비교 사본의 화소 수."""
    pixels: list[int] = []
    original = ImageChops.difference

    def difference(a: Image.Image, b: Image.Image) -> Image.Image:
        pixels.append(a.width * a.height)
        return original(a, b)

    monkeypatch.setattr(imaging.ImageChops, "difference", difference)
    return pixels


def test_아주_큰_PNG_는_풀지_않고_원본을_보낸다(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """PNG 는 줄여서 풀 수 없다. 다듬기가 실패했을 때와 같은 결과(원본)를 낸다."""
    buffer = io.BytesIO()
    Image.new("RGB", (5000, 4000), (255, 255, 255)).save(buffer, format="PNG")
    before = LlmImage(media_type="image/png", data=buffer.getvalue())
    decoded = _decoded_sizes(monkeypatch)

    with caplog.at_level(logging.INFO):
        after = prepare_image(before)

    assert after is before
    assert decoded == []
    assert "너무 커서" in caplog.text


def test_아주_큰_JPEG_는_줄여서_풀고_결과는_같은_크기다(monkeypatch: pytest.MonkeyPatch) -> None:
    buffer = io.BytesIO()
    canvas = Image.new("RGB", (6000, 4000), (240, 240, 240))
    canvas.paste(Image.new("RGB", (5000, 3000), (30, 30, 30)), (500, 500))
    canvas.save(buffer, format="JPEG")
    before = LlmImage(media_type="image/jpeg", data=buffer.getvalue())
    decoded = _decoded_sizes(monkeypatch)
    compared = _compared_sizes(monkeypatch)

    after = prepare_image(before)

    # 원본 2,400만 화소를 그대로 풀지 않았다. 1/2 로 푼 3000x2000 이다.
    assert set(decoded) == {(3000, 2000)}
    # 여백 비교 사본은 띠 하나(약 100만 화소)를 넘지 않는다.
    assert compared and max(compared) <= 1_000_000
    # 테두리를 잘라낸 5000x3000 의 비율 그대로 긴 변 상한까지 줄었다.
    assert _opened(after).size == (max_long_edge(), round(3000 * max_long_edge() / 5000))


def test_폰_사진_크기는_예전처럼_통째로_다듬는다() -> None:
    """상한 아래 사진은 지금까지와 같은 길을 지난다. 테두리를 잘라내고 줄인다."""
    canvas = Image.new("RGB", (3024, 4032), (255, 255, 255))
    canvas.paste(Image.new("RGB", (3024, 2000), (10, 10, 10)), (0, 1000))
    buffer = io.BytesIO()
    canvas.save(buffer, format="JPEG")

    after = prepare_image(LlmImage(media_type="image/jpeg", data=buffer.getvalue()))

    assert _opened(after).size == (max_long_edge(), round(2000 * max_long_edge() / 3024))
