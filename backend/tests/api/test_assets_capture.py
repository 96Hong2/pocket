"""자산 캡처: 잔액 화면 한 장 → 후보 목록. 저장은 PUT /assets(source=screenshot).

스텁은 그림을 안 읽고 정해 둔 세 줄을 낸다. 못 읽은 그림과 계좌번호가 섞인 이름은
모델을 갈아 끼워 본다. 인식 정확도는 여기서 재지 않는다.
"""

from __future__ import annotations

import base64
import logging
from collections.abc import Callable
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.aggregation import TransactionSource
from app.domain.asset_ledger import InvestKind
from app.domain.assets import AssetGroup
from app.domain.redaction import MASK
from app.integrations.llm import (
    AssetExtraction,
    ExtractedAsset,
    LlmError,
    get_llm_client,
)
from app.integrations.llm.stub import StubLlmStructuredClient
from app.models import ImportBatch, ParseUsage
from app.models.asset import AssetSnapshot

AUTH = {"X-Anon-Key": "test-anon-key"}
ASSETS = "/api/v1/assets"
CAPTURE = "/api/v1/assets/capture"

MARKER = b"SECRETASSETCAPTURE"
PNG = (
    base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    + MARKER * 8
)
IMAGE = f"data:image/png;base64,{base64.b64encode(PNG).decode()}"
ACCOUNT = "123-456-789012"


def _put(client: TestClient, items: list[dict], **extra: object) -> dict:
    res = client.put(ASSETS, json={"items": items, **extra}, headers=AUTH)
    assert res.status_code == 200, res.text
    return res.json()


def _capture(client: TestClient) -> dict:
    res = client.post(CAPTURE, json={"image": IMAGE}, headers=AUTH)
    assert res.status_code == 200, res.text
    return res.json()


def _row(body: dict, name: str) -> dict:
    return next(item for item in body["items"] if item["name"] == name)


@contextmanager
def _using(client: TestClient, factory: Callable[[], StubLlmStructuredClient]):
    overrides = client.app.dependency_overrides  # type: ignore[attr-defined]
    overrides[get_llm_client] = factory
    try:
        yield
    finally:
        overrides.pop(get_llm_client, None)


class _Reads(StubLlmStructuredClient):
    """정해 둔 줄을 돌려주고 받은 지시를 적어 둔다."""

    def __init__(self, rows: list[ExtractedAsset]) -> None:
        super().__init__()
        self.rows = rows
        self.prompts: list[str] = []

    async def extract(self, *, prompt, schema, text=None, image=None, today=None):  # type: ignore[no-untyped-def]
        self.prompts.append(prompt)
        assert schema is AssetExtraction
        return AssetExtraction(rows=self.rows)


class _Broken(StubLlmStructuredClient):
    async def extract(self, *, prompt, schema, text=None, image=None, today=None):  # type: ignore[no-untyped-def]
        raise LlmError("모델이 응답하지 않았다")


def _seed(client: TestClient) -> dict:
    return _put(
        client,
        [
            {
                "group": "cash",
                "label": "청년도약계좌",
                "amount": "3000000",
                "monthly_amount": "300000",
            },
            {
                "group": "investment",
                "label": "삼성전자",
                "amount": "600000",
                "kind": "stock",
                "quantity": "2",
                "cost_basis": "500000",
            },
        ],
    )


def test_기존_이름은_키와_지금_금액이_붙고_새_이름은_그룹_추정이_붙는다(
    client: TestClient,
) -> None:
    seeded = _seed(client)
    key = next(item["item_key"] for item in seeded["items"] if item["label"] == "청년도약계좌")

    body = _capture(client)

    names = [item["name"] for item in body["items"]]
    assert names == ["청년도약계좌", "카카오뱅크", "연금저축펀드", "엔비디아", "마이크로소프트"]
    known = _row(body, "청년도약계좌")
    assert known["item_key"] == key
    assert known["amount"] == "3300000"
    assert known["current_amount"] == "3000000"
    assert known["group"] == "cash"
    fresh = _row(body, "연금저축펀드")
    assert fresh["item_key"] is None
    assert fresh["current_amount"] is None
    assert fresh["group"] == "pension"
    assert body["meta"] == {"provider": "stub", "is_stub": True, "notes": ["stub_image"]}


def test_캡처는_아무것도_저장하지_않는다(client: TestClient, db: Session) -> None:
    before = _seed(client)

    _capture(client)

    assert client.get(ASSETS, headers=AUTH).json()["items"] == before["items"]
    assert db.scalars(select(ImportBatch)).all() == []


