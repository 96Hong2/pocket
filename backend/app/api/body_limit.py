"""본문 크기를 인증보다 **먼저** 막는다.

FastAPI 는 의존성을 풀기 전에 본문을 통째로 메모리에 올린다. 그래서 익명키가 없어도,
스키마 상한(`MAX_IMAGE_DATA_URL_LENGTH`)을 한참 넘겨도, 그 바이트는 이미 다 들어와 있다.
실제로 재 봤다: 헤더 없이 보낸 20MB 요청이 DB 세션을 여는 자리까지 갔다.
JSON 은 풀면서 몇십 배로 부푼다. `[{},{},…]` 12MB 한 개가 약 300MB 를 잡았다.

그래서 라우팅보다 바깥에 세운다. `Content-Length` 를 보고 먼저 끊고, 길이를 안 적고 오는
요청(chunked)은 읽으면서 센다. 상한은 길마다 다르다. 사진을 받는 세 길만 12MB 이고
나머지는 1MB 다. 1MB 밖 본문은 우리 화면이 만들 수 없다(가장 큰 것이 분류 사진 아이콘 약 26만 자).

사진 세 길은 `PhotoBodyGate` 가 한 번 더 지킨다. 본문을 읽기 전에 익명키를 확인하고,
같은 키로 동시에 받는 본문 수와 받는 시간을 묶는다.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import time
from collections.abc import Callable
from dataclasses import dataclass, field

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.api.client_key import client_key
from app.api.errors import anon_key_failure
from app.integrations.apps_in_toss.anon_key import AnonKeyVerifier

__all__ = [
    "BODY_RECEIVE_DEADLINE_SECONDS",
    "DEFAULT_MAX_BODY_BYTES",
    "MAX_BODY_BYTES",
    "PER_KEY_PHOTO_READS",
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

# 문에 들어온 때부터 본문을 다 받을 때까지의 마감.
# 화면이 사진 요청을 포기하는 시간(사진 다섯 장이면 30초 + 4 × 10초, frontend client.ts
# `imageTimeout`)과 같다. 이 마감에 걸리는 요청은 화면이 이미 「응답이 늦어요」 로 접은 요청이다.
BODY_RECEIVE_DEADLINE_SECONDS = 70.0

# 확인된 익명키 하나로 동시에 받는 사진 본문 수. 화면은 사진 요청을 하나씩 보낸다.
# 세 번째부터는 앞의 본문을 다 받을 때까지 기다린다(마감 안에서). 키마다 따로라 남을 막지 못한다.
PER_KEY_PHOTO_READS = 2


def _json(content: object) -> bytes:
    # JSONResponse 와 같은 모양으로 담는다. 화면은 차이를 모른다.
    return json.dumps(content, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def _error(code: str, message: str) -> bytes:
    return _json({"error": {"code": code, "message": message}})


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


def _headers(scope: Scope, name: bytes) -> list[str]:
    headers = scope.get("headers", ())
    return [bytes(value).decode("latin-1") for key, value in headers if key == name]


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
    """ASGI 그대로 쓴다. BaseHTTPMiddleware 는 본문을 한 번 더 들고 있어서 목적에 어긋난다.

    CORS 안쪽에 둔다(app/main.py). 그래야 413 에도 CORS 헤더가 붙어 WebView 가 문구를 읽는다.
    CORS 는 본문을 읽지 않으므로 바깥에 있어도 크기 검사가 늦어지지 않는다.
    """

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
        too_large = False
        started = False

        async def counting_receive() -> Message:
            nonlocal read, too_large
            message = await receive()
            if message["type"] == "http.request":
                read += len(message.get("body", b""))
                if read > limit:
                    too_large = True
                    raise _BodyTooLarge
            return message

        async def watching_send(message: Message) -> None:
            nonlocal started
            # FastAPI 는 본문을 읽다 난 예외를 400 으로 바꿔 답한다. 그 답은 버리고 413 을 보낸다.
            if too_large and not started:
                return
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        with contextlib.suppress(_BodyTooLarge):
            await self.app(scope, counting_receive, watching_send)
        # 답을 이미 보내기 시작했으면 덧붙일 수 없다. 그 전에만 413 을 낸다.
        if too_large and not started:
            await _respond(send, 413, _TOO_LARGE)


class _ReceiveTimeout(Exception):
    """본문을 마감 안에 다 받지 못했다. 이 문 안에서만 산다."""


@dataclass(slots=True)
class _Slot:
    gate: asyncio.Semaphore
    users: int = field(default=0)


class _KeySlots:
    """키마다 `size` 자리. 아무도 쓰지 않는 키는 지워 메모리를 키우지 않는다."""

    def __init__(self, size: int) -> None:
        self._size = size
        self._slots: dict[str, _Slot] = {}

    async def acquire(self, key: str) -> None:
        """자리가 날 때까지 기다린다. 마감은 부르는 쪽이 `asyncio.timeout` 으로 건다."""
        slot = self._slots.get(key)
        if slot is None:
            slot = self._slots[key] = _Slot(asyncio.Semaphore(self._size))
        slot.users += 1
        try:
            await slot.gate.acquire()
        except BaseException:
            self._leave(key, slot)
            raise

    def release(self, key: str) -> None:
        slot = self._slots[key]
        slot.gate.release()
        self._leave(key, slot)

    def _leave(self, key: str, slot: _Slot) -> None:
        slot.users -= 1
        if slot.users == 0:
            del self._slots[key]


def _app_verifier() -> AnonKeyVerifier:
    """인증 의존성과 같은 검증기. 같은 인스턴스라 10분 캐시와 곳마다 세기를 함께 쓴다."""
    from app.api.deps import get_verifier
    from app.core.config import get_settings

    return get_verifier(get_settings())


class PhotoBodyGate:
    """사진 세 길에서 본문을 읽기 **전에** 익명키를 확인하고, 받는 동안 한 번 더 거른다.

    CORS 안쪽에 둬서 이 문이 내는 답에도 CORS 헤더가 붙는다.

    - 익명키 헤더가 없으면 읽지 않고 401.
    - 키는 인증 의존성과 같은 검증기로 확인한다. 틀린 키는 401, 곳마다 상한을 넘으면 429,
      토스가 잠깐 안 되면 503 이다. 인증 단계와 같은 코드와 문구라 화면은 차이를 모른다.
      확인된 키는 검증기가 10분 기억해서, 뒤따르는 인증 의존성은 토스에 다시 묻지 않는다.
      아무 글자나 키로 넣은 12MB JSON 이 풀리며 수백 MB 를 잡던 길이 여기서 닫힌다.
    - 확인된 키 하나로 동시에 받는 본문은 `per_key_reads` 개까지다. 넘치면 앞의 본문을 다 받을
      때까지 기다린다. 자리는 본문을 다 받는 순간 돌려준다(모델을 부르는 동안은 쥐지 않는다).
    - 문에 들어온 뒤 `deadline_seconds` 안에 자리를 못 얻거나 본문을 다 못 받으면 앱에 넘기지
      않고 408 로 끊는다. 본문을 몇 바이트씩 흘려 연결과 메모리를 쥐고 버티는 요청을 끝낸다.

    **여기서 묶지 않는 것:** 서로 다른 진짜 키들이 함께 보내는 큰 본문 수와, 본문을 다 받은 뒤
    JSON 을 풀고 사진을 디코드하는 메모리. 인스턴스마다 받는 동시 요청 수(Cloud Run concurrency)와
    메모리가 그 몫이다. 지금 값과 검토안은 docs/DEPLOY.md 「사진 본문과 메모리」 에 있다.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        verifier: Callable[[], AnonKeyVerifier] = _app_verifier,
        per_key_reads: int = PER_KEY_PHOTO_READS,
        deadline_seconds: float = BODY_RECEIVE_DEADLINE_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.app = app
        self._verifier = verifier
        self._slots = _KeySlots(per_key_reads)
        self.deadline_seconds = deadline_seconds
        self._clock = clock

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not _is_photo(scope):
            await self.app(scope, receive, send)
            return

        deadline = self._clock() + self.deadline_seconds
        raw_key = _header(scope, b"x-anon-key")
        if not raw_key:
            await _respond(send, 401, _NO_KEY)
            return

        # 인증 의존성이 받는 값과 같게 푼다(Starlette 는 헤더를 latin-1 로 읽는다).
        anon_key = raw_key.decode("latin-1")
        peer = scope.get("client")
        where = client_key(_headers(scope, b"x-forwarded-for"), peer[0] if peer else None)
        try:
            await self._verifier().verify(anon_key, client=where)
        except Exception as error:
            failure = anon_key_failure(error)
            if failure is None:
                raise
            status, body = failure
            await _respond(send, status, _json(body))
            return

        slot = hashlib.sha256(raw_key).hexdigest()
        try:
            async with asyncio.timeout(max(0.0, deadline - self._clock())):
                await self._slots.acquire(slot)
        except TimeoutError:
            await _respond(send, 408, _TOO_SLOW)
            return
        holding = True

        def give_back() -> None:
            nonlocal holding
            if holding:
                holding = False
                self._slots.release(slot)

        finished = False
        timed_out = False
        started = False

        async def guarded_receive() -> Message:
            nonlocal finished, timed_out
            if finished:
                return await receive()
            try:
                async with asyncio.timeout(max(0.0, deadline - self._clock())):
                    message = await receive()
            except TimeoutError:
                # FastAPI 는 본문을 읽다 난 예외를 400 으로 바꿔 답한다. 그 답은 아래에서 버린다.
                timed_out = True
                raise _ReceiveTimeout from None
            if message["type"] != "http.request" or not message.get("more_body", False):
                finished = True
                give_back()
            return message

        async def guarded_send(message: Message) -> None:
            nonlocal started
            # 마감에 걸린 뒤 앱이 내는 답(본문 읽기 실패 400 등)은 버리고 408 하나만 보낸다.
            if timed_out and not started:
                return
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            with contextlib.suppress(_ReceiveTimeout):
                await self.app(scope, guarded_receive, guarded_send)
        finally:
            give_back()
        if timed_out and not started:
            await _respond(send, 408, _TOO_SLOW)
