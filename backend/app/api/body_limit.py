"""본문 크기를 인증보다 **먼저** 막는다.

FastAPI 는 의존성을 풀기 전에 본문을 통째로 메모리에 올린다. 그래서 익명키가 없어도,
스키마 상한(`MAX_IMAGE_DATA_URL_LENGTH`)을 한참 넘겨도, 그 바이트는 이미 다 들어와 있다.
실제로 재 봤다: 헤더 없이 보낸 20MB 요청이 DB 세션을 여는 자리까지 갔다.

운영 컨테이너가 512Mi 이고 인스턴스 하나가 요청 80개를 함께 받는다. 큰 본문 스무 개면
메모리가 끝난다. 인증도 필요 없어 아무나 할 수 있다.

그래서 라우팅보다 바깥에 세운다. `Content-Length` 를 보고 먼저 끊고, 길이를 안 적고 오는
요청(chunked)은 읽으면서 센다. 상한은 실제로 쓰는 값(사진 데이터 URL 약 4.5MB)의 두 배쯤이라
쓰는 사람은 이 문을 볼 일이 없다.
"""

from __future__ import annotations

import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

__all__ = ["MAX_BODY_BYTES", "BodySizeLimitMiddleware"]

# 받아 주는 본문 최대 바이트. 가장 큰 요청이 캡처 한 장(데이터 URL 6,000,000자 상한)이라
# 넉넉히 두 배쯤 잡는다. 여기 걸리는 요청은 우리 화면이 만들 수 없는 요청이다.
MAX_BODY_BYTES = 12_000_000

_TOO_LARGE = json.dumps(
    {"error": {"code": "INVALID_REQUEST", "message": "보낸 내용이 너무 커요."}}
).encode("utf-8")


class _BodyTooLarge(Exception):
    """상한을 넘긴 본문. 이 미들웨어 안에서만 산다."""


class BodySizeLimitMiddleware:
    """ASGI 그대로 쓴다. BaseHTTPMiddleware 는 본문을 한 번 더 들고 있어서 목적에 어긋난다."""

    def __init__(self, app: ASGIApp, *, max_bytes: int = MAX_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        if self._declared_too_large(scope):
            await self._reject(send)
            return

        read = 0
        started = False

        async def counting_receive() -> Message:
            nonlocal read
            message = await receive()
            if message["type"] == "http.request":
                read += len(message.get("body", b""))
                if read > self.max_bytes:
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
                await self._reject(send)

    def _declared_too_large(self, scope: Scope) -> bool:
        for name, value in scope.get("headers", ()):
            if name == b"content-length":
                try:
                    return int(value) > self.max_bytes
                except ValueError:
                    # 숫자가 아니면 서버가 알아서 막는다. 여기서 단정하지 않는다.
                    return False
        return False

    async def _reject(self, send: Send) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(_TOO_LARGE)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": _TOO_LARGE})