def test_잔액이_없는_그림이면_빈_목록이다(client: TestClient) -> None:
    with _using(client, lambda: _Reads([])):
        body = _capture(client)

    assert body["items"] == []


def test_수량_종목과_맞는_줄은_목록에서_뺀다(client: TestClient) -> None:
    _seed(client)
    rows = [
        ExtractedAsset(name="삼성전자", amount=1_000_000, group=AssetGroup.INVESTMENT),
        ExtractedAsset(name="청년도약계좌", amount=3_300_000, group=AssetGroup.CASH),
    ]
    with _using(client, lambda: _Reads(rows)):
        body = _capture(client)

    assert [item["name"] for item in body["items"]] == ["청년도약계좌"]


def test_이름의_계좌번호는_가려서_돌려준다(client: TestClient, caplog) -> None:
    rows = [ExtractedAsset(name=f"국민은행 {ACCOUNT}", amount=50_000, group=None)]
    with caplog.at_level(logging.DEBUG), _using(client, lambda: _Reads(rows)):
        body = _capture(client)

    [only] = body["items"]
    assert ACCOUNT not in only["name"]
    assert MASK in only["name"]
    # 모르는 그룹은 현금·예적금으로 둔다.
    assert only["group"] == "cash"
    assert ACCOUNT not in caplog.text
    assert MARKER.decode() not in caplog.text


def test_지시에_기존_항목_이름을_주고_계좌번호는_가린다(client: TestClient) -> None:
    _put(
        client,
        [
            {"group": "cash", "label": f"신한 {ACCOUNT}", "amount": "1000"},
            {"group": "cash", "label": "청년도약계좌", "amount": "1", "monthly_amount": "1"},
        ],
    )
    reader = _Reads([])
    with _using(client, lambda: reader):
        _capture(client)

    [prompt] = reader.prompts
    assert "잔액 화면" in prompt
    assert "청년도약계좌(매달)" in prompt
    assert "신한" in prompt
    assert ACCOUNT not in prompt


def test_사용량은_자산_캡처로_남는다(client: TestClient, db: Session) -> None:
    _capture(client)

    [usage] = db.scalars(select(ParseUsage)).all()
    assert usage.source == TransactionSource.ASSET_SCREENSHOT
    assert usage.candidate_count == 5
    assert usage.failed is False


def test_읽기가_실패하면_503_이고_실패로_센다(client: TestClient, db: Session) -> None:
    with _using(client, _Broken):
        res = client.post(CAPTURE, json={"image": IMAGE}, headers=AUTH)

    assert res.status_code == 503, res.text
    message = res.json()["error"]["message"]
    assert message == "지금은 캡처를 읽지 못했어요. 잠시 뒤 다시 시도해 주세요."
    [usage] = db.scalars(select(ParseUsage)).all()
    assert usage.failed is True


