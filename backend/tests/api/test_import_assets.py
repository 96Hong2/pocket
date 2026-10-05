"""줄글·캡처·영수증의 저축·투자 줄.

새 번들 표시(with_assets)가 있을 때만 「어디에」 를 맞춘다. 옛 번들 요청은 지금과 같아야 한다.
저장(commit)은 거래 저장 길을 그대로 지나 장부까지 생긴다.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.llm import ASSET_TASK_MARKER, get_llm_client
from app.integrations.llm.stub import StubLlmStructuredClient
from app.models import AssetEntry, Transaction

AUTH = {"X-Anon-Key": "test-anon-key"}
ASSETS = "/api/v1/assets"
TEXT = "/api/v1/imports/text"


def _seed(client: TestClient) -> dict[str, str]:
    res = client.put(
        ASSETS,
        json={
            "items": [
                {
                    "group": "cash",
                    "label": "청년도약계좌",
                    "amount": "3000000",
                    "monthly_amount": "300000",
                },
                {"group": "cash", "label": "카카오뱅크", "amount": "1000000"},
                {
                    "group": "investment",
                    "label": "삼성전자",
                    "amount": "600000",
                    "kind": "stock",
                    "quantity": "1",
                    "cost_basis": "250000",
                },
            ]
        },
        headers=AUTH,
    )
    assert res.status_code == 200, res.text
    return {item["label"]: item["item_key"] for item in res.json()["items"]}


def _read(client: TestClient, text: str, **extra: object) -> dict:
    res = client.post(TEXT, json={"text": text, **extra}, headers=AUTH)
    assert res.status_code == 201, res.text
    return res.json()


def _assets(client: TestClient) -> dict[str, dict]:
    body = client.get(ASSETS, headers=AUTH).json()
    return {item["label"]: item for item in body["items"]}


class _PromptRecorder(StubLlmStructuredClient):
    def __init__(self) -> None:
        super().__init__()
        self.prompts: list[str] = []

    async def extract(self, *, prompt, schema, text=None, image=None, today=None):  # type: ignore[no-untyped-def]
        self.prompts.append(prompt)
        return await super().extract(
            prompt=prompt, schema=schema, text=text, image=image, today=today
        )


def test_적금_30만_넣음은_이체와_매달_넣는_항목_후보가_된다(
    client: TestClient, default_categories
) -> None:
    keys = _seed(client)

    [row] = _read(client, "적금 30만 넣음", with_assets=True)["candidates"]

    assert row["type"] == "transfer"
    assert row["amount"] == "300000"
    assert row["asset_item_key"] == keys["청년도약계좌"]
    assert row["asset_side"] == "buy"
    assert row["asset_name"] == "청년도약계좌"
    assert row["category_id"] is None
    assert row["is_selected"] is True


def test_N주는_종목과_수량으로_읽는다(client: TestClient, default_categories) -> None:
    keys = _seed(client)

    [row] = _read(client, "삼성전자 2주 50만원 샀어", with_assets=True)["candidates"]

    assert row["type"] == "transfer"
    assert row["asset_item_key"] == keys["삼성전자"]
    assert row["asset_quantity"] == "2"
    assert row["amount"] == "500000"


def test_수량_종목인데_수량을_못_읽으면_켜지_않는다(client: TestClient, default_categories) -> None:
    _seed(client)

    [row] = _read(client, "삼성전자 50만원 넣음", with_assets=True)["candidates"]

    assert row["asset_quantity"] is None
    assert row["is_selected"] is False


def test_맞는_항목이_없으면_어디에를_비우고_읽은_이름은_남긴다(
    client: TestClient, default_categories
) -> None:
    _seed(client)

    [row] = _read(client, "IRP 10만 넣었어", with_assets=True)["candidates"]

    assert row["type"] == "transfer"
    assert row["asset_item_key"] is None
    assert row["asset_side"] is None
    assert row["asset_name"] == "IRP"


def test_옛_번들_요청은_지금과_같다(client: TestClient, default_categories) -> None:
    _seed(client)
    recorder = _PromptRecorder()
    overrides = client.app.dependency_overrides  # type: ignore[attr-defined]
    overrides[get_llm_client] = lambda: recorder
    try:
        [row] = _read(client, "적금 30만 넣음")["candidates"]
    finally:
        overrides.pop(get_llm_client, None)

    assert row["type"] == "expense"
    assert row["asset_item_key"] is None
    assert row["asset_name"] is None
    assert row["asset_quantity"] is None
    [prompt] = recorder.prompts
    assert ASSET_TASK_MARKER not in prompt
    assert "청년도약계좌" not in prompt


def test_새_번들_지시에만_자산_항목_이름이_간다(client: TestClient, default_categories) -> None:
    _seed(client)
    recorder = _PromptRecorder()
    overrides = client.app.dependency_overrides  # type: ignore[attr-defined]
    overrides[get_llm_client] = lambda: recorder
    try:
        _read(client, "점심 12000", with_assets=True)
    finally:
        overrides.pop(get_llm_client, None)

    [prompt] = recorder.prompts
    assert f"{ASSET_TASK_MARKER} 청년도약계좌(매달), 카카오뱅크, 삼성전자" in prompt


def test_저장하면_거래에_어디에가_붙고_장부가_생긴다(
    client: TestClient, db: Session, default_categories
) -> None:
    keys = _seed(client)
    batch = _read(client, "적금 30만 넣음 삼성전자 2주 50만", with_assets=True)

    res = client.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)
    assert res.status_code == 200, res.text

    items = _assets(client)
    assert items["청년도약계좌"]["amount"] == "3300000"
    assert items["삼성전자"]["quantity"] == "3"
    assert items["삼성전자"]["cost_basis"] == "750000"
    saved = db.scalars(select(Transaction).where(Transaction.asset_item_key.is_not(None))).all()
    assert {str(tx.asset_item_key) for tx in saved} == {keys["청년도약계좌"], keys["삼성전자"]}
    linked = db.scalars(select(AssetEntry).where(AssetEntry.transaction_id.is_not(None))).all()
    assert len(linked) == 2


def test_검토_줄에서_어디에를_골라_저장한다(
    client: TestClient, db: Session, default_categories
) -> None:
    keys = _seed(client)
    batch = _read(client, "IRP 10만 넣었어", with_assets=True)
    [row] = batch["candidates"]

    res = client.patch(
        f"/api/v1/imports/{batch['id']}/candidates/{row['id']}",
        json={"asset_item_key": keys["카카오뱅크"]},
        headers=AUTH,
    )
    assert res.status_code == 200, res.text
    [patched] = res.json()["candidates"]
    assert patched["asset_item_key"] == keys["카카오뱅크"]
    assert patched["asset_side"] == "buy"

    commit = client.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)
    assert commit.status_code == 200, commit.text
    assert _assets(client)["카카오뱅크"]["amount"] == "1100000"


def test_지출_줄에_어디에만_보내면_막는다(client: TestClient, default_categories) -> None:
    keys = _seed(client)
    batch = _read(client, "점심 12000", with_assets=True)
    [row] = batch["candidates"]
    url = f"/api/v1/imports/{batch['id']}/candidates/{row['id']}"

    blocked = client.patch(url, json={"asset_item_key": keys["카카오뱅크"]}, headers=AUTH)
    switched = client.patch(
        url, json={"type": "transfer", "asset_item_key": keys["카카오뱅크"]}, headers=AUTH
    )

    assert blocked.status_code == 422, blocked.text
    assert switched.status_code == 200, switched.text
    [patched] = switched.json()["candidates"]
    assert patched["asset_item_key"] == keys["카카오뱅크"]
    assert patched["category_id"] is None


def test_없는_항목은_고를_수_없다(client: TestClient, default_categories) -> None:
    _seed(client)
    batch = _read(client, "IRP 10만 넣었어", with_assets=True)
    [row] = batch["candidates"]

    res = client.patch(
        f"/api/v1/imports/{batch['id']}/candidates/{row['id']}",
        json={"asset_item_key": "00000000-0000-4000-8000-000000000000"},
        headers=AUTH,
    )

    assert res.status_code == 404, res.text


def test_종류를_지출로_바꾸면_어디에가_비워진다(client: TestClient, default_categories) -> None:
    _seed(client)
    batch = _read(client, "적금 30만 넣음", with_assets=True)
    [row] = batch["candidates"]

    res = client.patch(
        f"/api/v1/imports/{batch['id']}/candidates/{row['id']}",
        json={"type": "expense"},
        headers=AUTH,
    )

    assert res.status_code == 200, res.text
    [patched] = res.json()["candidates"]
    assert patched["asset_item_key"] is None
    assert patched["asset_side"] is None


def test_셋째_줄이_장부_검사에_걸리면_아무것도_저장하지_않고_고쳐_다시_저장해도_한_번씩만_든다(
    client: TestClient, db: Session, default_categories
) -> None:
    _seed(client)
    batch = _read(client, "점심 12000 적금 30만 넣음 삼성전자 1주 30만", with_assets=True)
    lunch, saving, stock = batch["candidates"]
    assert lunch["type"] == "expense"
    assert saving["asset_item_key"] is not None
    assert stock["asset_quantity"] == "1"
    url = f"/api/v1/imports/{batch['id']}"

    # 1주를 가졌는데 5주를 판다고 고친다.
    oversell = client.patch(
        f"{url}/candidates/{stock['id']}",
        json={"asset_side": "sell", "asset_quantity": "5"},
        headers=AUTH,
    )
    assert oversell.status_code == 200, oversell.text
    blocked = client.post(f"{url}/commit", headers=AUTH)

    assert blocked.status_code == 422, blocked.text
    assert "가진 것보다 많이 팔 수 없어요" in blocked.text
    assert db.scalars(select(Transaction)).all() == []
    assert _assets(client)["청년도약계좌"]["amount"] == "3000000"

    fixed = client.patch(
        f"{url}/candidates/{stock['id']}", json={"asset_quantity": "1"}, headers=AUTH
    )
    assert fixed.status_code == 200, fixed.text
    committed = client.post(f"{url}/commit", headers=AUTH)

    assert committed.status_code == 200, committed.text
    db.expire_all()
    saved = db.scalars(select(Transaction).where(Transaction.deleted_at.is_(None))).all()
    assert sorted(int(tx.amount) for tx in saved) == [12000, 300000, 300000]
    assert _assets(client)["청년도약계좌"]["amount"] == "3300000"
    assert _assets(client)["삼성전자"]["quantity"] == "0"
