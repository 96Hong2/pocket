"""캡처 입력: 분석 → 검토 → 저장.

화면으로 볼 수 있는 것은 e2e 가 본다. 여기서 지키는 것은 화면에 안 보이는 자리다.
업로드한 이미지가 어디에도 남지 않는 것, 저장한 거래에 어느 묶음에서 나왔는지가 남는 것,
사용량 기록이 캡처로 갈리는 것이 그렇다.

스텁이 이미지를 읽지 않고 정해 둔 5건을 내므로, 여기서 인식 정확도를 재지 않는다.
"""

from __future__ import annotations

import base64
import logging
from collections.abc import Callable
from contextlib import contextmanager
from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from app.domain.aggregation import TransactionType
from app.domain.redaction import MASK
from app.integrations.llm import LlmError, get_llm_client
from app.integrations.llm.contracts import ExtractedTransaction, TransactionExtraction
from app.integrations.llm.stub import StubLlmStructuredClient
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
# 형식은 맞고 매직바이트만 틀린 값. 서버가 payload 를 디코드한 뒤에 막는다.
BROKEN_IMAGE = f"data:image/png;base64,{base64.b64encode(MARKER * 8).decode()}"
# 캡처에 찍혀 모델이 상호로 읽어 온 카드번호. 저장까지 가면 영구히 남는다.
LEAKED_CARD = "1234-5678-9012-3456"


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
    response = client.post("/api/v1/imports/capture", json={"image": BROKEN_IMAGE}, headers=AUTH)

    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "INVALID_REQUEST"
    assert response.json()["error"]["message"] == "사진을 읽지 못했어요."
    assert MARKER.decode() not in response.text


def test_읽지_못한_사진은_사용량으로_세지_않는다(
    client: TestClient, db: Session, default_categories
) -> None:
    # 스키마의 길이 하한에서 튕기면 라우터에 닿지도 못한다. 형식은 맞고 내용만 틀린 값을 쓴다.
    response = client.post("/api/v1/imports/capture", json={"image": BROKEN_IMAGE}, headers=AUTH)

    assert response.status_code == 422, response.text
    assert db.scalars(select(ParseUsage)).all() == []
    assert db.scalars(select(ImportBatch)).all() == []

    # 막힌 요청이 상한을 깎지 않았다는 것을 다음 요청이 통과하는 것으로 확인한다.
    assert _analyze(client)["detected_count"] == 5


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


@contextmanager
def _using(client: TestClient, factory: Callable[[], StubLlmStructuredClient]):
    """이번 요청 동안만 모델을 갈아 끼운다. 픽스처가 앱을 새로 만들므로 그 앱에 건다."""
    overrides = client.app.dependency_overrides  # type: ignore[attr-defined]
    overrides[get_llm_client] = factory
    try:
        yield
    finally:
        overrides.pop(get_llm_client, None)


class _PromptRecorder(StubLlmStructuredClient):
    """스텁 동작은 그대로 두고 어떤 지시를 보냈는지만 받아 적는다."""

    def __init__(self) -> None:
        super().__init__()
        self.prompts: list[str] = []

    async def extract(self, *, prompt, schema, text=None, image=None, today=None):  # type: ignore[no-untyped-def]
        self.prompts.append(prompt)
        return await super().extract(
            prompt=prompt, schema=schema, text=text, image=image, today=today
        )


class _LeakyClient(StubLlmStructuredClient):
    """카드번호가 박힌 상호를 돌려주는 모델.

    이미지 안의 숫자는 가릴 수단이 없으므로, 모델이 그것을 읽어 상호로 돌려주는 순간이
    마지막 그물이다. 스텁은 늘 깨끗한 상호만 내서 이 그물을 지나지 않는다.
    """

    async def extract(self, *, prompt, schema, text=None, image=None, today=None):  # type: ignore[no-untyped-def]
        return TransactionExtraction(
            candidates=[
                ExtractedTransaction(
                    amount=12000,
                    type=TransactionType.EXPENSE,
                    merchant=f"{LEAKED_CARD} 승인",
                    category="식비",
                    confidence=0.95,
                )
            ]
        )


class _BrokenClient(StubLlmStructuredClient):
    """읽기가 실패하는 모델. 실패했을 때 무엇을 못 읽었다고 말하는지 본다."""

    async def extract(self, *, prompt, schema, text=None, image=None, today=None):  # type: ignore[no-untyped-def]
        raise LlmError("모델이 응답하지 않았다")


def test_캡처는_캡처용_지시를_보낸다(client: TestClient, default_categories) -> None:
    recorder = _PromptRecorder()
    with _using(client, lambda: recorder):
        _analyze(client)

    assert len(recorder.prompts) == 1
    sent = recorder.prompts[0]
    # 줄글 지시가 사진에 가면 모델이 무엇을 볼지 다르게 이해한다.
    assert "결제 내역 캡처 이미지" in sent
    assert "사용자가 쓴 줄글" not in sent


