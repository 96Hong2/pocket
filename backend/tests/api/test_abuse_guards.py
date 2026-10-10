"""남용을 막는 문 셋.

셋 다 **정상적으로 쓰는 사람은 볼 일이 없는 자리**다. 여기서 지키는 것은 문이 실제로
닫혀 있다는 것과, 문을 세우느라 정상 경로를 막지 않았다는 것 둘이다.
"""

from __future__ import annotations

import asyncio
import base64
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.api import deps
from app.api.body_limit import DEFAULT_MAX_BODY_BYTES, MAX_BODY_BYTES, PhotoBodyGate
from app.api.deps import _verifier_for
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.domain.category_icons import CUSTOM_ICON_MAX_LENGTH
from app.integrations.apps_in_toss.anon_key import (
    AnonKeyRejected,
    AnonKeyVerificationUnavailable,
    CachingAnonKeyVerifier,
    VerifiedIdentity,
)
from app.main import create_app
from app.models import ParseUsage, User
from app.modules.imports.schemas import MAX_IMAGE_DATA_URL_LENGTH

AUTH = {"X-Anon-Key": "test-anon-key"}

PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
IMAGE = f"data:image/png;base64,{base64.b64encode(PNG_BYTES).decode()}"


# ── 본문 크기 ────────────────────────────────────────────
#
# FastAPI 는 의존성을 풀기 전에 본문을 통째로 메모리에 올린다. 익명키가 없어도 그 바이트는
# 이미 다 들어와 있다. 운영 컨테이너가 512Mi 라 큰 본문 스무 개면 메모리가 끝난다.


def test_너무_큰_본문은_인증_전에_끊긴다(unauthenticated_client: TestClient) -> None:
    big = "data:image/png;base64," + "A" * (MAX_BODY_BYTES + 1_000)
    response = unauthenticated_client.post("/api/v1/imports/capture", json={"image": big})
    # 401 이 아니라 413 이다. 인증을 보기도 전에 끊었다는 뜻이다.
    assert response.status_code == 413
    assert response.json()["error"]["message"] == "보낸 내용이 너무 커요."


def test_보통_크기는_평소대로_인증부터_본다(unauthenticated_client: TestClient) -> None:
    """문을 세우느라 정상 경로를 막지 않았는지 본다."""
    response = unauthenticated_client.post("/api/v1/imports/capture", json={"image": IMAGE})
    assert response.status_code == 401


def test_사진_한_장은_상한_안에_넉넉히_들어온다(client: TestClient, default_categories) -> None:
    del default_categories
    response = client.post("/api/v1/imports/capture", json={"image": IMAGE}, headers=AUTH)
    assert response.status_code == 201, response.text


def test_스키마_상한을_넘긴_사진은_이유를_말해_준다(client: TestClient, default_categories) -> None:
    """본문 문은 통과하지만 사진이 큰 경우. 뭉뚱그린 형식 오류로 끝나면 다음에 할 일을 모른다."""
    del default_categories
    big = "data:image/png;base64," + "A" * (MAX_IMAGE_DATA_URL_LENGTH + 10)
    response = client.post("/api/v1/imports/capture", json={"image": big}, headers=AUTH)
    assert response.status_code == 422
    assert "사진이 너무 커요" in response.json()["error"]["message"]


# ── 몰아치기 ─────────────────────────────────────────────
#
# 하루 상한(300)만으로는 몇 초 만에 하루치를 다 태우는 것을 못 막는다.
# 그 한 번이 모델 비용이고 토스 API 한도다.


