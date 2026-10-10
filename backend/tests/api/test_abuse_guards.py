"""남용을 막는 문 셋.

셋 다 **정상적으로 쓰는 사람은 볼 일이 없는 자리**다. 여기서 지키는 것은 문이 실제로
닫혀 있다는 것과, 문을 세우느라 정상 경로를 막지 않았다는 것 둘이다.
"""

from __future__ import annotations

import base64
import json

import pytest
from fastapi.testclient import TestClient
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


async def _gate_call(
    gate: PhotoBodyGate, *, path: str, length: int | None, key: bool = True
) -> tuple[int, bytes, bool]:
    """문 하나만 돌린다. 안쪽 앱에 닿았는지와 본문을 읽었는지를 돌려준다."""
    headers = [(b"content-type", b"application/json")]
    if length is not None:
        headers.append((b"content-length", str(length).encode()))
    if key:
        headers.append((b"x-anon-key", b"k"))
    scope = {"type": "http", "method": "POST", "path": path, "headers": headers}
    read = False
    sent: list[dict] = []

    async def receive() -> dict:
        nonlocal read
        read = True
        return {"type": "http.request", "body": b"{}", "more_body": False}

    async def send(message: dict) -> None:
        sent.append(message)

    gate.app = _inner_ok
    await gate(scope, receive, send)  # type: ignore[arg-type]
    return sent[0]["status"], sent[1]["body"], read


async def _inner_ok(scope, receive, send) -> None:  # type: ignore[no-untyped-def]
    await receive()
    await send({"type": "http.response.start", "status": 201, "headers": []})
    await send({"type": "http.response.body", "body": b"{}"})


async def test_큰_사진_본문이_몰리면_읽기_전에_503() -> None:
    gate = PhotoBodyGate(_inner_ok, max_large=2)
    gate.active = 2

    status, body, read = await _gate_call(gate, path="/api/v1/imports/capture", length=5_000_000)

    assert (status, read) == (503, False)
    assert json.loads(body)["error"] == {
        "code": "PARSE_UNAVAILABLE",
        "message": "지금은 캡처를 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    }


async def test_자리가_있으면_큰_사진도_평소대로_받고_자리를_돌려준다() -> None:
    gate = PhotoBodyGate(_inner_ok, max_large=2)

    status, _, read = await _gate_call(gate, path="/api/v1/assets/capture", length=5_000_000)
    # 길이를 안 적은 본문도 큰 본문으로 센다.
    chunked, _, _ = await _gate_call(gate, path="/api/v1/imports/receipt", length=None)

    assert (status, read, chunked) == (201, True, 201)
    assert gate.active == 0


async def test_작은_사진은_자리가_다_차도_받는다() -> None:
    gate = PhotoBodyGate(_inner_ok, max_large=1)
    gate.active = 1

    status, _, _ = await _gate_call(gate, path="/api/v1/imports/capture", length=300_000)

    assert status == 201


async def test_문은_사진_세_길만_거른다() -> None:
    gate = PhotoBodyGate(_inner_ok, max_large=1)
    gate.active = 1

    status, _, _ = await _gate_call(gate, path="/api/v1/imports/text", length=None, key=False)

    assert status == 201
