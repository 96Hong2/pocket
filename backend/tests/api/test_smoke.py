"""API 스모크. 첫 vertical slice 가 실제로 도는지 확인한다."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

AUTH = {"X-Anon-Key": "test-anon-key"}


def _payload(amount: str = "12000", tx_type: str = "expense") -> dict:
    return {
        "occurred_at": datetime.now(UTC).isoformat(),
        "amount": amount,
        "type": tx_type,
        "merchant": "테스트 식당",
        "source": "keypad",
    }


def test_health(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_requires_anon_key(unauthenticated_client: TestClient) -> None:
    """로그인 화면이 없으므로 이 헤더가 유일한 인증이다."""
    r = unauthenticated_client.post("/api/v1/transactions", json=_payload())
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHORIZED"


def test_create_then_listed(client: TestClient) -> None:
    r = client.post("/api/v1/transactions", json=_payload(), headers=AUTH)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["transaction"]["amount"] == "12000"
    # 저장 응답에 판정 결과가 함께 온다. 왕복 두 번을 피하기 위한 계약이다.
    assert "kind" in body["feedback"]
    assert body["undo_window_seconds"] > 0

    listed = client.get("/api/v1/transactions", headers=AUTH).json()
    assert len(listed["items"]) == 1


def test_undo_removes_it(client: TestClient) -> None:
    created = client.post("/api/v1/transactions", json=_payload(), headers=AUTH).json()
    tx_id = created["transaction"]["id"]

    assert client.post(f"/api/v1/transactions/{tx_id}/undo", headers=AUTH).status_code == 204
    listed = client.get("/api/v1/transactions", headers=AUTH).json()
    assert listed["items"] == []


def test_summary_separates_income_and_expense(client: TestClient) -> None:
    client.post("/api/v1/transactions", json=_payload("10000", "expense"), headers=AUTH)
    client.post("/api/v1/transactions", json=_payload("50000", "income"), headers=AUTH)
    # 이체는 지출에도 수입에도 들어가지 않는다.
    client.post("/api/v1/transactions", json=_payload("70000", "transfer"), headers=AUTH)

    s = client.get("/api/v1/transactions/summary", headers=AUTH).json()
    assert s["month_expense"] == "10000"
    assert s["month_income"] == "50000"
    assert s["monthly_delta"] == "40000"


def test_budget_absent_does_not_break(client: TestClient) -> None:
    """예산을 안 정한 사용자도 저장과 조회가 온전히 돌아가야 한다."""
    r = client.post("/api/v1/transactions", json=_payload(), headers=AUTH)
    assert r.status_code == 201
    assert r.json()["feedback"]["remaining_budget"] is None
