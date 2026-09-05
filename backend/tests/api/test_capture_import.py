"""캡처 입력: 분석 → 검토 → 저장.

화면으로 볼 수 있는 것은 e2e 가 본다. 여기서 지키는 것은 화면에 안 보이는 자리다.
업로드한 이미지가 어디에도 남지 않는 것, 저장한 거래에 어느 묶음에서 나왔는지가 남는 것,
사용량 기록이 캡처로 갈리는 것이 그렇다.

스텁이 이미지를 읽지 않고 정해 둔 5건을 내므로, 여기서 인식 정확도를 재지 않는다.
"""

from __future__ import annotations

import base64
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from app.models import ImportBatch, ImportCandidate, ParseUsage, Transaction
from app.modules import ledger

AUTH = {"X-Anon-Key": "test-anon-key"}
TZ = ZoneInfo(ledger.DEFAULT_TIMEZONE)

# 진짜 1x1 PNG 뒤에 표식을 붙였다. 이 표식이 DB·로그·응답 어디에도 보이면 안 된다.
MARKER = b"SECRETCAPTUREPAYLOAD"
PNG_BYTES = (
    base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    + MARKER * 8
)
PAYLOAD = base64.b64encode(PNG_BYTES).decode()
IMAGE = f"data:image/png;base64,{PAYLOAD}"


def _analyze(client: TestClient, image: str = IMAGE) -> dict:
    response = client.post("/api/v1/imports/capture", json={"image": image}, headers=AUTH)
    assert response.status_code == 201, response.text
    return response.json()


def _row(batch: dict, merchant: str) -> dict:
    return next(item for item in batch["candidates"] if item["merchant"] == merchant)


def _add_transaction(client: TestClient, *, merchant: str, amount: str) -> None:
    response = client.post(
        "/api/v1/transactions",
        json={
            "occurred_at": datetime.now(TZ).isoformat(),
            "amount": amount,
            "type": "expense",
            "merchant": merchant,
            "source": "keypad",
            "confidence": 1,
            "excluded_from_budget": False,
        },
        headers=AUTH,
    )
    assert response.status_code == 201, response.text


def test_캡처_한_장에서_후보_다섯_건이_나온다(client: TestClient, default_categories) -> None:
    batch = _analyze(client)

    assert batch["source"] == "screenshot"
    assert batch["detected_count"] == 5
    assert len(batch["candidates"]) == 5
    assert batch["error_code"] is None


def test_스텁_결과라는_사실이_응답에_실린다(client: TestClient, default_categories) -> None:
    batch = _analyze(client)

    assert batch["meta"]["is_stub"] is True
    # 서버는 코드값만 보낸다. 한국어 문구는 화면이 정한다.
    assert batch["meta"]["notes"] == ["stub_image"]


def test_줄글_결과에는_캡처_표시가_붙지_않는다(client: TestClient, default_categories) -> None:
    batch = client.post("/api/v1/imports/text", json={"text": "점심 12000"}, headers=AUTH).json()

    assert batch["meta"]["notes"] == []


def test_이미_있는_거래는_켜지지_않는다(client: TestClient, default_categories) -> None:
    _add_transaction(client, merchant="스타벅스", amount="4500")

    batch = _analyze(client)

    row = _row(batch, "스타벅스")
    assert row["is_duplicate"] is True
    assert row["is_selected"] is False


def test_확신이_낮은_줄은_켜지지_않는다(client: TestClient, default_categories) -> None:
    batch = _analyze(client)

    row = _row(batch, "카카오T")
    assert row["is_low_confidence"] is True
    assert row["is_selected"] is False


def test_켜진_것만_세고_켜면_늘어난다(client: TestClient, default_categories) -> None:
    _add_transaction(client, merchant="스타벅스", amount="4500")
    batch = _analyze(client)

    assert batch["selected_count"] == 3
    assert batch["selected_expense_total"] == "44100"

    turned_on = client.patch(
        f"/api/v1/imports/{batch['id']}/candidates/{_row(batch, '카카오T')['id']}",
        json={"is_selected": True},
        headers=AUTH,
    )
    assert turned_on.status_code == 200, turned_on.text
    assert turned_on.json()["selected_count"] == 4
    assert turned_on.json()["selected_expense_total"] == "53900"


