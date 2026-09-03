"""거래 API 의 규칙을 고정한다.

여기 있는 것은 전부 실제로 한 번 틀렸던 자리다. 도메인 순수 함수 테스트가 통과해도
서비스 계층에서 다시 어긋날 수 있어서 API 로 왕복시켜 확인한다.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category, CategoryKind, User

AUTH = {"X-Anon-Key": "test-anon-key"}


def _payload(**over: object) -> dict:
    body: dict = {
        "occurred_at": "2026-09-15T12:30:00+09:00",
        "amount": "12000",
        "type": "expense",
        "merchant": "테스트 식당",
        "source": "keypad",
    }
    body.update(over)
    return body


# ── 시간대 ──────────────────────────────────────────────
# 한국은 UTC+9 라, UTC 로 날짜를 뽑으면 자정부터 아침 9시까지가 전날로 밀린다.


def test_자정_직후_거래가_그_달에_잡힌다(client: TestClient) -> None:
    """KST 9월 1일 00:30 은 UTC 로 8월 31일 15:30 이다. 9월 집계에 들어가야 한다."""
    r = client.post(
        "/api/v1/transactions",
        json=_payload(occurred_at="2026-09-01T00:30:00+09:00", amount="7000"),
        headers=AUTH,
    )
    assert r.status_code == 201, r.text

    september = client.get("/api/v1/transactions/summary?year=2026&month=9", headers=AUTH).json()
    august = client.get("/api/v1/transactions/summary?year=2026&month=8", headers=AUTH).json()
    assert september["month_expense"] == "7000"
    assert august["month_expense"] == "0"


def test_같은_순간을_UTC_로_보내도_같은_달에_잡힌다(client: TestClient) -> None:
    """표기만 다른 같은 시각이다. 두 요청이 다른 달로 갈리면 안 된다."""
    client.post(
        "/api/v1/transactions",
        json=_payload(occurred_at="2026-08-31T15:30:00+00:00", amount="7000"),
        headers=AUTH,
    )
    september = client.get("/api/v1/transactions/summary?year=2026&month=9", headers=AUTH).json()
    assert september["month_expense"] == "7000"


def test_시간대_없는_시각은_거부한다(client: TestClient) -> None:
    """서버가 임의로 해석하면 월 귀속이 조용히 어긋난다."""
    r = client.post(
        "/api/v1/transactions",
        json=_payload(occurred_at="2026-09-01T00:30:00"),
        headers=AUTH,
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_REQUEST"


# ── 금액 ────────────────────────────────────────────────


def test_소수점_금액은_반올림하지_않고_거부한다(client: TestClient) -> None:
    r = client.post("/api/v1/transactions", json=_payload(amount="100.7"), headers=AUTH)
    assert r.status_code == 422


def test_자릿수를_넘는_금액은_DB_까지_가지_않는다(client: TestClient) -> None:
    r = client.post("/api/v1/transactions", json=_payload(amount="9" * 21), headers=AUTH)
    assert r.status_code == 422


def test_무지출일만_0원을_허용한다(client: TestClient) -> None:
    ok = client.post(
        "/api/v1/transactions",
        json=_payload(amount="0", source="no_spend", merchant=None),
        headers=AUTH,
    )
    assert ok.status_code == 201, ok.text

    bad = client.post("/api/v1/transactions", json=_payload(amount="0"), headers=AUTH)
    assert bad.status_code == 422


# ── 인가 ────────────────────────────────────────────────


def test_없는_카테고리는_422_다(client: TestClient) -> None:
    r = client.post(
        "/api/v1/transactions", json=_payload(category_id=str(uuid.uuid4())), headers=AUTH
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_CATEGORY"


def test_남의_카테고리는_쓸_수_없고_기본_카테고리는_쓸_수_있다(
    client: TestClient, db: Session
) -> None:
    other = User(anon_key_hash="other-user-hash")
    db.add(other)
    db.flush()
    theirs = Category(
        user_id=other.id, name="남의 카테고리", kind=CategoryKind.EXPENSE, icon_key="26_sparkles"
    )
    shared = Category(user_id=None, name="식비", kind=CategoryKind.EXPENSE, icon_key="09_rice_bowl")
    db.add_all([theirs, shared])
    db.commit()
    other_id, shared_id = str(theirs.id), str(shared.id)

    denied = client.post("/api/v1/transactions", json=_payload(category_id=other_id), headers=AUTH)
    assert denied.status_code == 422

    allowed = client.post(
        "/api/v1/transactions", json=_payload(category_id=shared_id), headers=AUTH
    )
    assert allowed.status_code == 201, allowed.text


def test_환불_대상은_내_지출이어야_한다(client: TestClient) -> None:
    created = client.post("/api/v1/transactions", json=_payload(), headers=AUTH).json()
    expense_id = created["transaction"]["id"]

    ok = client.post(
        "/api/v1/transactions",
        json=_payload(type="refund", amount="3000", refund_of_transaction_id=expense_id),
        headers=AUTH,
    )
    assert ok.status_code == 201, ok.text

    missing = client.post(
        "/api/v1/transactions",
        json=_payload(type="refund", refund_of_transaction_id=str(uuid.uuid4())),
        headers=AUTH,
    )
    assert missing.status_code == 404


# ── 저장과 피드백 ───────────────────────────────────────


def test_피드백이_실패해도_저장은_성공이다(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """commit 뒤에 판정하므로 여기서 예외가 새면 행은 남고 500 이 나간다.

    클라이언트가 재시도하면 같은 거래가 두 번 저장된다.
    """
    from app.modules.transactions import service

    def explode(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("판정 실패")

    monkeypatch.setattr(service, "evaluate_feedback", explode)

    r = client.post("/api/v1/transactions", json=_payload(), headers=AUTH)
    assert r.status_code == 201, r.text
    assert r.json()["feedback"]["kind"] == "month_fact"
    assert len(client.get("/api/v1/transactions", headers=AUTH).json()["items"]) == 1


def test_되돌리기_마감_시각을_함께_준다(client: TestClient) -> None:
    """화면이 절대 시각으로 세야 기기 시계 차이로 억울하게 만료되지 않는다."""
    body = client.post("/api/v1/transactions", json=_payload(), headers=AUTH).json()
    assert body["undo_window_seconds"] == 8
    assert body["undo_until"].endswith(("Z", "+00:00"))


def test_피드백_종류가_계약과_같은_값이다(client: TestClient) -> None:
    body = client.post("/api/v1/transactions", json=_payload(), headers=AUTH).json()
    assert body["feedback"]["kind"] in {
        "over_budget",
        "pace_warning",
        "large_expense",
        "achievement",
        "on_track",
        "month_fact",
    }


# ── 조회 파라미터 ───────────────────────────────────────


def test_말도_안_되는_연도는_500_이_아니라_422_다(client: TestClient) -> None:
    r = client.get("/api/v1/transactions?year=99999&month=1", headers=AUTH)
    assert r.status_code == 422


# ── 첫 진입 동시성 ──────────────────────────────────────


def test_첫_진입이_동시에_두_번_와도_500_이_아니다(client: TestClient) -> None:
    """홈이 목록과 요약을 함께 부른다. 신규 사용자의 첫 화면이 여기서 깨지면 안 된다."""
    first = client.get("/api/v1/transactions", headers=AUTH)
    second = client.get("/api/v1/transactions/summary", headers=AUTH)
    assert first.status_code == 200
    assert second.status_code == 200


def test_새_사용자_행이_한_개만_생긴다(client: TestClient, db: Session) -> None:
    client.get("/api/v1/transactions", headers=AUTH)
    client.get("/api/v1/transactions/summary", headers=AUTH)
    assert len(db.scalars(select(User)).all()) == 1