def test_줄글은_줄글용_지시를_보낸다(client: TestClient, default_categories) -> None:
    recorder = _PromptRecorder()
    with _using(client, lambda: recorder):
        response = client.post("/api/v1/imports/text", json={"text": "점심 12000"}, headers=AUTH)
        assert response.status_code == 201, response.text

    sent = recorder.prompts[0]
    assert "사용자가 쓴 줄글" in sent
    assert "결제 내역 캡처 이미지" not in sent


def test_모델이_상호에_카드번호를_실어_와도_가려서_저장한다(
    client: TestClient, db: Session, default_categories
) -> None:
    """이미지는 못 가린다. 모델이 돌려준 값을 가리는 것이 마지막 그물이다."""
    with _using(client, _LeakyClient):
        batch = _analyze(client)

    assert batch["candidates"][0]["merchant"] == f"{MASK} 승인"

    client.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)

    # 거래와 기억한 분류까지 훑는다. 한 자리만 보면 다음에 새는 자리를 놓친다.
    stored = _string_values(db, ImportBatch, ImportCandidate, Transaction)
    assert stored, "읽을 행이 하나도 없다. 스캔이 아무것도 안 보고 통과했다"
    for value in stored:
        assert LEAKED_CARD not in value

    rules = client.get("/api/v1/merchant-rules", headers=AUTH)
    assert LEAKED_CARD not in rules.text


def test_읽기가_실패하면_사진에_맞는_문구로_알린다(client: TestClient, default_categories) -> None:
    with _using(client, _BrokenClient):
        response = client.post("/api/v1/imports/capture", json={"image": IMAGE}, headers=AUTH)
        text = client.post("/api/v1/imports/text", json={"text": "점심 12000"}, headers=AUTH)

    tail = " 읽지 못했어요. 잠시 뒤 다시 시도해 주세요."

    assert response.status_code == 503, response.text
    # 사진을 넣었는데 '문장을 읽지 못했다' 고 하면 무엇을 고쳐야 할지 알 수 없다.
    assert response.json()["error"]["message"] == "지금은 캡처를" + tail
    assert text.json()["error"]["message"] == "지금은 문장을" + tail


def test_달이_바뀐_직후_저장해도_예산은_이번_달을_말한다(
    client: TestClient, default_categories, monkeypatch
) -> None:
    """스텁은 그저께 건을 마지막으로 저장한다. 그것을 기준 삼으면 1일에 지난달 예산을 말한다."""
    from app.modules import ledger as ledger_module

    first_day = date(2026, 9, 1)
    monkeypatch.setattr(ledger_module, "today_for", lambda user: first_day)

    budget = client.put(
        "/api/v1/budgets?period_start=2026-09-01", json={"amount": "600000"}, headers=AUTH
    )
    assert budget.status_code == 200, budget.text

    batch = _analyze(client)
    committed = client.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)

    assert committed.status_code == 200, committed.text
    body = committed.json()
    assert body["budget"] is not None
    assert body["budget"]["period_start"] == "2026-09-01"
    # 9월에 든 것은 오늘 날짜 두 건(스타벅스 4,500 + GS25 3,200)뿐이다.
    assert body["budget"]["remaining_budget"] == "592300"


def test_전부_지난달_것이면_마지막까지_반영된_예산을_말한다(
    client: TestClient, default_categories, monkeypatch
) -> None:
    """같은 달 스냅샷이 여럿일 때 앞엣것을 고르면, 뒤에 저장한 건이 빠진 채로 보인다."""
    from app.modules import ledger as ledger_module

    monkeypatch.setattr(ledger_module, "today_for", lambda user: date(2026, 9, 20))
    budget = client.put(
        "/api/v1/budgets?period_start=2026-09-01", json={"amount": "600000"}, headers=AUTH
    )
    assert budget.status_code == 200, budget.text

    # 달을 넘긴다. 스텁의 어제·그저께 건이 지난달로 떨어지고 오늘 것만 이번 달에 남는다.
    monkeypatch.setattr(ledger_module, "today_for", lambda user: date(2026, 10, 1))
    batch = _analyze(client)

    # 이번 달에 드는 오늘 두 건을 뺀다. 남는 것은 9/30 김밥천국과 9/29 쿠팡뿐이다.
    for merchant in ("스타벅스", "GS25"):
        client.patch(
            f"/api/v1/imports/{batch['id']}/candidates/{_row(batch, merchant)['id']}",
            json={"is_selected": False},
            headers=AUTH,
        )

    committed = client.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)
    assert committed.status_code == 200, committed.text
    body = committed.json()

    assert body["budget"]["period_start"] == "2026-09-01"
    # 8,000 + 32,900 이 둘 다 빠진 값이다. 앞 스냅샷을 고르면 32,900 이 남아 592,000 이 된다.
    assert body["budget"]["remaining_budget"] == "559100"


def _string_values(db: Session, *models: type) -> list[str]:
    """넘긴 표의 모든 문자열 컬럼 값. 어느 한 컬럼만 스캔하면 새 컬럼이 늘 때 놓친다."""
    values: list[str] = []
    for model in models:
        names = list(inspect(model).columns.keys())
        for row in db.scalars(select(model)):
            values.extend(value for name in names if isinstance(value := getattr(row, name), str))
    return values
