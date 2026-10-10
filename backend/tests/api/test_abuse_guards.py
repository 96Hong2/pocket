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
from sqlalchemy.orm import Session

from app.api.body_limit import DEFAULT_MAX_BODY_BYTES, MAX_BODY_BYTES, PhotoBodyGate
from app.api.deps import _verifier_for
from app.core.config import Settings, get_settings
from app.domain.category_icons import CUSTOM_ICON_MAX_LENGTH
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
# 끝나지 않는 receive 를 실제로 여러 개 띄워 본다. 값을 직접 넣어 자리가 찬 척하지 않는다.

CAPTURE = "/api/v1/imports/capture"
SLOW = "203.0.113.9"
OTHER = "198.51.100.7"
CHUNK = b"A" * 600_000


def _scope(path: str = CAPTURE, *, forwarded: str = OTHER, key: bool = True) -> dict:
    headers = [(b"content-type", b"application/json"), (b"x-forwarded-for", forwarded.encode())]
    if key:
        headers.append((b"x-anon-key", b"k"))
    # 길이를 적지 않는다(chunked). 자리는 적힌 길이가 아니라 실제로 받은 바이트로 잡는다.
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

    async def __call__(self) -> dict:
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


async def _call(gate: PhotoBodyGate, scope: dict, body: _Body) -> list[dict]:
    sent: list[dict] = []

    async def send(message: dict) -> None:
        sent.append(message)

    await gate(scope, body, send)  # type: ignore[arg-type]
    return sent


async def _settle() -> None:
    for _ in range(10):
        await asyncio.sleep(0)


async def test_한_곳의_느린_본문_여섯이_다른_곳의_사진을_막지_않는다() -> None:
    inner = _App()
    gate = PhotoBodyGate(inner)
    slow = [asyncio.create_task(_call(gate, _scope(forwarded=SLOW), _stalled())) for _ in range(6)]
    await _settle()

    # 한 곳은 두 자리까지만 쥔다. 나머지 넷은 받기를 멈추고 기다린다.
    assert (gate.held(SLOW), gate.active) == (2, 2)

    sent = await asyncio.wait_for(_call(gate, _scope(), _Body([CHUNK, CHUNK, CHUNK])), 1)

    assert sent[0]["status"] == 201
    assert inner.reached == [3 * len(CHUNK)]
    # 다 받은 순간 자리를 돌려준다.
    assert gate.held(OTHER) == 0

    for task in slow:
        task.cancel()
    await asyncio.gather(*slow, return_exceptions=True)
    # 끊긴 요청은 자리도 줄도 남기지 않는다.
    assert gate.active == 0
    assert not gate._waiters


async def test_자리를_돌려주면_기다리던_같은_곳의_요청이_이어받는다() -> None:
    inner = _App()
    gate = PhotoBodyGate(inner)
    holds = [asyncio.Event() for _ in range(3)]
    tasks = [
        asyncio.create_task(
            _call(gate, _scope(forwarded=SLOW), _Body([CHUNK, CHUNK, CHUNK], hold=hold))
        )
        for hold in holds
    ]
    await _settle()
    assert gate.held(SLOW) == 2

    for hold in holds:
        hold.set()
    results = await asyncio.wait_for(asyncio.gather(*tasks), 1)

    # 같은 NAT 뒤 세 사람이 함께 보내도 셋째는 잠깐 기다릴 뿐 실패하지 않는다.
    assert [sent[0]["status"] for sent in results] == [201, 201, 201]
    assert gate.active == 0


async def test_인스턴스_전체_자리도_묶는다() -> None:
    inner = _App()
    gate = PhotoBodyGate(inner, max_large=4)
    stuck = [
        asyncio.create_task(_call(gate, _scope(forwarded=ip), _stalled()))
        for ip in ("192.0.2.1", "192.0.2.1", "192.0.2.2", "192.0.2.2")
    ]
    await _settle()
    hold = asyncio.Event()
    late = asyncio.create_task(_call(gate, _scope(), _Body([CHUNK, CHUNK, CHUNK], hold=hold)))
    await _settle()
    assert (gate.active, gate.held(OTHER)) == (4, 0)

    stuck[0].cancel()
    await _settle()
    assert gate.held(OTHER) == 1
    hold.set()
    assert (await asyncio.wait_for(late, 1))[0]["status"] == 201

    for task in stuck[1:]:
        task.cancel()
    await asyncio.gather(*stuck, return_exceptions=True)
    assert gate.active == 0


async def test_IPv6_는_64_단위로_한_곳으로_센다() -> None:
    gate = PhotoBodyGate(_App())
    tasks = [
        asyncio.create_task(_call(gate, _scope(forwarded=f"2001:db8:1:2::{index}"), _stalled()))
        for index in range(1, 4)
    ]
    await _settle()

    assert (gate.held("2001:db8:1:2::/64"), gate.active) == (2, 2)

    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


async def test_1MB_아래로_받은_본문은_길이를_안_적어도_자리를_잡지_않는다() -> None:
    # 자리가 하나도 없는 문이다. 자리를 잡으려 들면 끝나지 않는다.
    inner = _App()
    gate = PhotoBodyGate(inner, max_large=0)

    sent = await asyncio.wait_for(_call(gate, _scope(), _Body([b"A" * 400_000] * 2)), 1)

    assert sent[0]["status"] == 201


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

    gate = PhotoBodyGate(inner, deadline_seconds=0.2)
    sent = await asyncio.wait_for(_call(gate, _scope(forwarded=SLOW), _stalled()), 2)

    assert [m["type"] for m in sent] == ["http.response.start", "http.response.body"]
    assert sent[0]["status"] == 408
    assert json.loads(sent[1]["body"])["error"] == {
        "code": "INVALID_REQUEST",
        "message": "보내는 데 너무 오래 걸렸어요. 잠시 뒤 다시 시도해 주세요.",
    }
    assert reached == []
    assert gate.active == 0


async def test_자리를_기다리는_시간도_마감에_든다() -> None:
    gate = PhotoBodyGate(_App(), per_client=1, deadline_seconds=0.2)
    first = asyncio.create_task(_call(gate, _scope(forwarded=SLOW), _stalled()))
    await _settle()

    sent = await asyncio.wait_for(_call(gate, _scope(forwarded=SLOW), _stalled()), 2)

    assert sent[0]["status"] == 408
    assert not gate._waiters
    first.cancel()
    await asyncio.gather(first, return_exceptions=True)
    assert gate.active == 0


async def test_문은_사진_세_길만_거른다() -> None:
    inner = _App()
    gate = PhotoBodyGate(inner, max_large=0, deadline_seconds=0)

    sent = await _call(gate, _scope("/api/v1/imports/text", key=False), _Body([CHUNK] * 3))

    assert sent[0]["status"] == 201


async def test_사진_길에_키가_없으면_읽지_않고_401() -> None:
    inner = _App()
    gate = PhotoBodyGate(inner)
    body = _Body([CHUNK])

    sent = await _call(gate, _scope(key=False), body)

    assert sent[0]["status"] == 401
    assert body._chunks == [CHUNK]
