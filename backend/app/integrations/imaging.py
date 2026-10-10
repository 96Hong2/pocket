"""모델에게 보내기 전에 사진을 다듬는 자리.

세 가지를 한다. **돌리고, 여백을 잘라내고, 줄인다.**

- **돌린다.** 폰 카메라는 센서를 그대로 저장하고 "이만큼 돌려서 봐라" 를 EXIF 에 적어 둔다.
  그 태그를 안 읽는 쪽에서는 영수증이 옆으로 누워 보이고, 누운 글자는 잘 안 읽힌다.
- **여백을 잘라낸다.** 캡처는 위아래가 단색으로 남는 일이 잦다. 그만큼이 이미지 토큰으로
  계산돼 값만 든다.
- **줄인다.** 긴 변을 못 박는다. 값이 여기서 가장 많이 갈린다.

**메타데이터를 통째로 버린다.** 영수증 사진에는 찍은 자리의 GPS 좌표가 들어 있다.
우리는 그것을 쓸 데가 없고, 지우지 않으면 모델 제공자에게 그대로 간다.

실패하면 원본을 그대로 돌려준다. 다듬기는 거들 뿐이라, 여기서 막혀 사진을 못 읽는 편이 더 나쁘다.
"""

from __future__ import annotations

import io
import logging
import threading
from contextlib import nullcontext

from PIL import Image, ImageChops, ImageOps

from app.core.config import get_settings
from app.integrations.llm import LlmImage

__all__ = ["MAX_IMAGE_PIXELS", "max_long_edge", "prepare_image"]

logger = logging.getLogger(__name__)

# 받아 주는 화소 수 상한. 폰 사진 4032x3024 는 약 1,200만, 긴 스크롤 캡처 1080x20000 도
# 약 2,200만이라 넉넉하다. 이보다 큰 그림은 `app/api/images.py` 가 풀기 전에 422 로 막는다.
# Pillow 의 폭탄 검사도 같은 값으로 맞춘다. 기본값(약 8,900만)으로는 압축 뒤 수백 KB 짜리
# 단색 PNG 한 장이 풀리면서 인스턴스 메모리를 다 쓴다.
MAX_IMAGE_PIXELS = 50_000_000
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

# 이보다 큰 그림은 따로 다룬다. JPEG 은 줄여서 푼다. 줄여 풀 수 없는 PNG·WebP 는 원본
# 해상도로 풀되 **한 번에 한 장만** 푼다(`_ONE_LARGE`). 결과는 예전과 같다(여백 자르기와 줄이기).
# 아주 큰 투명 그림은 푼 즉시 정수 배로 줄여 놓고 다듬는다(`_TWO_COPY_BUDGET_BYTES`).
_FULL_DECODE_PIXELS = 16_000_000

# 여백을 찾을 때 한 번에 보는 띠의 화소 수. 원본 크기 RGB 사본을 여러 벌 만들지 않으려고 나눠 본다.
_STRIP_PIXELS = 1_000_000

# 동시에 다듬는 사진 수. 큰 사진 여럿이 한꺼번에 풀리면 메모리가 끝난다.
# 한 장에 길어야 1초 안팎이라, 넘치는 요청은 잠깐 기다릴 뿐 실패하지 않는다.
_DECODING = threading.BoundedSemaphore(2)

# 줄여 풀 수 없는 큰 그림을 푸는 자리. 5,000만 화소 RGB 한 장이 약 200MB 라 하나만 둔다.
_ONE_LARGE = threading.Lock()

# 투명한 그림은 줄일 때 Pillow 가 그림 전체를 미리 곱한 사본(RGBa·La)으로 한 벌 더 만든다.
# Pillow 는 화소마다 4바이트를 쓰므로 두 벌이 이 값을 넘으면 원본 크기 사본을 만들지 않는다.
# 푼 그림을 띠마다 잘라 `reduce()` 로 정수 배 줄이고(`_reduce_in_strips`), 그 작은 그림을
# 여느 때처럼 자르고 줄인다. 1080x46000 RGBA 를 통째로 줄이면 약 400MB, 이 길은 약 200MB 다.
_ALPHA_TWO_COPY_MODES = frozenset({"RGBA", "LA"})
_TWO_COPY_BUDGET_BYTES = 200_000_000

# 정수 배로 먼저 줄일 때 남길 긴 변. 긴 변 상한(최대 2048)보다 작아지지 않게 한다.
_REDUCED_LONG_EDGE = 2048


