"""캡처 data URL 을 푸는 자리.

이 마일스톤에서 새로 만든 유일한 위험 함수라, 일부러 깨뜨려 확인하는 자리를 여기 한 곳에 둔다.
막아야 하는 것은 두 가지다. 이상한 값이 이미지 행세를 하고 들어오는 것,
그리고 실패하면서 입력 조각을 밖으로 흘리는 것이다.
"""

from __future__ import annotations

import base64
import logging
import traceback

import pytest

from app.api.errors import ApiError
from app.api.images import MAX_IMAGE_BYTES, decode_data_url

# 진짜 1x1 PNG. 매직바이트를 흉내 내지 않고 실제 파일 앞머리를 쓴다.
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 32
WEBP_BYTES = b"RIFF" + b"\x00" * 4 + b"WEBP" + b"\x00" * 32

# 새어 나왔는지 찾을 표식. 이 조각이 어디에도 보이면 안 된다.
MARKER = "SECRETCAPTUREPAYLOAD"


def _data_url(media_type: str, data: bytes) -> str:
    return f"data:{media_type};base64,{base64.b64encode(data).decode()}"


def test_정상_png_는_바이트로_풀린다() -> None:
    image = decode_data_url(_data_url("image/png", PNG_BYTES))

    assert image.media_type == "image/png"
    assert image.data == PNG_BYTES


@pytest.mark.parametrize(
    ("media_type", "data"),
    [("image/jpeg", JPEG_BYTES), ("image/webp", WEBP_BYTES)],
)
def test_jpeg_와_webp_도_받는다(media_type: str, data: bytes) -> None:
    image = decode_data_url(_data_url(media_type, data))

    assert image.media_type == media_type
    assert image.data == data


@pytest.mark.parametrize(
    "value",
    [
        "",
        "https://example.com/a.png",
        "data:image/png,notbase64",
        base64.b64encode(PNG_BYTES).decode(),
    ],
)
def test_data_url_모양이_아니면_막는다(value: str) -> None:
    with pytest.raises(ApiError) as caught:
        decode_data_url(value)

    assert caught.value.status_code == 422


@pytest.mark.parametrize(
    "header",
    [
        # 이름이 어긋난 것. 실기기 쪽에서 흔하다.
        "image/jpg",
        # 매개변수가 끼어든 것.
        "image/png;charset=utf-8",
        # 아예 형식을 안 적은 것.
        "",
        # 실제 바이트와 다른 형식을 적은 것.
        "image/webp",
    ],
)
def test_헤더가_뭐라_하든_실제_바이트로_형식을_정한다(header: str) -> None:
    """기기가 붙여 주는 mime 은 믿지 않는다.

    바이트가 멀쩡한 PNG 인데 헤더 한 줄 때문에 거절하면, 사용자에게는 그냥 안 되는 기능이다.
    반대로 헤더를 믿으면 우리가 모델에 잘못된 형식을 알려 주게 된다. 바이트가 정본이다.
    """
    image = decode_data_url(f"data:{header};base64,{base64.b64encode(PNG_BYTES).decode()}")

    assert image.media_type == "image/png"
    assert image.data == PNG_BYTES


@pytest.mark.parametrize("media_type", ["image/gif", "image/svg+xml", "application/pdf"])
def test_이미지가_아닌_바이트는_형식을_뭐라_적든_막는다(media_type: str) -> None:
    # PNG 라고 적어도 통과하지 못한다. 통과 여부는 오직 바이트가 정한다.
    for header in (media_type, "image/png"):
        with pytest.raises(ApiError) as caught:
            decode_data_url(_data_url(header, b"GIF89a" + b"\x00" * 32))

        assert caught.value.status_code == 422


def test_줄바꿈이_섞인_base64_도_푼다() -> None:
    """base64 를 76자마다 끊거나 끝에 줄바꿈을 붙여 보내는 기기가 있다."""
    encoded = base64.b64encode(PNG_BYTES).decode()
    wrapped = "\n".join(encoded[i : i + 40] for i in range(0, len(encoded), 40)) + "\n"

    image = decode_data_url(f"data:image/png;base64,{wrapped}")

    assert image.data == PNG_BYTES


def test_base64_가_깨졌으면_막는다() -> None:
    with pytest.raises(ApiError) as caught:
        decode_data_url("data:image/png;base64,%%%not-base64%%%")

    assert caught.value.status_code == 422


def test_빈_이미지는_막는다() -> None:
    with pytest.raises(ApiError) as caught:
        decode_data_url("data:image/png;base64,")

    assert caught.value.status_code == 422


def test_상한을_넘는_이미지는_막는다() -> None:
    oversized = PNG_BYTES + b"\x00" * MAX_IMAGE_BYTES

    with pytest.raises(ApiError) as caught:
        decode_data_url(_data_url("image/png", oversized))

    assert caught.value.status_code == 422


def test_상한_바로_아래는_통과한다() -> None:
    padded = PNG_BYTES + b"\x00" * (MAX_IMAGE_BYTES - len(PNG_BYTES))

    image = decode_data_url(_data_url("image/png", padded))

    assert len(image.data) == MAX_IMAGE_BYTES


def test_실패해도_입력_조각이_새지_않는다(caplog: pytest.LogCaptureFixture) -> None:
    # 형식은 맞고 매직바이트만 틀린 값이라, 함수가 payload 를 실제로 디코드한 뒤에 막는다.
    value = _data_url("image/png", MARKER.encode() * 4)

    with caplog.at_level(logging.DEBUG), pytest.raises(ApiError) as caught:
        decode_data_url(value)

    error = caught.value
    trace = "".join(traceback.format_exception(error))
    payload = value.split(",", 1)[1]
    for leaked in (MARKER, payload, payload[8:40]):
        assert leaked not in error.message
        assert leaked not in str(error)
        assert leaked not in caplog.text
        assert leaked not in trace


def test_실패_문구는_이유를_나누지_않는다() -> None:
    """어디서 걸렸는지 알려 주면 그 메시지가 곧 입력에 대한 정보가 된다."""
    messages = set()
    for value in (
        "그냥 문자열",
        _data_url("image/gif", b"GIF89a" + b"\x00" * 32),
        _data_url("image/png", MARKER.encode() * 4),
        "data:image/png;base64,%%%",
    ):
        with pytest.raises(ApiError) as caught:
            decode_data_url(value)
        messages.add(caught.value.message)

    assert messages == {"사진을 읽지 못했어요."}
