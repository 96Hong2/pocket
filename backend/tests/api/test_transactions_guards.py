"""막아 둔 입력이 실제로 막히는지 본다.

여기 있는 것은 전부 리뷰가 재현해서 확정한 결함이다. 화면에는 아직 이 값을 넣을 자리가
없는 것도 있지만, API 를 직접 부르는 쪽과 앞으로 붙을 파싱 경로가 같은 문을 쓴다.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Category

AUTH = {"X-Anon-Key": "test-anon-key"}


def _payload(**over: object) -> dict:
    body: dict = {
        "occurred_at": "2026-09-15T12:30:00+09:00",
        "amount": "10000",
        "type": "expense",
        "source": "keypad",
    }
    body.update(over)
    return body


def _create(client: TestClient, **over: object) -> dict:
    r = client.post("/api/v1/transactions", json=_payload(**over), headers=AUTH)
    assert r.status_code == 201, r.text
    return r.json()


def _budget(client: TestClient) -> dict:
    return client.get("/api/v1/transactions/summary?year=2026&month=9", headers=AUTH).json()[
        "budget"
    ]


# ── 환불 ────────────────────────────────────────────────


def test_환불은_되돌리는_지출보다_클_수_없다(client: TestClient) -> None:
    """막지 않으면 환불이 지출 취소가 아니라 수입이 된다. 남은 예산이 예산보다 커졌다."""
    spent = _create(client, amount="10000")["transaction"]["id"]

    r = client.post(
        "/api/v1/transactions",
        json=_payload(amount="1000000", type="refund", refund_of_transaction_id=spent),
        headers=AUTH,
    )
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "INVALID_REFUND_TARGET"


def test_같은_지출을_두_번_넘겨_환불할_수_없다(client: TestClient) -> None:
    spent = _create(client, amount="50000")["transaction"]["id"]

    first = client.post(
        "/api/v1/transactions",
        json=_payload(amount="50000", type="refund", refund_of_transaction_id=spent),
        headers=AUTH,
    )
    assert first.status_code == 201, first.text

    second = client.post(
        "/api/v1/transactions",
        json=_payload(amount="50000", type="refund", refund_of_transaction_id=spent),
        headers=AUTH,
    )
    assert second.status_code == 422, second.text


def test_되돌린_환불은_한도에서_빠져_다시_환불할_수_있다(client: TestClient) -> None:
    """되돌리기로 지운 환불까지 세면 잘못 넣은 것을 고칠 수 없게 된다."""
    spent = _create(client, amount="50000")["transaction"]["id"]
    wrong = client.post(
        "/api/v1/transactions",
        json=_payload(amount="50000", type="refund", refund_of_transaction_id=spent),
        headers=AUTH,
    ).json()["transaction"]["id"]

    assert client.post(f"/api/v1/transactions/{wrong}/undo", headers=AUTH).status_code == 204

    again = client.post(
        "/api/v1/transactions",
        json=_payload(amount="20000", type="refund", refund_of_transaction_id=spent),
        headers=AUTH,
    )
    assert again.status_code == 201, again.text


def test_예산에서_뺀_지출을_환불해도_예산이_늘지_않는다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """환불이 예산 제외를 물려받지 않으면 예산에서 뺀 돈이 예산으로 되돌아온다."""
    client.put("/api/v1/budgets?year=2026&month=9", json={"amount": "600000"}, headers=AUTH)
    spent = _create(client, amount="100000", excluded_from_budget=True)["transaction"]["id"]
    assert _budget(client)["remaining_budget"] == "600000"

    refund = client.post(
        "/api/v1/transactions",
        json=_payload(amount="100000", type="refund", refund_of_transaction_id=spent),
        headers=AUTH,
    )
    assert refund.status_code == 201, refund.text
    # 요청 본문에 예산 제외를 안 붙였지만 대상 값을 물려받는다.
    assert refund.json()["transaction"]["excluded_from_budget"] is True
    assert _budget(client)["remaining_budget"] == "600000"


def test_환불이_걸린_지출은_종류를_바꿀_수_없다(client: TestClient) -> None:
    """수정으로 우회하면 환불 대상이 지출이 아니게 된다. 저장 경로 검증이 무력해진다."""
    spent = _create(client, amount="10000")["transaction"]["id"]
    client.post(
        "/api/v1/transactions",
        json=_payload(amount="3000", type="refund", refund_of_transaction_id=spent),
        headers=AUTH,
    )

    r = client.patch(f"/api/v1/transactions/{spent}", json={"type": "income"}, headers=AUTH)
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "INVALID_REFUND_TARGET"


def test_환불_금액을_수정으로_키울_수_없다(client: TestClient) -> None:
    spent = _create(client, amount="10000")["transaction"]["id"]
    refund_id = client.post(
        "/api/v1/transactions",
        json=_payload(amount="3000", type="refund", refund_of_transaction_id=spent),
        headers=AUTH,
    ).json()["transaction"]["id"]

    r = client.patch(f"/api/v1/transactions/{refund_id}", json={"amount": "999999"}, headers=AUTH)
    assert r.status_code == 422, r.text


# ── 거래 시각 ───────────────────────────────────────────


def test_말도_안_되는_시각은_500_이_아니라_422_다(client: TestClient) -> None:
    """시간대 변환과 월 경계 계산이 OverflowError 로 터져 500 이 나갔다."""
    for value in ("0001-01-01T00:00:00+09:00", "9999-12-31T23:59:59-12:00"):
        r = client.post("/api/v1/transactions", json=_payload(occurred_at=value), headers=AUTH)
        assert r.status_code == 422, f"{value} → {r.status_code} {r.text}"
        assert r.json()["error"]["code"] == "INVALID_REQUEST"


def test_먼_미래_시각도_저장되지_않는다(client: TestClient) -> None:
    """저장에 성공하면 홈의 '며칠 만이네요' 판단이 계속 어긋난다."""
    r = client.post(
        "/api/v1/transactions",
        json=_payload(occurred_at="9999-12-31T10:00:00+09:00"),
        headers=AUTH,
    )
    assert r.status_code == 422, r.text


def test_수정으로도_말도_안_되는_시각을_넣을_수_없다(client: TestClient) -> None:
    tx_id = _create(client)["transaction"]["id"]
    r = client.patch(
        f"/api/v1/transactions/{tx_id}",
        json={"occurred_at": "9999-12-31T10:00:00+09:00"},
        headers=AUTH,
    )
    assert r.status_code == 422, r.text


# ── 상호 문자 ───────────────────────────────────────────


def test_상호에_NUL_바이트를_받지_않는다(client: TestClient) -> None:
    """PostgreSQL 은 text 에 NUL 을 넣지 못한다. SQLite 테스트만 통과하고 운영에서 500 이었다."""
    r = client.post("/api/v1/transactions", json=_payload(merchant="a\x00b"), headers=AUTH)
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "INVALID_REQUEST"


def test_상호에_줄바꿈도_받지_않는다(client: TestClient) -> None:
    """한 줄로 그리는 자리라 줄바꿈이 들어오면 목록이 어긋난다."""
    r = client.post("/api/v1/transactions", json=_payload(merchant="a\nb"), headers=AUTH)
    assert r.status_code == 422, r.text


# ── 조회할 달 ───────────────────────────────────────────


def test_연도만_보내면_422_다(client: TestClient) -> None:
    """조용히 무시하면 2020년을 물은 화면이 2026년 숫자를 받고도 알 수 없다."""
    for path in (
        "/api/v1/transactions?year=2020",
        "/api/v1/transactions/calendar?year=2020",
        "/api/v1/transactions/summary?year=2020",
        "/api/v1/budgets?year=2020",
    ):
        r = client.get(path, headers=AUTH)
        assert r.status_code == 422, f"{path} → {r.status_code} {r.text}"
        assert r.json()["error"]["code"] == "INVALID_REQUEST"


def test_월만_보내도_422_다(client: TestClient) -> None:
    r = client.get("/api/v1/transactions?month=1", headers=AUTH)
    assert r.status_code == 422, r.text


def test_둘_다_안_보내면_이번_달로_답한다(client: TestClient) -> None:
    """달을 안 보내는 것은 정상이다. 홈이 그렇게 부른다."""
    assert client.get("/api/v1/transactions", headers=AUTH).status_code == 200
    assert client.get("/api/v1/transactions/calendar", headers=AUTH).status_code == 200


# ── 검색어 ──────────────────────────────────────────────


def test_공백만_검색하면_목록이_줄지_않는다(client: TestClient) -> None:
    """패턴이 '%%' 가 되면 상호도 카테고리도 없는 행이 NULL ILIKE 로 조용히 탈락한다."""
    _create(client, amount="1000", merchant="스타벅스")
    _create(client, amount="2000")  # 상호도 카테고리도 없는 행

    plain = client.get("/api/v1/transactions", headers=AUTH).json()["items"]
    blank = client.get("/api/v1/transactions?q=%20%20", headers=AUTH).json()["items"]
    assert len(blank) == len(plain) == 2


# ── 500 응답도 브라우저가 읽을 수 있어야 한다 ──────────


def _crashing_client(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """일부러 500 을 내는 클라이언트.

    기본 TestClient 는 서버 예외를 그대로 다시 던져서 응답 헤더를 볼 수 없다.
    브라우저가 무엇을 받는지 보려면 실제 응답으로 받아야 한다.
    """
    from app.modules.transactions import service

    def explode(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("일부러 터뜨린다")

    monkeypatch.setattr(service, "list_transactions", explode)
    return TestClient(client.app, raise_server_exceptions=False)


def test_500_에도_CORS_헤더가_붙는다(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """미처리 예외는 CORSMiddleware 밖에서 응답이 만들어진다.

    헤더가 빠지면 브라우저가 본문을 읽기 전에 차단해서, 화면은 서버가 보낸
    INTERNAL_ERROR 를 한 번도 못 보고 늘 '연결이 불안정해요' 라고 잘못 말한다.
    """
    from app.core.config import get_settings

    crashing = _crashing_client(client, monkeypatch)
    origin = get_settings().cors_origins[0]

    r = crashing.get("/api/v1/transactions", headers={**AUTH, "Origin": origin})
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "INTERNAL_ERROR"
    assert r.headers.get("access-control-allow-origin") == origin


def test_허용하지_않은_출처에는_붙이지_않는다(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    crashing = _crashing_client(client, monkeypatch)

    r = crashing.get("/api/v1/transactions", headers={**AUTH, "Origin": "https://evil.example"})
    assert r.status_code == 500
    assert "access-control-allow-origin" not in r.headers