def test_하루_상한을_넘기면_막힌다(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv("NL_PARSE_DAILY_LIMIT", "0")
    get_settings.cache_clear()
    try:
        res = client.post(CAPTURE, json={"image": IMAGE}, headers=AUTH)
    finally:
        monkeypatch.delenv("NL_PARSE_DAILY_LIMIT", raising=False)
        get_settings.cache_clear()

    assert res.status_code == 429, res.text
    assert "자산 캡처 분석" in res.json()["error"]["message"]


def test_캡처로_읽은_목록을_저장하면_출처가_screenshot_이다(
    client: TestClient, db: Session
) -> None:
    _put(client, [{"group": "cash", "label": "카카오뱅크", "amount": "1000000"}])

    _put(
        client,
        [{"group": "cash", "label": "카카오뱅크", "amount": "1250000"}],
        source="screenshot",
    )

    body = client.get(ASSETS, headers=AUTH).json()
    assert body["snapshot"]["source"] == "screenshot"
    assert body["items"][0]["amount"] == "1250000"


def test_출처를_안_보낸_옛_PUT_은_지금처럼_manual_이다(client: TestClient, db: Session) -> None:
    body = _put(client, [{"group": "cash", "label": "카카오뱅크", "amount": "1000000"}])

    assert body["snapshot"]["source"] == "manual"
    [snapshot] = db.scalars(select(AssetSnapshot)).all()
    assert snapshot.source == "manual"


# ── 넣은 돈과 수량까지 읽은 줄 ───────────────────────────


def test_보유_화면의_수량과_평가손익으로_넣은_돈과_1주_가격을_정한다(client: TestClient) -> None:
    body = _capture(client)

    nvidia = _row(body, "엔비디아")
    assert nvidia["group"] == "investment"
    assert (nvidia["kind"], nvidia["quantity"]) == ("stock", "2")
    assert (nvidia["cost_basis"], nvidia["unit_price"], nvidia["rate"]) == (
        "2000000",
        "1400915",
        "40.1",
    )
    msft = _row(body, "마이크로소프트")
    assert (msft["kind"], msft["quantity"], msft["cost_basis"], msft["rate"]) == (
        None,
        None,
        None,
        None,
    )


def test_읽은_값으로_저장하면_자산_화면_줄도_같은_수익률이다(client: TestClient) -> None:
    nvidia = _row(_capture(client), "엔비디아")
    keys = ("kind", "quantity", "cost_basis", "unit_price")
    item = {"group": "investment", "label": "엔비디아", "amount": nvidia["amount"]}
    item.update({key: nvidia[key] for key in keys})

    saved = _put(client, [item])["items"][0]

    assert (saved["amount"], saved["rate"], saved["rate_kind"]) == ("2801830", "40.1", "valuation")


def _reads(*rows: ExtractedAsset) -> Callable[[], StubLlmStructuredClient]:
    return lambda: _Reads(list(rows))


def test_다시_캡처하면_수량이_같은_종목은_1주_가격만_새로_적는다(client: TestClient) -> None:
    _seed(client)  # 삼성전자 2주, 넣은 돈 500,000, 현재가 없음
    read = ExtractedAsset(
        name="삼성전자", amount=700_000, group=AssetGroup.INVESTMENT, quantity=2, purchase=1
    )
    with _using(client, _reads(read)):
        row = _row(_capture(client), "삼성전자")

    # 넣은 돈은 장부 값 그대로다. 읽은 매입금액(1원)으로 덮지 않는다.
    assert (row["quantity"], row["cost_basis"], row["unit_price"]) == ("2", "500000", "350000")
    assert row["rate"] == "40.0"


def test_다시_캡처하면_수량이_다른_종목은_읽은_수량과_넣은_돈으로_맞추고_넣은_돈이_없으면_뺀다(
    client: TestClient,
) -> None:
    _seed(client)
    known = ExtractedAsset(
        name="삼성전자",
        amount=900_000,
        group=None,
        kind=InvestKind.STOCK,
        quantity=3,
        purchase=780_000,
    )
    with _using(client, _reads(known)):
        row = _row(_capture(client), "삼성전자")
    assert (row["quantity"], row["cost_basis"], row["unit_price"]) == ("3", "780000", "300000")

    # 종류를 못 읽어도 기존 종목이면 수량과 매입금액으로 맞춘다.
    no_kind = ExtractedAsset(
        name="삼성전자", amount=900_000, group=None, quantity=3, purchase=780_000
    )
    with _using(client, _reads(no_kind)):
        row = _row(_capture(client), "삼성전자")
    assert (row["kind"], row["quantity"], row["cost_basis"]) == ("stock", "3", "780000")

    unknown = ExtractedAsset(name="삼성전자", amount=900_000, group=None, quantity=3)
    with _using(client, _reads(unknown)):
        assert _capture(client)["items"] == []


def test_금액만_있던_항목은_수량과_넣은_돈을_얻으면_종목이_된다(client: TestClient) -> None:
    _put(client, [{"group": "investment", "label": "엔비디아", "amount": "2000000"}])

    row = _row(_capture(client), "엔비디아")

    assert row["item_key"] is not None
    assert (row["kind"], row["quantity"], row["rate"]) == ("stock", "2", "40.1")


def test_기록이_있는_금액만_있던_항목은_갈래를_안_바꾸고_넣은_돈만_채운다(
    client: TestClient,
) -> None:
    body = _put(client, [{"group": "investment", "label": "엔비디아", "amount": "2000000"}])
    key = body["items"][0]["item_key"]
    tx = {"occurred_at": "2026-10-05T12:00:00+09:00", "amount": "100000", "type": "transfer"}
    res = client.post("/api/v1/transactions", json={**tx, "asset_item_key": key}, headers=AUTH)
    assert res.status_code == 201, res.text

    row = _row(_capture(client), "엔비디아")

    assert (row["kind"], row["quantity"], row["unit_price"]) == (None, None, None)
    assert (row["cost_basis"], row["rate"]) == ("2000000", "40.1")
