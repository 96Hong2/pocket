"""본문 크기를 인증보다 **먼저** 막는다.

FastAPI 는 의존성을 풀기 전에 본문을 통째로 메모리에 올린다. 그래서 익명키가 없어도,
스키마 상한(`MAX_IMAGE_DATA_URL_LENGTH`)을 한참 넘겨도, 그 바이트는 이미 다 들어와 있다.
실제로 재 봤다: 헤더 없이 보낸 20MB 요청이 DB 세션을 여는 자리까지 갔다.
JSON 은 풀면서 몇십 배로 부푼다. `[{},{},…]` 12MB 한 개가 약 300MB 를 잡았다.

그래서 라우팅보다 바깥에 세운다. `Content-Length` 를 보고 먼저 끊고, 길이를 안 적고 오는
요청(chunked)은 읽으면서 센다. 상한은 길마다 다르다. 사진을 받는 세 길만 12MB 이고
나머지는 1MB 다. 1MB 밖 본문은 우리 화면이 만들 수 없다(가장 큰 것이 분류 사진 아이콘 약 26만 자).

사진 세 길은 `PhotoBodyGate` 가 한 번 더 지킨다. 익명키 헤더가 없으면 읽기 전에 401 이고,
1MB 넘게 받고 있는 본문 수를 곳마다, 인스턴스마다 묶고, 받는 시간에 마감을 둔다.
"""

from __future__ import annotations

import asyncio
import json
import time
from collections import deque
from collections.abc import Callable

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.api.client_key import client_key

