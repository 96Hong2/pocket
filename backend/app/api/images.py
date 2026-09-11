"""캡처 이미지를 바이트로 푸는 유일한 자리.

이미지가 어디까지 갔다 사라지는지는 이 파일 하나만 보면 답할 수 있어야 한다.
그래서 형식·mime·매직바이트·크기 검사를 여기 모으고, 다른 곳에서 이미지 바이트를 만들지 않는다.

**헤더는 있어도 되고 없어도 된다.** 토스 앨범·카메라가 돌려주는 `dataUri` 는 이름과 달리
`data:` 접두사 없이 base64 만 오는 경우가 있다. 형식은 어차피 실제 바이트로 정하므로
접두사가 하는 일이 없고, 그것 하나로 막으면 사용자에게는 그냥 안 되는 기능이 된다.

여기에만 있는 규율: 예외 메시지·로그·트레이스백에 입력 값이나 그 조각을 넣지 않는다.
base64 한 토막만 새어도 캡처 원문이 복원된다.
**메타는 남긴다.** 선언된 mime·바이트 수·거절 사유·값의 생김새는 그림을 되살릴 수 없고,
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

# 거절할 때 남길 값의 생김새. 값 자체가 아니라 어느 갈래인지만 적는다.
# 실기기가 무엇을 보냈는지 모르면 다음 회차도 똑같이 헤맨다.
_SHAPES: tuple[tuple[str, str], ...] = (
    ("data:", "data URL"),
    ("file:", "파일 경로"),
    ("content:", "안드로이드 content URI"),
    ("http", "http URL"),
    ("blob:", "blob URL"),
    ("/", "절대 경로"),
)

# 받아 주는 형식. 이 표가 곧 허용 목록이고 검사기다. 둘이 어긋날 자리를 만들지 않는다.
_MAGIC: dict[str, Callable[[bytes], bool]] = {
    "image/png": lambda data: data.startswith(b"\x89PNG"),
    "image/jpeg": lambda data: data.startswith(b"\xff\xd8\xff"),
    # RIFF 컨테이너라 앞 네 바이트만으로는 갈리지 않는다. 8번째부터의 WEBP 까지 본다.
    "image/webp": lambda data: data.startswith(b"RIFF") and data[8:12] == b"WEBP",
}


def decode_data_url(value: str) -> LlmImage:
    """`data:<mime>;base64,<payload>` 또는 base64 만 온 것을 이미지로 푼다.

    **형식은 헤더가 아니라 실제 바이트로 정한다.** 기기가 붙여 주는 mime 은 믿을 게 못 된다.
    `image/jpg` 처럼 이름이 어긋나거나 `;charset=` 같은 매개변수가 끼어 있으면,
    바이트는 멀쩡한 PNG 인데 헤더 한 줄 때문에 거절하게 된다.
    같은 이유로 **헤더가 통째로 없어도 받는다.** 안전을 지키는 것은 매직바이트와 크기 상한이지
    접두사가 아니다.

    거절 사유는 화면에 알려 주지 않는다. 이유를 나누면 그 메시지가 곧 입력에 대한 정보다.
    대신 로그에 남긴다.
    """
    declared, payload = _split(value)

    try:
        data = base64.b64decode(_padded(_WHITESPACE.sub("", payload)), validate=True)
    except (binascii.Error, ValueError):
        # from None 으로 원인을 끊는다. 원인 예외의 문자열에 입력이 실려 올라갈 수 있다.
        raise _rejected("base64 를 풀지 못했다", value) from None

    if not data:
        raise _rejected("빈 이미지", value)
    if len(data) > MAX_IMAGE_BYTES:
        raise _rejected(f"{len(data)} 바이트로 상한을 넘겼다", value)

    media_type = _sniff(data)
    if media_type is None:
        raise _rejected(f"아는 형식이 아니다 (헤더는 {declared!r})", value)

    return LlmImage(media_type=media_type, data=data)


def _split(value: str) -> tuple[str, str]:
    """선언된 mime 과 base64 부분으로 가른다. 헤더가 없으면 전부가 base64 다."""
    header, separator, payload = value.partition(",")
    if not separator or not header.startswith(_PREFIX):
        return "", value

    declared = header[len(_PREFIX) :]
    # base64 가 아닌 data URL(퍼센트 인코딩)은 받지 않는다. 이미지가 올 형식이 아니다.
    if ";base64" not in declared:
        raise _rejected("base64 data URL 이 아니다", value)
    return declared, payload


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


def _shape(value: str) -> str:
    """값의 생김새. 정해 둔 갈래 이름과 길이만 돌려준다. 값 조각은 절대 싣지 않는다."""
    for prefix, name in _SHAPES:
        if value.startswith(prefix):
            return f"{name} {len(value)}자"
    return f"그 밖 {len(value)}자"


def _rejected(reason: str, value: str) -> ApiError:
    # 사용자에게는 한 문장만 간다. 어디서 걸렸는지는 우리만 본다.
    logger.warning("캡처를 받지 못했다: %s (%s)", reason, _shape(value))
    return ApiError(ErrorCode.INVALID_REQUEST, "사진을 읽지 못했어요.", status_code=422)
