"""남용을 막는 문 셋.

셋 다 **정상적으로 쓰는 사람은 볼 일이 없는 자리**다. 여기서 지키는 것은 문이 실제로
닫혀 있다는 것과, 문을 세우느라 정상 경로를 막지 않았다는 것 둘이다.
"""

from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.body_limit import MAX_BODY_BYTES
from app.api.deps import _verifier_for
from app.core.config import Settings, get_settings
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