def max_long_edge() -> int:
    """긴 변 상한. 값이 여기서 가장 많이 갈려서 환경변수로 뺐다(`LLM_IMAGE_MAX_LONG_EDGE`).

    작을수록 싸고, 작은 글자가 먼저 뭉갠다. 인식률은 실물 사진으로만 판정되므로
    화면을 다시 배포하지 않고 되돌릴 수 있어야 한다.
    """
    return get_settings().llm_image_max_long_edge


# 여백으로 볼 색 차이. 압축 잡티가 있어 완전히 같은 색은 아니다.
_BORDER_TOLERANCE = 12

# 잘라낸 뒤 남아야 하는 최소 비율. 이보다 작아지면 우리가 잘못 자른 것으로 본다.
_MIN_KEPT_RATIO = 0.35

_JPEG_QUALITY = 85


def prepare_image(image: LlmImage) -> LlmImage:
    """돌리고 · 여백을 잘라내고 · 줄인 사진. 못 다듬으면 원본 그대로."""
    try:
        with _DECODING:
            return _prepare(image)
    except Exception:
        # 원본을 보내는 것이 아무것도 못 보내는 것보다 낫다.
        logger.warning("사진을 다듬지 못해 원본을 그대로 보낸다", exc_info=True)
        return image


def _prepare(image: LlmImage) -> LlmImage:
    with Image.open(io.BytesIO(image.data)) as opened:
        before = opened.size
        pixels = before[0] * before[1]
        large = pixels > _FULL_DECODE_PIXELS
        if (
            large
            and opened.mode in _ALPHA_TWO_COPY_MODES
            and pixels * 4 * 2 > _TWO_COPY_BUDGET_BYTES
        ):
            picture = _shrink(_trim_border(_reduced(opened)))
        else:
            if large and opened.format == "JPEG":
                # 디코드 단계에서 1/2·1/4·1/8 로 줄여 푼다. 줄인 크기의 두 배는 남겨 화질을 지킨다.
                opened.draft(opened.mode, _draft_size(before))
                large = False
            picture = _decoded(opened, large=large)
        data, media_type = _encode(picture)

    if len(data) >= len(image.data) and picture.size == before:
        # 다듬어서 오히려 커졌고 크기도 그대로다. 손댈 이유가 없었다.
        return image

    logger.info(
        "사진을 다듬었다 %dx%d %d바이트 → %dx%d %d바이트",
        *before,
        len(image.data),
        *picture.size,
        len(data),
    )
    return LlmImage(media_type=media_type, data=data)


def _decoded(opened: Image.Image, *, large: bool) -> Image.Image:
    """풀고 돌리고 여백을 잘라 줄인 그림. 줄여 풀 수 없는 큰 그림은 한 장씩 푼다."""
    with _ONE_LARGE if large else nullcontext():
        opened.load()
        # 회전과 함께 그 태그를 지운다. 제자리에서 돌려 원본 크기 사본을 하나 덜 만든다.
        ImageOps.exif_transpose(opened, in_place=True)
        if large:
            # 잘라 낸 원본 크기 사본을 따로 만들지 않고 그 자리를 바로 줄인다.
            return _shrink(opened, box=_border_box(opened))
        return _shrink(_trim_border(opened))


