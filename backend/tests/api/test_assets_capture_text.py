"""적은 보유 내역 → 캡처와 같은 후보 목록. 저장은 화면이 PUT /assets 로 한다.

스텁은 글을 규칙으로 읽는다(「삼성전자 3주 21만원」 → 주식 3주, 210,000원).
모델이 받는 글과 지시는 읽는 쪽을 갈아 끼워 본다.
"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import contextmanager

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.aggregation import TransactionSource
from app.integrations.llm import AssetExtraction, ExtractedAsset, LlmError, get_llm_client
from app.integrations.llm.stub import StubLlmStructuredClient
from app.models import ImportBatch, ParseUsage

AUTH = {"X-Anon-Key": "test-anon-key"}
ASSETS = "/api/v1/assets"
CAPTURE_TEXT = "/api/v1/assets/capture-text"
ACCOUNT = "123-456-789012"


def _read(client: TestClient, text: str) -> dict:
    res = client.post(CAPTURE_TEXT, json={"text": text}, headers=AUTH)
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


class _Seen(StubLlmStructuredClient):
    """받은 지시와 글을 적어 두고 빈 목록을 낸다."""

    def __init__(self) -> None:
        super().__init__()
        self.calls: list[tuple[str, str | None]] = []

    async def extract(self, *, prompt, schema, text=None, image=None, today=None):  # type: ignore[no-untyped-def]
        assert schema is AssetExtraction
        assert image is None
        self.calls.append((prompt, text))
        return AssetExtraction()


class _Broken(StubLlmStructuredClient):
    async def extract(self, *, prompt, schema, text=None, image=None, today=None):  # type: ignore[no-untyped-def]
        raise LlmError("모델이 응답하지 않았다")


def test_새_종목은_적은_금액을_넣은_돈으로_보고_수량과_1주_가격을_정한다(
    client: TestClient,
) -> None:
    body = _read(client, "삼성전자 3주 21만원, 카카오뱅크 적금 300만원")

    assert [item["name"] for item in body["items"]] == ["삼성전자", "카카오뱅크 적금"]
    stock = _row(body, "삼성전자")
    assert stock["group"] == "investment"
    assert stock["kind"] == "stock"
    assert stock["quantity"] == "3"
    assert stock["amount"] == "210000"
    assert stock["cost_basis"] == "210000"
    assert stock["unit_price"] == "70000"
    assert stock["rate"] == "0.0"
    saving = _row(body, "카카오뱅크 적금")
    assert saving["group"] == "cash"
    assert saving["amount"] == "3000000"
    assert saving["cost_basis"] is None
    # 스텁도 글은 실제로 읽는다. 예시 결과라는 표시가 없다.
    assert body["meta"] == {"provider": "stub", "is_stub": True, "notes": []}


class _Fund(StubLlmStructuredClient):
    """수량 없는 투자 줄 하나를 낸다."""

    async def extract(self, *, prompt, schema, text=None, image=None, today=None):  # type: ignore[no-untyped-def]
        return AssetExtraction(
            rows=[
                ExtractedAsset(
                    name="미국 지수 펀드", amount=6_000_000, group="investment", kind="fund"
                )
            ]
        )


def test_수량_없는_새_투자_줄은_넣은_돈을_짐작하지_않는다(client: TestClient) -> None:
    with _using(client, _Fund):
        body = _read(client, "미국 지수 펀드 600만원")

    fund = _row(body, "미국 지수 펀드")
    assert fund["amount"] == "6000000"
    assert fund["cost_basis"] is None
    assert fund["rate"] is None


def test_기존_종목은_넣은_돈을_지어내지_않고_수량이_같으면_1주_가격만_새로_적는다(
    client: TestClient,
) -> None:
    seeded = client.put(
        ASSETS,
        json={
            "items": [
                {
                    "group": "investment",
                    "label": "삼성전자",
                    "amount": "600000",
                    "kind": "stock",
                    "quantity": "2",
                    "cost_basis": "500000",
                }
            ]
        },
        headers=AUTH,
    ).json()
    key = seeded["items"][0]["item_key"]

    body = _read(client, "삼성전자 2주 64만원")

    [stock] = body["items"]
    assert stock["item_key"] == key
    # 1주 가격 없이 심은 수량 종목의 지금 금액은 넣은 돈이다.
    assert stock["current_amount"] == "500000"
    assert stock["cost_basis"] == "500000"
    assert stock["unit_price"] == "320000"


def test_글은_아무것도_저장하지_않는다(client: TestClient, db: Session) -> None:
    before = client.get(ASSETS, headers=AUTH).json()

    _read(client, "카카오뱅크 120만원")

    assert client.get(ASSETS, headers=AUTH).json()["items"] == before["items"]
    assert db.scalars(select(ImportBatch)).all() == []


def test_계좌번호는_모델에_보내기_전에_가리고_줄글_사용량으로_센다(
    client: TestClient, db: Session
) -> None:
    client.put(
        ASSETS,
        json={"items": [{"group": "cash", "label": "청년도약계좌", "amount": "1"}]},
        headers=AUTH,
    )
    reader = _Seen()
    with _using(client, lambda: reader):
        body = _read(client, f"국민은행 {ACCOUNT} 50만원")

    assert body["items"] == []
    [(prompt, text)] = reader.calls
    assert "적은 보유 내역" in prompt
    assert "청년도약계좌" in prompt
    assert text is not None
    assert ACCOUNT not in text
    [usage] = db.scalars(select(ParseUsage)).all()
    assert usage.source == TransactionSource.NL
    assert usage.redacted_count == 1
    assert usage.failed is False


def test_읽기가_실패하면_503_이고_실패로_센다(client: TestClient, db: Session) -> None:
    with _using(client, _Broken):
        res = client.post(CAPTURE_TEXT, json={"text": "카카오뱅크 120만원"}, headers=AUTH)

    assert res.status_code == 503, res.text
    message = res.json()["error"]["message"]
    assert message == "지금은 글을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요."
    [usage] = db.scalars(select(ParseUsage)).all()
    assert usage.failed is True


def test_빈_글은_받지_않는다(client: TestClient) -> None:
    res = client.post(CAPTURE_TEXT, json={"text": "   "}, headers=AUTH)

    assert res.status_code == 422, res.text