def test_1분_안에_몰아서_부르면_잠시_멈춘다(
    client: TestClient, db: Session, default_categories, monkeypatch: pytest.MonkeyPatch
) -> None:
    del default_categories
    monkeypatch.setenv("NL_PARSE_BURST_LIMIT", "3")
    get_settings.cache_clear()

    for _ in range(3):
        ok = client.post("/api/v1/imports/text", json={"text": "커피 4500"}, headers=AUTH)
        assert ok.status_code == 201, ok.text

    blocked = client.post("/api/v1/imports/text", json={"text": "커피 4500"}, headers=AUTH)
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "USAGE_LIMIT"
    # 막혀도 키패드 기록은 그대로 돌아간다. 이게 막히면 앱을 쓸 수 없게 된다.
    saved = client.post(
        "/api/v1/transactions",
        json={"occurred_at": "2026-09-13T12:00:00+09:00", "amount": "4500", "type": "expense"},
        headers=AUTH,
    )
    assert saved.status_code == 201, saved.text

    get_settings.cache_clear()


def test_창이_지나면_다시_부를_수_있다(
    client: TestClient, db: Session, default_categories, monkeypatch: pytest.MonkeyPatch
) -> None:
    """세는 창이 1분이라는 것을 시간을 기다리지 않고 확인한다."""
    del default_categories
    monkeypatch.setenv("NL_PARSE_BURST_LIMIT", "2")
    get_settings.cache_clear()

    for _ in range(2):
        assert _analyze(client).status_code == 201
    assert _analyze(client).status_code == 429

    # 앞서 센 것들을 창 밖으로 밀어낸다.
    user = db.query(User).one()
    for row in db.query(ParseUsage).filter(ParseUsage.user_id == user.id):
        row.created_at = row.created_at.replace(year=row.created_at.year - 1)
    db.commit()

    assert _analyze(client).status_code == 201

    get_settings.cache_clear()


def _analyze(client: TestClient):
    return client.post("/api/v1/imports/text", json={"text": "커피 4500"}, headers=AUTH)


# ── 대화형 문서 ──────────────────────────────────────────


@pytest.mark.parametrize(
    ("environment", "open_"), [("local", True), ("dev", False), ("prod", False)]
)
def test_문서는_로컬에서만_열린다(environment: str, open_: bool) -> None:
    """스펙은 저장소에 있어 숨길 것이 아니지만, 처음 온 사람에게 목록을 쥐여 줄 자리는 아니다.

    dev 도 QR 로 여러 사람이 붙는 공용 서버라 함께 닫는다.
    """
    settings = Settings(environment=environment, allow_unverified_anon_key=(environment == "local"))
    assert settings.expose_interactive_docs is open_


def test_로컬_앱은_문서를_달고_뜬다(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "local")
    monkeypatch.setenv("ALLOW_UNVERIFIED_ANON_KEY", "true")
    get_settings.cache_clear()
    _verifier_for.cache_clear()
    app = create_app()
    assert app.docs_url == "/docs"
    assert app.openapi_url == "/openapi.json"
    get_settings.cache_clear()
    _verifier_for.cache_clear()


# ── 길마다 다른 본문 상한 ─────────────────────────────────
#
# 12MB 는 사진 세 길에만 둔다. 나머지 길에 12MB JSON 을 보내면 푸는 동안 수백 MB 를 잡는다.


def test_사진_길이_아니면_1MB_를_넘는_본문은_인증_전에_끊긴다(
    unauthenticated_client: TestClient,
) -> None:
    big = "[" + ",".join(["{}"] * 700_000) + "]"
    assert DEFAULT_MAX_BODY_BYTES < len(big) < MAX_BODY_BYTES

    response = unauthenticated_client.post(
        "/api/v1/transactions", content=big, headers={"Content-Type": "application/json"}
    )

    assert response.status_code == 413
    assert response.json()["error"]["message"] == "보낸 내용이 너무 커요."


def _chunked(total: int, piece: int = 256_000):
    """길이를 적지 않고 조각으로 보내는 본문. TestClient 가 Content-Length 를 붙이지 않는다."""
    sent = 0
    while sent < total:
        size = min(piece, total - sent)
        sent += size
        yield b"A" * size


