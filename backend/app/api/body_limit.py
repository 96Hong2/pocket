"""본문 크기를 인증보다 **먼저** 막는다.

FastAPI 는 의존성을 풀기 전에 본문을 통째로 메모리에 올린다. 그래서 익명키가 없어도,
스키마 상한(`MAX_IMAGE_DATA_URL_LENGTH`)을 한참 넘겨도, 그 바이트는 이미 다 들어와 있다.
실제로 재 봤다: 헤더 없이 보낸 20MB 요청이 DB 세션을 여는 자리까지 갔다.
JSON 은 풀면서 몇십 배로 부푼다. `[{},{},…]` 12MB 한 개가 약 300MB 를 잡았다.

그래서 라우팅보다 바깥에 세운다. `Content-Length` 를 보고 먼저 끊고, 길이를 안 적고 오는
요청(chunked)은 읽으면서 센다. 상한은 길마다 다르다. 사진을 받는 세 길만 12MB 이고
나머지는 1MB 다. 1MB 밖 본문은 우리 화면이 만들 수 없다(가장 큰 것이 분류 사진 아이콘 약 26만 자).

사진 세 길은 `PhotoBodyGate` 가 한 번 더 지킨다. 익명키 헤더가 없으면 읽기 전에 401 이고,
큰 본문을 동시에 읽는 수를 인스턴스마다 묶는다.
"""

from __future__ import annotations

import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

__all__ = [
    "DEFAULT_MAX_BODY_BYTES",
    "MAX_BODY_BYTES",
    "MAX_LARGE_BODIES",
    "PHOTO_PATHS",
    "BodySizeLimitMiddleware",
    "PhotoBodyGate",
]

# 사진 길이 받는 본문 최대 바이트. 가장 큰 요청이 캡처(데이터 URL 6,000,000자 상한)라
# 넉넉히 두 배쯤 잡는다. 여기 걸리는 요청은 우리 화면이 만들 수 없는 요청이다.
MAX_BODY_BYTES = 12_000_000

# 그 밖의 길. 가장 큰 본문이 분류 사진 아이콘(262,144자)이고 자산 목록 PUT 도 수십 KB 다.
DEFAULT_MAX_BODY_BYTES = 1_000_000

# 사진을 받는 길. 이 셋만 큰 본문을 받는다.
PHOTO_PATHS = frozenset(
    {"/api/v1/imports/capture", "/api/v1/imports/receipt", "/api/v1/assets/capture"}
)

# 큰 본문(1MB 초과 또는 길이를 안 적은 것)을 동시에 받는 수. 인스턴스 하나 기준이다.
# 요청 하나가 본문과 푼 문자열, 디코드한 바이트로 50MB 안팎을 쥔다. 여섯이면 300MB 라
# 512Mi 안에 들어간다. 사람이 사진 읽기를 한 인스턴스에서 여섯 개 겹쳐 보낼 일은 드물다.
MAX_LARGE_BODIES = 6


def _error(code: str, message: str) -> bytes:
    return json.dumps({"error": {"code": code, "message": message}}).encode("utf-8")


_TOO_LARGE = _error("INVALID_REQUEST", "보낸 내용이 너무 커요.")
# 인증 의존성이 내는 401 과 같은 문구다. 화면은 차이를 모른다.
_NO_KEY = _error("UNAUTHORIZED", "사용자 정보를 확인하지 못했어요.")
# 모델이 못 읽었을 때와 같은 code 와 문구다. 화면은 그때처럼 「잠시 뒤 다시」 를 보여 준다.
_BUSY = {
    path: _error(
        "PARSE_UNAVAILABLE", f"지금은 {subject} 읽지 못했어요. 잠시 뒤 다시 시도해 주세요."
    )
    for path, subject in (
        ("/api/v1/imports/capture", "캡처를"),
        ("/api/v1/imports/receipt", "영수증을"),
        ("/api/v1/assets/capture", "캡처를"),
    )
}


def _is_photo(scope: Scope) -> bool:
    return scope.get("method") == "POST" and scope.get("path") in PHOTO_PATHS


def _header(scope: Scope, name: bytes) -> bytes | None:
    for key, value in scope.get("headers", ()):
        if key == name:
            return bytes(value)
    return None


def _declared_length(scope: Scope) -> int | None:
    """적어 보낸 본문 길이. 안 적었거나 숫자가 아니면 None."""
    value = _header(scope, b"content-length")
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        # 숫자가 아니면 서버가 알아서 막는다. 여기서 단정하지 않는다.
        return None


async def _respond(send: Send, status: int, body: bytes) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


class _BodyTooLarge(Exception):
    """상한을 넘긴 본문. 이 미들웨어 안에서만 산다."""


class BodySizeLimitMiddleware:
    """ASGI 그대로 쓴다. BaseHTTPMiddleware 는 본문을 한 번 더 들고 있어서 목적에 어긋난다."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        max_bytes: int = MAX_BODY_BYTES,
        default_bytes: int = DEFAULT_MAX_BODY_BYTES,
    ) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.default_bytes = default_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limit = self.max_bytes if _is_photo(scope) else self.default_bytes
        declared = _declared_length(scope)
        if declared is not None and declared > limit:
            await _respond(send, 413, _TOO_LARGE)
            return

        read = 0
        started = False

        async def counting_receive() -> Message:
            nonlocal read
            message = await receive()
            if message["type"] == "http.request":
                read += len(message.get("body", b""))
                if read > limit:
                    raise _BodyTooLarge
            return message

        async def watching_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, counting_receive, watching_send)
        except _BodyTooLarge:
            # 답을 이미 보내기 시작했으면 덧붙일 수 없다. 그 전에만 413 을 낸다.
            if not started:
                await _respond(send, 413, _TOO_LARGE)


class PhotoBodyGate:
    """사진 세 길에서 본문을 읽기 전에 한 번 더 거른다. CORS 안쪽에 둬서 답에 CORS 헤더가 붙는다.

    - 익명키 헤더가 없으면 읽지 않고 401. 어차피 인증에서 같은 401 이 난다.
    - 큰 본문은 동시에 `MAX_LARGE_BODIES` 개까지만 받는다. 자리가 없으면 읽지 않고 503.
      자리는 답을 다 보낼 때까지 쥔다. 본문과 푼 사진이 그동안 메모리에 남아 있어서다.

    세는 값은 이벤트 루프 하나 안에서만 바뀐다. uvicorn 워커 하나가 루프 하나라 잠금이 없어도 된다.
    """

    def __init__(self, app: ASGIApp, *, max_large: int = MAX_LARGE_BODIES) -> None:
        self.app = app
        self.max_large = max_large
        self.active = 0

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not _is_photo(scope):
            await self.app(scope, receive, send)
            return

        if not _header(scope, b"x-anon-key"):
            await _respond(send, 401, _NO_KEY)
            return

        declared = _declared_length(scope)
        if declared is not None and declared <= DEFAULT_MAX_BODY_BYTES:
            await self.app(scope, receive, send)
            return

        if self.active >= self.max_large:
            await _respond(send, 503, _BUSY[scope["path"]])
            return
        self.active += 1
        try:
            await self.app(scope, receive, send)
        finally:
            self.active -= 1
