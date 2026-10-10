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

# 이보다 큰 그림은 원본 해상도로 통째로 풀지 않는다. JPEG 은 줄여서 풀고,
# 줄여 풀 수 없는 PNG·WebP 는 다듬지 않고 원본을 보낸다(다듬기가 실패했을 때와 같은 결과).
_FULL_DECODE_PIXELS = 16_000_000

# 여백을 찾을 때 한 번에 보는 띠의 화소 수. 원본 크기 RGB 사본을 여러 벌 만들지 않으려고 나눠 본다.
_STRIP_PIXELS = 1_000_000

# 동시에 다듬는 사진 수. 큰 사진 여럿이 한꺼번에 풀리면 메모리가 끝난다.
# 한 장에 길어야 1초 안팎이라, 넘치는 요청은 잠깐 기다릴 뿐 실패하지 않는다.
_DECODING = threading.BoundedSemaphore(2)


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
        if before[0] * before[1] > _FULL_DECODE_PIXELS:
            if opened.format != "JPEG":
                logger.info("사진이 너무 커서 다듬지 않고 보낸다 %dx%d", *before)
                return image
            # 디코드 단계에서 1/2·1/4·1/8 로 줄여 푼다. 줄인 뒤 크기의 두 배는 남겨 화질을 지킨다.
            opened.draft(opened.mode, _draft_size(before))
        opened.load()
        # 회전과 함께 그 태그를 지운다. 제자리에서 돌려 원본 크기 사본을 하나 덜 만든다.
        ImageOps.exif_transpose(opened, in_place=True)
        picture = _trim_border(opened)
        picture = _shrink(picture)
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


def _draft_size(size: tuple[int, int]) -> tuple[int, int]:
    """JPEG 을 줄여 풀 때 남길 크기. 긴 변 상한으로 줄인 크기의 두 배다."""
    ratio = min(1.0, max_long_edge() / max(size))
    return (max(1, round(size[0] * ratio * 2)), max(1, round(size[1] * ratio * 2)))


def _trim_border(picture: Image.Image) -> Image.Image:
    """네 귀퉁이와 같은 색으로 둘린 테두리를 잘라낸다.

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
        return picture

    kept = (box[2] - box[0]) * (box[3] - box[1])
    if kept < width * height * _MIN_KEPT_RATIO:
        return picture
    return picture.crop(box)


def _shrink(picture: Image.Image) -> Image.Image:
    limit = max_long_edge()
    longest = max(picture.size)
    if longest <= limit:
        return picture
    ratio = limit / longest
    size = (max(1, round(picture.width * ratio)), max(1, round(picture.height * ratio)))
    return picture.resize(size, Image.Resampling.LANCZOS)


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