@pytest.mark.parametrize(
    ("path", "limit"),
    [("/api/v1/transactions", DEFAULT_MAX_BODY_BYTES), ("/api/v1/imports/capture", MAX_BODY_BYTES)],
)
def test_길이를_안_적은_본문이_상한을_넘어도_413(client: TestClient, path: str, limit: int) -> None:
    """읽는 도중에 넘긴 것도 길이를 적은 요청과 같은 413 이다. FastAPI 의 400 은 나가지 않는다."""
    response = client.post(
        path,
        content=_chunked(limit + 1),
        headers={**AUTH, "Content-Type": "application/json"},
    )

    assert response.status_code == 413
    assert response.json()["error"] == {
        "code": "INVALID_REQUEST",
        "message": "보낸 내용이 너무 커요.",
    }


def test_가장_큰_사진_아이콘을_단_분류도_1MB_안에_들어간다(
    client: TestClient, default_categories
) -> None:
    """사진 아닌 길에서 가장 큰 본문이다. 상한을 바꿔도 이 요청은 413 이 아니어야 한다."""
    del default_categories
    icon = "data:image/jpeg;base64," + "A" * (CUSTOM_ICON_MAX_LENGTH - 23)
    body = {"name": "아이콘", "kind": "expense", "icon_key": "etc", "icon_custom": icon}

    response = client.post("/api/v1/categories", json=body, headers=AUTH)

    assert len(icon) == CUSTOM_ICON_MAX_LENGTH
    assert response.status_code != 413, response.text


def test_사진_길도_익명키가_없으면_본문을_읽기_전에_401(
    unauthenticated_client: TestClient,
) -> None:
    big = "data:image/png;base64," + "A" * 5_000_000
    response = unauthenticated_client.post("/api/v1/imports/receipt", json={"image": big})

    assert response.status_code == 401
    assert response.json()["error"] == {
        "code": "UNAUTHORIZED",
        "message": "사용자 정보를 확인하지 못했어요.",
    }


# ── 사진 길의 큰 본문 ───────────────────────────────────
#
# 끝나지 않는 receive 를 실제로 띄워 본다.

CAPTURE = "/api/v1/imports/capture"
SLOW = "203.0.113.9"
OTHER = "198.51.100.7"
CHUNK = b"A" * 600_000


def _scope(path: str = CAPTURE, *, forwarded: str = OTHER, key: bytes | None = b"k") -> dict:
    headers = [(b"content-type", b"application/json"), (b"x-forwarded-for", forwarded.encode())]
    if key is not None:
        headers.append((b"x-anon-key", key))
    # 길이를 적지 않는다(chunked). 길이를 보고 먼저 끊는 길을 타지 않게 한다.
    return {
        "type": "http",
        "method": "POST",
        "path": path,
        "raw_path": path.encode(),
        "root_path": "",
        "query_string": b"",
        "scheme": "https",
        "server": ("testserver", 443),
        "headers": headers,
        "client": ("169.254.1.1", 0),
    }


class _Body:
    """조각을 차례로 내주는 receive. `hold` 가 있으면 마지막 조각 앞에서 그것을 기다린다."""

    def __init__(self, chunks: list[bytes], hold: asyncio.Event | None = None) -> None:
        self._chunks = list(chunks)
        self._hold = hold
        self.calls = 0

    async def __call__(self) -> dict:
        self.calls += 1
        if len(self._chunks) == 1 and self._hold is not None:
            await self._hold.wait()
        if self._chunks:
            chunk = self._chunks.pop(0)
            return {"type": "http.request", "body": chunk, "more_body": bool(self._chunks)}
        await asyncio.Event().wait()
        raise AssertionError("닿지 않는다")


def _stalled() -> _Body:
    """1MB 를 넘게 보낸 뒤 영영 끝내지 않는 본문."""
    return _Body([CHUNK, CHUNK, CHUNK], hold=asyncio.Event())