def test_저장한_거래에_어느_묶음에서_나왔는지_남는다(
    client: TestClient, db: Session, default_categories
) -> None:
    batch = _analyze(client)

    committed = client.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)
    assert committed.status_code == 200, committed.text
    assert committed.json()["created_count"] == 4

    saved = list(db.scalars(select(Transaction)))
    assert len(saved) == 4
    # 원본 이미지를 안 남기므로 '이 거래가 어디서 왔나' 의 유일한 실마리다.
    assert {str(tx.import_batch_id) for tx in saved} == {batch["id"]}
    assert {tx.source for tx in saved} == {"screenshot"}


def test_사용량_기록이_캡처로_남는다(client: TestClient, db: Session, default_categories) -> None:
    _analyze(client)

    usage = db.scalars(select(ParseUsage)).one()
    assert usage.source == "screenshot"
    # 이미지에서는 글자 수가 없다. 바이트 수를 센다.
    assert usage.input_length == len(PNG_BYTES)
    # redact() 는 문자열만 가린다. 이미지는 가릴 수단이 없고 0 이 그 사실의 기록이다.
    assert usage.redacted_count == 0
    assert usage.candidate_count == 5
    assert usage.is_stub is True


def test_업로드한_이미지가_DB_에_남지_않는다(
    client: TestClient, db: Session, default_categories
) -> None:
    batch = _analyze(client)
    client.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)

    stored = _string_values(db, ImportBatch, ImportCandidate, ParseUsage, Transaction)
    assert stored, "읽을 행이 하나도 없다. 스캔이 아무것도 안 보고 통과했다"
    for value in stored:
        assert MARKER.decode() not in value
        assert PAYLOAD[8:40] not in value


def test_업로드한_이미지가_로그에_남지_않는다(
    client: TestClient, default_categories, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.DEBUG):
        _analyze(client)

    assert MARKER.decode() not in caplog.text
    assert PAYLOAD[8:40] not in caplog.text


def test_읽지_못한_사진은_422_이고_응답에_입력이_안_실린다(
    client: TestClient, default_categories
) -> None:
    # 형식은 맞고 매직바이트만 틀린 값이라, 서버가 payload 를 디코드한 뒤에 막는다.
    broken = f"data:image/png;base64,{base64.b64encode(MARKER * 8).decode()}"

    response = client.post("/api/v1/imports/capture", json={"image": broken}, headers=AUTH)

    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "INVALID_REQUEST"
    assert response.json()["error"]["message"] == "사진을 읽지 못했어요."
    assert MARKER.decode() not in response.text


def test_읽지_못한_사진은_사용량으로_세지_않는다(
    client: TestClient, db: Session, default_categories
) -> None:
    client.post("/api/v1/imports/capture", json={"image": "그냥 문자열이 아닌 값"}, headers=AUTH)

    assert db.scalars(select(ParseUsage)).all() == []
    assert db.scalars(select(ImportBatch)).all() == []


def test_하루_상한을_넘기면_캡처도_막힌다(
    client: TestClient, default_categories, monkeypatch
) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv("NL_PARSE_DAILY_LIMIT", "0")
    get_settings.cache_clear()
    try:
        blocked = client.post("/api/v1/imports/capture", json={"image": IMAGE}, headers=AUTH)
        assert blocked.status_code == 429, blocked.text
        assert blocked.json()["error"]["code"] == "USAGE_LIMIT"
        # 줄글 문구를 그대로 쓰면 캡처를 쓴 사람에게 거짓말이 된다.
        assert "캡처 분석" in blocked.json()["error"]["message"]
    finally:
        monkeypatch.delenv("NL_PARSE_DAILY_LIMIT", raising=False)
        get_settings.cache_clear()


def _string_values(db: Session, *models: type) -> list[str]:
    """넘긴 표의 모든 문자열 컬럼 값. 어느 한 컬럼만 스캔하면 새 컬럼이 늘 때 놓친다."""
    values: list[str] = []
    for model in models:
        names = list(inspect(model).columns.keys())
        for row in db.scalars(select(model)):
            values.extend(value for name in names if isinstance(value := getattr(row, name), str))
    return values