def _reduced(opened: Image.Image) -> Image.Image:
    """아주 큰 투명 그림을 한 장씩 풀어, 긴 변이 `_REDUCED_LONG_EDGE` 이하로 정수 배 줄인다."""
    factor = -(-max(opened.size) // max(_REDUCED_LONG_EDGE, max_long_edge()))
    with _ONE_LARGE:
        opened.load()
        reduced = _reduce_in_strips(opened, factor)
        # 원본 화소를 놓은 뒤에 다음 큰 그림에 자리를 넘긴다.
        opened.close()
    # 회전은 줄인 그림에서 한다. 원본 크기로 돌리면 사본이 한 벌 더 생긴다.
    ImageOps.exif_transpose(reduced, in_place=True)
    return reduced


def _reduce_in_strips(picture: Image.Image, factor: int) -> Image.Image:
    """`factor` 배로 줄인 그림. 통째로 `reduce()` 한 것과 화소가 같다.

    Pillow 의 `reduce()` 는 투명 그림을 먼저 그림 전체 크기의 미리 곱한 사본으로 바꾼다.
    그래서 가로 띠(높이는 `factor` 의 배수)로 잘라 띠마다 줄여 붙인다. 칸 평균은 칸 안에서만
    계산되므로 띠 경계에서 결과가 달라지지 않는다.
    """
    width, height = picture.size
    out = Image.new(picture.mode, (-(-width // factor), -(-height // factor)))
    rows = factor * max(1, _STRIP_PIXELS // (width * factor))
    for top in range(0, height, rows):
        strip = picture.crop((0, top, width, min(height, top + rows)))
        out.paste(strip.reduce(factor), (0, top // factor))
    # 회전 태그(EXIF)를 옮겨 둔다. 다시 담을 때는 싣지 않는다.
    out.info.update(picture.info)
    return out


def _draft_size(size: tuple[int, int]) -> tuple[int, int]:
    """JPEG 을 줄여 풀 때 남길 크기. 긴 변 상한으로 줄인 크기의 두 배다."""
    ratio = min(1.0, max_long_edge() / max(size))
    return (max(1, round(size[0] * ratio * 2)), max(1, round(size[1] * ratio * 2)))


def _trim_border(picture: Image.Image) -> Image.Image:
    """네 귀퉁이와 같은 색으로 둘린 테두리를 잘라낸다."""
    box = _border_box(picture)
    return picture if box is None else picture.crop(box)


def _border_box(picture: Image.Image) -> tuple[int, int, int, int] | None:
    """테두리를 뺀 상자. 자를 것이 없으면 None.

    기준색은 왼쪽 위 한 점이다. 캡처의 여백은 거기서 시작한다.
    너무 많이 잘리면 사진 전체가 그 색에 가까운 것이라 보고 손대지 않는다.

    가로 띠로 나눠 본다. 점마다 따로 판정하므로 통째로 볼 때와 결과가 같고,
    원본 크기 RGB 사본 세 벌을 한꺼번에 만들지 않는다.
    """
    width, height = picture.size
    corner = picture.crop((0, 0, 1, 1)).convert("RGB").getpixel((0, 0))
    rows = max(1, _STRIP_PIXELS // width)
    box: tuple[int, int, int, int] | None = None
    for top in range(0, height, rows):
        strip = picture.crop((0, top, width, min(height, top + rows))).convert("RGB")
        background = Image.new("RGB", strip.size, corner)
        diff = ImageChops.difference(strip, background).convert("L")
        found = diff.point(lambda value: 255 if value > _BORDER_TOLERANCE else 0).getbbox()
        if found is None:
            continue
        left, upper, right, lower = found[0], found[1] + top, found[2], found[3] + top
        if box is None:
            box = (left, upper, right, lower)
        else:
            box = (min(box[0], left), box[1], max(box[2], right), lower)
    if box is None:
        return None

    kept = (box[2] - box[0]) * (box[3] - box[1])
    if kept < width * height * _MIN_KEPT_RATIO:
        return None
    if box == (0, 0, width, height):
        return None
    return box


def _shrink(picture: Image.Image, *, box: tuple[int, int, int, int] | None = None) -> Image.Image:
    """긴 변을 상한까지 줄인다. `box` 가 있으면 그 자리만 잘라 줄인다."""
    region = box if box is not None else (0, 0, picture.width, picture.height)
    width, height = region[2] - region[0], region[3] - region[1]
    limit = max_long_edge()
    longest = max(width, height)
    if longest <= limit:
        return picture if box is None else picture.crop(box)
    ratio = limit / longest
    size = (max(1, round(width * ratio)), max(1, round(height * ratio)))
    return picture.resize(size, Image.Resampling.LANCZOS, box=box)


def _encode(picture: Image.Image) -> tuple[bytes, str]:
    """다시 담는다. 투명한 부분이 있으면 PNG, 아니면 JPEG 다.

    JPEG 로 바꾸면서 투명한 곳이 검게 칠해지면 그 자리 글자가 사라진다.
    새로 담는 파일에는 EXIF 를 싣지 않는다. 위치 정보가 여기서 끊긴다.
    """
    buffer = io.BytesIO()
    if picture.mode in ("RGBA", "LA", "P"):
        picture.convert("RGBA").save(buffer, format="PNG", optimize=True)
        return buffer.getvalue(), "image/png"
    picture.convert("RGB").save(buffer, format="JPEG", quality=_JPEG_QUALITY, optimize=True)
    return buffer.getvalue(), "image/jpeg"