class _App:
    """FastAPI 처럼 본문을 다 받은 뒤에야 일을 시작하는 안쪽 앱."""

    def __init__(self) -> None:
        self.reached: list[int] = []

    async def __call__(self, scope, receive, send) -> None:  # type: ignore[no-untyped-def]
        size = 0
        while True:
            message = await receive()
            size += len(message.get("body", b""))
            if not message.get("more_body", False):
                break
        self.reached.append(size)
        await send({"type": "http.response.start", "status": 201, "headers": []})
        await send({"type": "http.response.body", "body": b"{}"})


class _Verifier:
    """문이 부르는 검증기. 받은 키를 적어 두고, `fail` 이 있으면 그 예외를 낸다."""

    def __init__(self, fail: Exception | None = None) -> None:
        self.fail = fail
        self.seen: list[tuple[str, str | None]] = []

    async def verify(self, anon_key: str, *, client: str | None = None) -> VerifiedIdentity:
        self.seen.append((anon_key, client))
        if self.fail is not None:
            raise self.fail
        return VerifiedIdentity(anon_key=anon_key, verified_by="toss")


def _gate(inner, verifier: _Verifier | None = None, **kwargs) -> PhotoBodyGate:  # type: ignore[no-untyped-def]
    checker = verifier if verifier is not None else _Verifier()
    return PhotoBodyGate(inner, verifier=lambda: checker, **kwargs)


async def _call(gate: PhotoBodyGate, scope: dict, body: _Body) -> list[dict]:
    sent: list[dict] = []

    async def send(message: dict) -> None:
        sent.append(message)

    await gate(scope, body, send)  # type: ignore[arg-type]
    return sent


async def _settle() -> None:
    for _ in range(10):
        await asyncio.sleep(0)


async def test_1MB_를_넘는_사진_본문도_길이를_안_적고_받는다() -> None:
    inner = _App()
    gate = _gate(inner)

    sent = await asyncio.wait_for(_call(gate, _scope(), _Body([CHUNK, CHUNK, CHUNK])), 1)

    assert sent[0]["status"] == 201
    assert inner.reached == [3 * len(CHUNK)]


async def test_느린_본문이_많아도_다른_사진은_기다리지_않는다() -> None:
    inner = _App()
    gate = _gate(inner)
    slow = [
        asyncio.create_task(
            _call(gate, _scope(forwarded=SLOW, key=f"slow-{i}".encode()), _stalled())
        )
        for i in range(20)
    ]
    await _settle()

    sent = await asyncio.wait_for(_call(gate, _scope(), _Body([CHUNK, CHUNK, CHUNK])), 1)

    assert sent[0]["status"] == 201
    for task in slow:
        task.cancel()
    await asyncio.gather(*slow, return_exceptions=True)


class _CaptureIn(BaseModel):
    image: str


async def test_마감_안에_다_못_받으면_앱에_닿지_않고_408() -> None:
    """진짜 FastAPI 앱으로 본다. FastAPI 가 본문 읽기 실패로 내는 400 을 408 이 대신한다."""
    reached: list[str] = []
    inner = FastAPI()

    @inner.post(CAPTURE)
    def capture(body: _CaptureIn) -> dict[str, str]:
        reached.append(body.image)
        return {}

    gate = _gate(inner, deadline_seconds=0.2)
    sent = await asyncio.wait_for(_call(gate, _scope(forwarded=SLOW), _stalled()), 2)

    assert [m["type"] for m in sent] == ["http.response.start", "http.response.body"]
    assert sent[0]["status"] == 408
    assert json.loads(sent[1]["body"])["error"] == {
        "code": "INVALID_REQUEST",
        "message": "보내는 데 너무 오래 걸렸어요. 잠시 뒤 다시 시도해 주세요.",
    }
    assert reached == []


async def test_문은_사진_세_길만_거른다() -> None:
    inner = _App()
    gate = _gate(inner, deadline_seconds=0)

    sent = await _call(gate, _scope("/api/v1/imports/text", key=None), _Body([CHUNK] * 3))

    assert sent[0]["status"] == 201