__all__ = [
    "BODY_RECEIVE_DEADLINE_SECONDS",
    "DEFAULT_MAX_BODY_BYTES",
    "MAX_BODY_BYTES",
    "MAX_LARGE_BODIES",
    "MAX_LARGE_BODIES_PER_CLIENT",
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

# 1MB 넘게 받고 있는 본문을 동시에 받는 수. 인스턴스 하나 기준이다. 자리는 **받는 동안만**
# 쥔다. 모델을 부르는 동안에는 쥐지 않아서 사람이 몰려도 자리가 오래 막히지 않는다.
# 받는 중인 본문은 많아야 12MB 이고, 다 받아 합치는 순간 두 배다. 16개면 약 400MB 다.
MAX_LARGE_BODIES = 16

# 한 곳(`client_key`, IPv6 는 /64)이 쥘 수 있는 자리. 화면은 사진 여러 장을 요청 하나로 보낸다.
MAX_LARGE_BODIES_PER_CLIENT = 2

# 문에 들어온 때부터 본문을 다 받을 때까지의 마감. 자리가 날 때까지 기다리는 시간도 여기 든다.
# 화면이 사진 요청을 포기하는 시간(사진 다섯 장이면 30초 + 4 × 10초, frontend client.ts
# `imageTimeout`)과 같다. 이 마감에 걸리는 요청은 화면이 이미 「응답이 늦어요」 로 접은 요청이다.
BODY_RECEIVE_DEADLINE_SECONDS = 70.0


def _error(code: str, message: str) -> bytes:
    return json.dumps({"error": {"code": code, "message": message}}).encode("utf-8")


_TOO_LARGE = _error("INVALID_REQUEST", "보낸 내용이 너무 커요.")
# 인증 의존성이 내는 401 과 같은 문구다. 화면은 차이를 모른다.
_NO_KEY = _error("UNAUTHORIZED", "사용자 정보를 확인하지 못했어요.")
_TOO_SLOW = _error("INVALID_REQUEST", "보내는 데 너무 오래 걸렸어요. 잠시 뒤 다시 시도해 주세요.")


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


class _ReceiveTimeout(Exception):
    """본문을 마감 안에 다 받지 못했다. 이 문 안에서만 산다."""


class PhotoBodyGate:
    """사진 세 길에서 본문을 받는 동안 한 번 더 거른다. CORS 안쪽에 둬서 답에 CORS 헤더가 붙는다.

    - 익명키 헤더가 없으면 읽지 않고 401. 어차피 인증에서 같은 401 이 난다.
    - 실제로 1MB 넘게 받은 본문만 자리를 잡는다. 길이를 안 적었다는 것만으로는 잡지 않는다.
      자리는 한 곳에 `per_client` 개, 인스턴스에 `max_large` 개다. 자리가 없으면 거절하지 않고
      받기를 잠깐 멈춰 기다린다. 다 받으면 바로 돌려준다.
    - 문에 들어온 뒤 `deadline_seconds` 안에 다 못 받으면 앱에 넘기지 않고 408 로 끊는다.
      본문을 몇 바이트씩 흘려 자리를 쥐고 버티는 요청을 끝내려는 것이다.

    세는 값은 이벤트 루프 하나 안에서만 바뀐다. uvicorn 워커 하나가 루프 하나라 잠금이 없어도 된다.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        max_large: int = MAX_LARGE_BODIES,
        per_client: int = MAX_LARGE_BODIES_PER_CLIENT,
        deadline_seconds: float = BODY_RECEIVE_DEADLINE_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.app = app
        self.max_large = max_large
        self.per_client = per_client
        self.deadline_seconds = deadline_seconds
        self._clock = clock
        self._held: dict[str, int] = {}
        self._waiters: deque[tuple[str, asyncio.Future[None]]] = deque()

    @property
    def active(self) -> int:
        return sum(self._held.values())

    def held(self, client: str) -> int:
        return self._held.get(client, 0)

    def _free(self, client: str) -> bool:
        return self.active < self.max_large and self.held(client) < self.per_client

    def _take(self, client: str) -> None:
        self._held[client] = self.held(client) + 1

    def _give_back(self, client: str) -> None:
        left = self.held(client) - 1
        if left > 0:
            self._held[client] = left
        else:
            self._held.pop(client, None)
        # 줄 선 차례대로, 지금 받을 수 있는 요청에 자리를 넘긴다. 넘길 때 바로 세어 둔다.
        for entry in list(self._waiters):
            waiter, future = entry
            if future.done():
                self._waiters.remove(entry)
            elif self._free(waiter):
                self._take(waiter)
                self._waiters.remove(entry)
                future.set_result(None)

    async def _acquire(self, client: str) -> None:
        if self._free(client):
            self._take(client)
            return
        future: asyncio.Future[None] = asyncio.get_running_loop().create_future()
        entry = (client, future)
        self._waiters.append(entry)
        try:
            await future
        except BaseException:
            if entry in self._waiters:
                self._waiters.remove(entry)
            # 자리를 넘겨받은 직후에 끊긴 것이다. 쥔 채로 사라지지 않게 돌려준다.
            if future.done() and not future.cancelled():
                self._give_back(client)
            raise

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not _is_photo(scope):
            await self.app(scope, receive, send)
            return

        if not _header(scope, b"x-anon-key"):
            await _respond(send, 401, _NO_KEY)
            return

        peer = scope.get("client")
        forwarded = [
            bytes(value).decode("latin-1")
            for key, value in scope.get("headers", ())
            if key == b"x-forwarded-for"
        ]
        client = str(client_key(forwarded, peer[0] if peer else None) or "")
        deadline = self._clock() + self.deadline_seconds
        received = 0
        holding = False
        finished = False
        timed_out = False
        started = False

        def release() -> None:
            nonlocal holding
            if holding:
                holding = False
                self._give_back(client)

        async def guarded_receive() -> Message:
            nonlocal received, holding, finished, timed_out
            if finished:
                return await receive()
            try:
                async with asyncio.timeout(max(0.0, deadline - self._clock())):
                    message = await receive()
                    if message["type"] != "http.request":
                        finished = True
                        release()
                        return message
                    received += len(message.get("body", b""))
                    if not message.get("more_body", False):
                        finished = True
                        release()
                    elif not holding and received > DEFAULT_MAX_BODY_BYTES:
                        await self._acquire(client)
                        holding = True
                    return message
            except TimeoutError:
                # FastAPI 는 본문을 읽다 난 예외를 400 으로 바꿔 답한다. 그 답은 아래에서 버린다.
                timed_out = True
                release()
                raise _ReceiveTimeout from None

        async def guarded_send(message: Message) -> None:
            nonlocal started
            # 마감에 걸린 뒤 앱이 내는 답(본문 읽기 실패 400 등)은 버리고 408 하나만 보낸다.
            if timed_out and not started:
                return
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, guarded_receive, guarded_send)
        except _ReceiveTimeout:
            pass
        finally:
            release()
        if timed_out and not started:
            await _respond(send, 408, _TOO_SLOW)
