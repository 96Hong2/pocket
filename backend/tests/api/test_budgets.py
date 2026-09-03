"""예산 조회·저장과, 홈이 되돌리기 뒤에 숫자를 되돌릴 수 있는지.

예산이 없는 것은 정상 상태다. 여기 있는 것은 전부 화면이 막히는 자리다.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Budget, User

AUTH = {"X-Anon-Key": "test-anon-key"}
PERIOD = "year=2026&month=9"


def _expense(amount: str = "12000", **over: object) -> dict:
    body: dict = {
        "occurred_at": "2026-09-15T12:30:00+09:00",
        "amount": amount,
        "type": "expense",
        "merchant": "테스트 식당",
        "source": "keypad",
    }
    body.update(over)
    return body


def _budget_row(db: Session) -> Budget:
    user = db.scalar(select(User))
    assert user is not None
    row = db.scalar(select(Budget).where(Budget.user_id == user.id))
    assert row is not None
    return row


# ── 조회 ────────────────────────────────────────────────


def test_예산이_없어도_200_이고_금액이_null_이다(client: TestClient) -> None:
    """예산을 정하지 않은 사용자가 홈을 여는 첫 화면이다. 404 로 만들면 안 된다."""
    r = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["budget"]["amount"] is None
    assert body["budget"]["remaining_budget"] is None
    assert body["budget"]["spend_progress"] is None
    assert body["budget"]["budgeted_spend"] == "0"
    assert body["has_any_transaction"] is False
    assert body["days_since_last_transaction"] is None


def test_기록하면_홈이_고를_근거가_바뀐다(client: TestClient) -> None:
    client.post("/api/v1/transactions", json=_expense(), headers=AUTH)
    body = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()
    assert body["has_any_transaction"] is True
    assert body["days_since_last_transaction"] is not None


# ── 저장 ────────────────────────────────────────────────


def test_같은_기간에_두_번_저장해도_409_가_아니다(client: TestClient) -> None:
    """PUT 은 멱등이다. unique 자리를 이미 쓴 행이 지키고 있어도 덮어써야 한다."""
    first = client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    second = client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "800000"}, headers=AUTH)
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert second.json()["budget"]["amount"] == "800000"


def test_지운_예산을_다시_정할_수_있다(client: TestClient, db: Session) -> None:
    """소프트 삭제한 행이 unique 자리를 지킨다. 되살리지 않으면 영구히 막힌다."""
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    row = _budget_row(db)
    row.deleted_at = datetime.now(UTC)
    db.commit()

    assert client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()["budget"]["amount"] is None

    again = client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "500000"}, headers=AUTH)
    assert again.status_code == 200, again.text
    assert again.json()["budget"]["amount"] == "500000"


def test_예산_0원은_받지_않는다(client: TestClient) -> None:
    """'예산 없음'과 구분되지 않고 게이지 비율의 분모가 0 이 된다."""
    r = client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "0"}, headers=AUTH)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_REQUEST"


def test_소수점_예산은_반올림하지_않고_거부한다(client: TestClient) -> None:
    r = client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "1000.5"}, headers=AUTH)
    assert r.status_code == 422


# ── 화면이 홈을 다시 그릴 수 있나 ───────────────────────


def test_저장_응답의_예산_블록이_직후_조회와_같다(client: TestClient) -> None:
    """저장 응답만 보고 홈을 갱신한다. 두 값이 어긋나면 화면이 잠깐 거짓말을 한다."""
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    created = client.post("/api/v1/transactions", json=_expense(), headers=AUTH).json()

    fetched = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()["budget"]
    assert created["budget"] == fetched
    assert created["budget"]["remaining_budget"] == "588000"
    assert created["budget"]["spend_progress"] is not None


def test_요약에도_같은_예산_블록이_실린다(client: TestClient) -> None:
    """앱을 다시 열면 저장 응답이 없다. 요약으로 홈을 채울 수 있어야 한다."""
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    client.post("/api/v1/transactions", json=_expense(), headers=AUTH)

    summary = client.get(f"/api/v1/transactions/summary?{PERIOD}", headers=AUTH).json()
    budget = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()["budget"]
    assert summary["budget"] == budget
    # 남은 예산과 이번 달 차액은 다른 개념이라 따로 온다.
    assert summary["monthly_delta"] == "-12000"
    assert summary["budget"]["remaining_budget"] == "588000"


def test_되돌리면_숫자가_원래대로_돌아온다(client: TestClient) -> None:
    """되돌리기 응답에는 본문이 없다. 화면은 요약을 다시 불러 홈을 그린다."""
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    created = client.post("/api/v1/transactions", json=_expense(), headers=AUTH).json()

    undone = client.post(f"/api/v1/transactions/{created['transaction']['id']}/undo", headers=AUTH)
    assert undone.status_code == 204

    summary = client.get(f"/api/v1/transactions/summary?{PERIOD}", headers=AUTH).json()
    assert summary["budget"]["remaining_budget"] == "600000"
    assert summary["budget"]["budgeted_spend"] == "0"
    assert summary["month_expense"] == "0"


def test_예산_제외_거래는_게이지를_움직이지_않는다(client: TestClient) -> None:
    """month_expense 와 budgeted_spend 가 갈리는 자리다. 화면이 역산할 수 없는 이유이기도 하다."""
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    client.post(
        "/api/v1/transactions", json=_expense("50000", excluded_from_budget=True), headers=AUTH
    )

    summary = client.get(f"/api/v1/transactions/summary?{PERIOD}", headers=AUTH).json()
    assert summary["month_expense"] == "50000"
    assert summary["budget"]["budgeted_spend"] == "0"
    assert summary["budget"]["remaining_budget"] == "600000"


def test_비율은_지수_표기로_나가지_않는다(client: TestClient) -> None:
    """0 나눗셈 결과가 '0E+1' 로 나가면 openapi 가 Decimal 에 붙인 pattern 과 어긋난다."""
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    budget = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()["budget"]
    assert budget["spend_progress"] == "0.0000"
    assert budget["pace_ratio"] == "0.0000"
