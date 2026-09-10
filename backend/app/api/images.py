"""캡처 data URL 을 바이트로 푸는 유일한 자리.

이미지가 어디까지 갔다 사라지는지는 이 파일 하나만 보면 답할 수 있어야 한다.
그래서 형식·mime·매직바이트·크기 검사를 여기 모으고, 다른 곳에서 이미지 바이트를 만들지 않는다.

여기에만 있는 규율: 예외 메시지·로그·트레이스백에 입력 값이나 그 조각을 넣지 않는다.
base64 한 토막만 새어도 캡처 원문이 복원된다.
**메타는 남긴다.** 선언된 mime·바이트 수·거절 사유는 그림을 되살릴 수 없고,
이게 없으면 실기기에서 왜 막혔는지 영영 모른다(422 한 줄만 남고 끝난 적이 있다).
"""

from __future__ import annotations

import base64
import binascii
import logging
import re
from collections.abc import Callable

from app.api.errors import ApiError, ErrorCode
from app.integrations.llm import LlmImage

__all__ = ["MAX_IMAGE_BYTES", "decode_data_url"]

logger = logging.getLogger(__name__)

# 디코드한 뒤의 바이트 상한. 문자열 길이 상한은 스키마가 앞에서 따로 본다.
MAX_IMAGE_BYTES = 4 * 1024 * 1024

_PREFIX = "data:"

# base64 사이에 섞여 오는 공백·줄바꿈. 기기에 따라 76자마다 끊거나 끝에 줄바꿈을 붙인다.
_WHITESPACE = re.compile(r"\s+")

# 받아 주는 형식. 이 표가 곧 허용 목록이고 검사기다. 둘이 어긋날 자리를 만들지 않는다.
_MAGIC: dict[str, Callable[[bytes], bool]] = {
    "image/png": lambda data: data.startswith(b"\x89PNG"),
    "image/jpeg": lambda data: data.startswith(b"\xff\xd8\xff"),
    # RIFF 컨테이너라 앞 네 바이트만으로는 갈리지 않는다. 8번째부터의 WEBP 까지 본다.
    "image/webp": lambda data: data.startswith(b"RIFF") and data[8:12] == b"WEBP",
}

def decode_data_url(value: str) -> LlmImage:
    """`data:<mime>;base64,<payload>` 를 이미지로 푼다.

    **형식은 헤더가 아니라 실제 바이트로 정한다.** 기기가 붙여 주는 mime 은 믿을 게 못 된다.
    `image/jpg` 처럼 이름이 어긋나거나 `;charset=` 같은 매개변수가 끼어 있으면,
    바이트는 멀쩡한 PNG 인데 헤더 한 줄 때문에 거절하게 된다.

    거절 사유는 화면에 알려 주지 않는다. 이유를 나누면 그 메시지가 곧 입력에 대한 정보다.
    대신 로그에 남긴다.
    """
    header, separator, payload = value.partition(",")
    if not separator or not header.startswith(_PREFIX):
        raise _rejected("data URL 이 아니다")

    # base64 가 아닌 data URL(퍼센트 인코딩)은 받지 않는다. 이미지가 올 형식이 아니다.
    declared = header[len(_PREFIX) :]
    if ";base64" not in declared:
        raise _rejected("base64 data URL 이 아니다")

    try:
        data = base64.b64decode(_padded(_WHITESPACE.sub("", payload)), validate=True)
    except (binascii.Error, ValueError):
        # from None 으로 원인을 끊는다. 원인 예외의 문자열에 입력이 실려 올라갈 수 있다.
        raise _rejected("base64 를 풀지 못했다") from None

    if not data:
        raise _rejected("빈 이미지")
    if len(data) > MAX_IMAGE_BYTES:
        raise _rejected(f"{len(data)} 바이트로 상한을 넘겼다")

    media_type = _sniff(data)
    if media_type is None:
        raise _rejected(f"아는 형식이 아니다 (헤더는 {declared!r})")

    return LlmImage(media_type=media_type, data=data)


def _padded(payload: str) -> str:
    """끝의 `=` 를 떼고 보내는 인코더가 있다. 붙여 놓고 디코드한다."""
    remainder = len(payload) % 4
    return payload if remainder == 0 else payload + "=" * (4 - remainder)


def _sniff(data: bytes) -> str | None:
    """앞 몇 바이트로 형식을 가른다. 모르는 형식이면 None."""
    for media_type, matches in _MAGIC.items():
        if matches(data):
            return media_type
    return None


def _rejected(reason: str) -> ApiError:
    # 사용자에게는 한 문장만 간다. 어디서 걸렸는지는 우리만 본다.
    logger.warning("캡처를 받지 못했다: %s", reason)
    return ApiError(ErrorCode.INVALID_REQUEST, "사진을 읽지 못했어요.", status_code=422)