async def test_사진_길에_키가_없으면_읽지_않고_401() -> None:
    inner = _App()
    gate = _gate(inner)
    body = _Body([CHUNK])

    sent = await _call(gate, _scope(key=None), body)

    assert sent[0]["status"] == 401
    assert body._chunks == [CHUNK]


# ── 사진 길은 본문을 읽기 전에 키를 확인한다 ─────────────────
#
# 아무 글자나 익명키로 넣은 12MB `[{},{},…]` 한 건이 풀리며 약 330MB 를 잡았다. 512Mi 인스턴스는
# 두 건이면 죽는다. 키를 먼저 확인하면 그 본문은 한 바이트도 읽지 않는다.


class _Toss:
    """토스 검증 API 대신. `bogus` 로 시작하는 키는 모른다고 답한다."""

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.fail: Exception | None = None

    async def verify(self, anon_key: str, *, client: str | None = None) -> VerifiedIdentity:
        del client
        self.calls.append(anon_key)
        if self.fail is not None:
            raise self.fail
        if anon_key.startswith("bogus"):
            raise AnonKeyRejected("모르는 키")
        return VerifiedIdentity(anon_key=anon_key, verified_by="toss")


@pytest.fixture
def toss() -> _Toss:
    return _Toss()


@pytest.fixture
def gated_app(monkeypatch: pytest.MonkeyPatch, engine: Engine, toss: _Toss) -> FastAPI:
    """인증 의존성과 사진 본문 문이 같은 캐시 검증기를 쓰는 진짜 앱."""
    verifier = CachingAnonKeyVerifier(toss)
    monkeypatch.setattr(deps, "_verifier_for", lambda *_: verifier)
    app = create_app()
    maker = sessionmaker(bind=engine, expire_on_commit=False)

    def override_session():  # type: ignore[no-untyped-def]
        with maker() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    return app


# 리뷰가 잰 본문과 같은 크기다. 길이 상한(12,000,000) 아래라 크기 문은 지난다.
JSON_BOMB = ("[" + ",".join(["{}"] * 3_990_000) + "]").encode()


async def _raw(app: FastAPI, key: str) -> tuple[int, dict, int]:
    """진짜 앱의 맨 바깥에 12MB 본문을 들고 들어간다. receive 를 몇 번 불렀는지 함께 센다."""
    received = 0
    sent: list[dict] = []

    async def receive() -> dict:
        nonlocal received
        received += 1
        return {"type": "http.request", "body": JSON_BOMB, "more_body": False}

    async def send(message: dict) -> None:
        sent.append(message)

    scope = {
        **_scope(key=key.encode()),
        "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(JSON_BOMB)).encode()),
            (b"x-anon-key", key.encode()),
        ],
    }
    await app(scope, receive, send)  # type: ignore[arg-type]
    return sent[0]["status"], json.loads(sent[1]["body"]), received


async def test_틀린_키의_12MB_본문은_읽지_않고_인증과_같은_401(
    gated_app: FastAPI, toss: _Toss
) -> None:
    assert len(JSON_BOMB) > 11_900_000

    status, body, received = await _raw(gated_app, "bogus-1")

    assert status == 401
    assert received == 0
    with TestClient(gated_app) as c:
        same = c.get("/api/v1/categories", headers={"X-Anon-Key": "bogus-2"})
    assert same.status_code == 401
    assert body == same.json()


async def test_토스가_안_되면_읽지_않고_인증과_같은_503(gated_app: FastAPI, toss: _Toss) -> None:
    toss.fail = AnonKeyVerificationUnavailable("토스 점검")

    status, body, received = await _raw(gated_app, "good")

    assert (status, received) == (503, 0)
    with TestClient(gated_app) as c:
        same = c.get("/api/v1/categories", headers={"X-Anon-Key": "good-2"})
    assert same.status_code == 503
    assert body == same.json()


