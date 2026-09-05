"""캡처 data URL 을 바이트로 푸는 유일한 자리.

이미지가 어디까지 갔다 사라지는지는 이 파일 하나만 보면 답할 수 있어야 한다.
그래서 형식·mime·매직바이트·크기 검사를 여기 모으고, 다른 곳에서 이미지 바이트를 만들지 않는다.

여기에만 있는 규율: 예외 메시지·로그·트레이스백에 입력 값이나 그 조각을 넣지 않는다.
base64 한 토막만 새어도 캡처 원문이 복원된다.
"""

from __future__ import annotations

import base64
import binascii
from collections.abc import Callable

from app.api.errors import ApiError, ErrorCode
from app.integrations.llm import LlmImage

__all__ = ["ALLOWED_MEDIA_TYPES", "MAX_IMAGE_BYTES", "decode_data_url"]

# 디코드한 뒤의 바이트 상한. 문자열 길이 상한은 스키마가 앞에서 따로 본다.
MAX_IMAGE_BYTES = 4 * 1024 * 1024

_PREFIX = "data:"
_ENCODING = ";base64"

_MAGIC: dict[str, Callable[[bytes], bool]] = {
    "image/png": lambda data: data.startswith(b"\x89PNG"),
    "image/jpeg": lambda data: data.startswith(b"\xff\xd8\xff"),
    # RIFF 컨테이너라 앞 네 바이트만으로는 갈리지 않는다. 8번째부터의 WEBP 까지 본다.
    "image/webp": lambda data: data.startswith(b"RIFF") and data[8:12] == b"WEBP",
}

# 받아 주는 형식. 매직바이트를 아는 것만 넣는다. 목록과 검사가 어긋날 자리를 없앤다.
ALLOWED_MEDIA_TYPES = frozenset(_MAGIC)


def decode_data_url(value: str) -> LlmImage:
    """`data:<mime>;base64,<payload>` 를 이미지로 푼다.

    형식 → mime → 디코드 → 크기 → 매직바이트 순서로 본다.
    어디서 걸렸는지는 알려 주지 않는다. 이유를 나누면 그 메시지가 곧 입력에 대한 정보다.
    """
    header, separator, payload = value.partition(",")
    if not separator:
        raise _rejected()

    media_type = _media_type(header)
    if media_type not in ALLOWED_MEDIA_TYPES:
        raise _rejected()

    try:
        data = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        # from None 으로 원인을 끊는다. 원인 예외의 문자열에 입력이 실려 올라갈 수 있다.
        raise _rejected() from None

    if not data or len(data) > MAX_IMAGE_BYTES:
        raise _rejected()
    if not _MAGIC[media_type](data):
        raise _rejected()

    return LlmImage(media_type=media_type, data=data)


def _media_type(header: str) -> str:
    """`data:image/png;base64` 에서 mime 만 꺼낸다. 모양이 다르면 빈 문자열이다."""
    if not header.startswith(_PREFIX) or not header.endswith(_ENCODING):
        return ""
    return header[len(_PREFIX) : -len(_ENCODING)]


def _rejected() -> ApiError:
    return ApiError(ErrorCode.INVALID_REQUEST, "사진을 읽지 못했어요.", status_code=422)
