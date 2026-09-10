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

from PIL import Image, ImageChops, ImageOps

from app.integrations.llm import LlmImage

__all__ = ["MAX_LONG_EDGE", "prepare_image"]

logger = logging.getLogger(__name__)

# 긴 변 상한. 영수증 글자가 읽히는 선에서 이미지 토큰을 가장 많이 줄이는 지점이다.
MAX_LONG_EDGE = 1600

# 여백으로 볼 색 차이. 압축 잡티가 있어 완전히 같은 색은 아니다.
_BORDER_TOLERANCE = 12

# 잘라낸 뒤 남아야 하는 최소 비율. 이보다 작아지면 우리가 잘못 자른 것으로 본다.
_MIN_KEPT_RATIO = 0.35

_JPEG_QUALITY = 85


def prepare_image(image: LlmImage) -> LlmImage:
    """돌리고 · 여백을 잘라내고 · 줄인 사진. 못 다듬으면 원본 그대로."""
    try:
        return _prepare(image)
    except Exception:
        # 원본을 보내는 것이 아무것도 못 보내는 것보다 낫다.
        logger.warning("사진을 다듬지 못해 원본을 그대로 보낸다", exc_info=True)
        return image


def _prepare(image: LlmImage) -> LlmImage:
    with Image.open(io.BytesIO(image.data)) as opened:
        opened.load()
        before = opened.size
        # exif_transpose 가 회전과 함께 그 태그를 지운다. 두 번 돌지 않는다.
        picture = ImageOps.exif_transpose(opened) or opened
        picture = _trim_border(picture)
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


def _trim_border(picture: Image.Image) -> Image.Image:
    """네 귀퉁이와 같은 색으로 둘린 테두리를 잘라낸다.

    기준색은 왼쪽 위 한 점이다. 캡처의 여백은 거기서 시작한다.
    너무 많이 잘리면 사진 전체가 그 색에 가까운 것이라 보고 손대지 않는다.
    """
    flat = picture.convert("RGB")
    background = Image.new("RGB", flat.size, flat.getpixel((0, 0)))
    diff = ImageChops.difference(flat, background).convert("L")
    box = diff.point(lambda value: 255 if value > _BORDER_TOLERANCE else 0).getbbox()
    if box is None:
        return picture

    width, height = picture.size
    kept = (box[2] - box[0]) * (box[3] - box[1])
    if kept < width * height * _MIN_KEPT_RATIO:
        return picture
    return picture.crop(box)


def _shrink(picture: Image.Image) -> Image.Image:
    longest = max(picture.size)
    if longest <= MAX_LONG_EDGE:
        return picture
    ratio = MAX_LONG_EDGE / longest
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