def test_맞는_키는_평소대로_201_이고_토스에는_한_번만_묻는다(
    gated_app: FastAPI, toss: _Toss, default_categories
) -> None:
    del default_categories
    with TestClient(gated_app) as c:
        first = c.post(
            "/api/v1/imports/capture", json={"image": IMAGE}, headers={"X-Anon-Key": "good"}
        )
        second = c.post(
            "/api/v1/imports/receipt", json={"image": IMAGE}, headers={"X-Anon-Key": "good"}
        )

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    # 문과 인증 의존성이 같은 캐시를 본다. 두 요청, 네 번의 확인에서 토스에는 한 번 묻는다.
    assert toss.calls == ["good"]


async def test_문은_곳을_골라_검증기에_넘긴다() -> None:
    """틀린 키를 곳마다 세는 것이 이 문에서도 그대로 돈다."""
    checker = _Verifier()
    gate = _gate(_App(), checker)

    await _call(gate, _scope(forwarded=f"1.2.3.4, {SLOW}", key=b"k"), _Body([CHUNK]))

    assert checker.seen == [("k", SLOW)]


async def test_같은_키로는_사진_본문을_둘까지만_함께_받는다() -> None:
    inner = _App()
    gate = _gate(inner)
    bodies = [_stalled() for _ in range(3)]
    tasks = [asyncio.create_task(_call(gate, _scope(), body)) for body in bodies]
    await _settle()

    # 세 번째는 본문을 한 바이트도 읽지 않고 기다린다.
    assert [body.calls > 0 for body in bodies] == [True, True, False]
    # 다른 키는 기다리지 않는다.
    other = await asyncio.wait_for(_call(gate, _scope(key=b"other"), _Body([CHUNK])), 1)
    assert other[0]["status"] == 201

    # 앞의 본문 하나를 다 받으면 세 번째가 이어 읽는다. 새 오류는 없다.
    assert bodies[0]._hold is not None
    bodies[0]._hold.set()
    first = await asyncio.wait_for(tasks[0], 1)
    assert first[0]["status"] == 201
    await _settle()
    assert bodies[2].calls > 0

    for task in tasks[1:]:
        task.cancel()
    await asyncio.gather(*tasks[1:], return_exceptions=True)
    # 다 끝나면 키마다 둔 자리를 지운다.
    assert gate._slots._slots == {}


async def test_틀린_키는_문이_답하고_본문은_그대로다() -> None:
    gate = _gate(_App(), _Verifier(fail=AnonKeyRejected("모르는 키")))
    body = _Body([CHUNK, CHUNK])

    sent = await _call(gate, _scope(), body)

    assert sent[0]["status"] == 401
    assert json.loads(sent[1]["body"])["error"] == {
        "code": "UNAUTHORIZED",
        "message": "사용자 정보를 확인하지 못했어요.",
    }
    assert body.calls == 0


# ── 413 에도 CORS 헤더 ───────────────────────────────────
#
# 본문 크기 문이 CORS 바깥에 있으면 413 에 헤더가 없어 WebView 는 문구 대신 네트워크 오류를 본다.


@pytest.mark.parametrize("declared", [True, False])
def test_본문이_너무_커서_끊긴_413_에도_CORS_헤더가_붙는다(
    unauthenticated_client: TestClient, declared: bool
) -> None:
    origin = get_settings().cors_origins[0]
    headers = {"Origin": origin, "Content-Type": "application/json"}
    if declared:
        content: bytes | object = b"A" * (DEFAULT_MAX_BODY_BYTES + 1)
    else:
        content = _chunked(DEFAULT_MAX_BODY_BYTES + 1)

    response = unauthenticated_client.post("/api/v1/transactions", content=content, headers=headers)  # type: ignore[arg-type]

    assert response.status_code == 413
    assert response.headers["access-control-allow-origin"] == origin
    assert response.json()["error"]["message"] == "보낸 내용이 너무 커요."
