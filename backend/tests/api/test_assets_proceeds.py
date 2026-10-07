"""팔았어요로 받은 돈을 넣은 곳(ADR-0049).

팔기 거래 하나가 장부 줄을 둘 가진다. 판 종목의 sell 줄과 받은 돈을 넣은 통장의 buy 줄이다.
거래 쓰기 네 길(저장, 고치기, 지우기, 되돌리기)에서 두 줄이 함께 움직이는지, 넣을 수 있는 곳이
예적금·현금뿐인지, 옛 번들이 이 칸 없이 고쳐도 넣은 곳이 지켜지는지 본다.

기대값은 손으로 셈했다. 삼성전자 10주를 700,000원에 사고(1주 70,000원) 5주를 420,000원 받고 팔면
판 몫의 넣은 돈은 350,000원, 수익은 70,000원(20%)이다. 카카오뱅크 1,000,000원에 받은 돈을 넣으면
1,420,000원이다.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AssetEntry, Transaction, User
from app.models.asset import AssetSnapshot
from app.modules import ledger
from app.modules.assets import entries as asset_entries

AUTH = {"X-Anon-Key": "test-anon-key"}
ASSETS = "/api/v1/assets"
TX = "/api/v1/transactions"
KST = ZoneInfo("Asia/Seoul")


def _now() -> str:
    return datetime.now(KST).replace(microsecond=0).isoformat()


def _assets(client: TestClient) -> dict:
    res = client.get(ASSETS, headers=AUTH)
    assert res.status_code == 200, res.text
    return res.json()


def _item(body: dict, label: str) -> dict:
    return next(item for item in body["items"] if item["label"] == label)


def _amount(client: TestClient, label: str) -> str:
    return _item(_assets(client), label)["amount"]


def _labels(client: TestClient) -> list[str]:
    return [item["label"] for item in _assets(client)["items"]]


def _save(client: TestClient, amount: str, **asset: object) -> dict:
    body = {"occurred_at": _now(), "amount": amount, "type": "transfer", **asset}
    res = client.post(TX, json=body, headers=AUTH)
    assert res.status_code == 201, res.text
    return res.json()


def _listed(client: TestClient, tx_id: str) -> dict:
    """목록에서 그 기록. 같은 초에 적은 기록끼리는 차례가 흔들려 자리로 찾지 않는다."""
    items = client.get(TX, headers=AUTH).json()["items"]
    return next(row for row in items if row["id"] == tx_id)


def _patch(client: TestClient, tx_id: str, body: dict, status: int = 200) -> dict:
    res = client.patch(f"{TX}/{tx_id}", json=body, headers=AUTH)
    assert res.status_code == status, res.text
    return res.json()


def _ready(client: TestClient, extra: list[dict] | None = None) -> dict[str, str]:
    """통장 둘과 삼성전자 10주(700,000원). 이름 → 항목 키."""
    items = [
        {"group": "cash", "label": "카카오뱅크", "amount": "1000000"},
        {"group": "cash", "label": "토스뱅크 통장", "amount": "500000"},
        *(extra or []),
    ]
    res = client.put(ASSETS, json={"items": items}, headers=AUTH)
    assert res.status_code == 200, res.text
    keys = {item["label"]: item["item_key"] for item in res.json()["items"]}
    bought = _save(
        client,
        "700000",
        new_asset={"group": "investment", "kind": "stock", "label": "삼성전자"},
        asset_quantity="10",
    )
    keys["삼성전자"] = bought["asset"]["item_key"]
    return keys


def _sell(client: TestClient, keys: dict[str, str], **more: object) -> dict:
    """삼성전자 5주를 420,000원 받고 판다."""
    return _save(
        client,
        "420000",
        asset_item_key=keys["삼성전자"],
        asset_side="sell",
        asset_quantity="5",
        **more,
    )


def _lines(db: Session, tx_id: str) -> list[tuple[str, bool, int, bool]]:
    """그 거래의 장부 줄. (쪽, 받은 돈 줄인가, 금액, 살아 있나) 를 들어온 순서로."""
    db.expire_all()
    rows = db.scalars(select(AssetEntry).order_by(AssetEntry.created_at)).all()
    return [
        (row.side.value, row.is_proceeds, int(row.amount), row.deleted_at is None)
        for row in rows
        if str(row.transaction_id) == tx_id
    ]


# ── 저장 ──────────────────────────────────────────────


def test_넣을_곳을_붙여_팔면_통장이_받은_돈만큼_오르고_순자산은_수익만큼만_움직인다(
    client: TestClient, db: Session
) -> None:
    keys = _ready(client)
    assert _assets(client)["summary"]["total_assets"] == "2200000"

    sold = _sell(client, keys, asset_proceeds_key=keys["카카오뱅크"])

    assert sold["asset"]["realized"] == "70000"
    assert sold["asset"]["rate"] == "20.0"
    assert sold["asset"]["proceeds_key"] == keys["카카오뱅크"]
    assert sold["asset"]["proceeds_label"] == "카카오뱅크"
    assert sold["asset"]["proceeds_amount"] == "1420000"
    assert sold["transaction"]["asset_proceeds_key"] == keys["카카오뱅크"]
    assert sold["transaction"]["asset_proceeds_label"] == "카카오뱅크"

    body = _assets(client)
    assert _item(body, "카카오뱅크")["amount"] == "1420000"
    assert _item(body, "토스뱅크 통장")["amount"] == "500000"
    stock = _item(body, "삼성전자")
    assert (stock["quantity"], stock["cost_basis"]) == ("5", "350000")
    # 종목 -350,000 + 통장 +420,000. 넣기 전에는 2,200,000 - 350,000 = 1,850,000 으로 떨어졌다.
    assert body["summary"]["total_assets"] == "2270000"
    # 거래 하나에 장부 줄 둘: 판 종목의 sell 과 통장의 buy.
    assert _lines(db, sold["transaction"]["id"]) == [
        ("sell", False, 420000, True),
        ("buy", True, 420000, True),
    ]
    # 산 기록과 같은 초에 적혀 목록의 차례는 id 로 갈린다. 차례가 아니라 id 로 찾는다.
    listed = _listed(client, sold["transaction"]["id"])
    assert listed["asset_proceeds_label"] == "카카오뱅크"


def test_넣을_곳_없이_판_기록은_지금처럼_저장되고_새_칸은_비어_있다(client: TestClient) -> None:
    keys = _ready(client)

    sold = _sell(client, keys)

    assert sold["asset"]["realized"] == "70000"
    assert sold["asset"]["proceeds_key"] is None
    assert sold["asset"]["proceeds_label"] is None
    assert sold["asset"]["proceeds_amount"] is None
    assert sold["transaction"]["asset_proceeds_key"] is None
    assert _amount(client, "카카오뱅크") == "1000000"
    assert _assets(client)["summary"]["total_assets"] == "1850000"


def test_금액으로_적는_펀드를_전부_팔아도_받은_돈이_통장에_들어간다(client: TestClient) -> None:
    keys = _ready(
        client,
        [
            {
                "group": "investment",
                "label": "S&P500 펀드",
                "amount": "1000000",
                "kind": "fund",
                "cost_basis": "1000000",
            }
        ],
    )

    sold = _save(
        client,
        "1200000",
        asset_item_key=keys["S&P500 펀드"],
        asset_side="sell",
        asset_remaining="0",
        asset_proceeds_key=keys["토스뱅크 통장"],
    )

    assert sold["asset"]["realized"] == "200000"
    assert sold["asset"]["proceeds_amount"] == "1700000"
    assert _amount(client, "토스뱅크 통장") == "1700000"
    assert _amount(client, "S&P500 펀드") == "0"


# ── 저장 뒤 화면이 쓰는 길(PATCH) ─────────────────────────


def test_저장한_뒤_고치기로_넣을_곳을_붙이면_통장이_오르고_응답에_이름과_금액이_실린다(
    client: TestClient,
) -> None:
    keys = _ready(client)
    sold = _sell(client, keys)

    updated = _patch(client, sold["transaction"]["id"], {"asset_proceeds_key": keys["카카오뱅크"]})

    assert updated["asset"]["proceeds_label"] == "카카오뱅크"
    assert updated["asset"]["proceeds_amount"] == "1420000"
    # 판 기록의 수익은 그대로다.
    assert updated["asset"]["realized"] == "70000"
    assert updated["transaction"]["asset_proceeds_key"] == keys["카카오뱅크"]
    assert _amount(client, "카카오뱅크") == "1420000"


def test_금액과_날짜를_고치면_통장_줄도_따라간다(client: TestClient, db: Session) -> None:
    keys = _ready(client)
    sold = _sell(client, keys, asset_proceeds_key=keys["카카오뱅크"])
    tx_id = sold["transaction"]["id"]
    yesterday = (datetime.now(KST) - timedelta(days=1)).replace(microsecond=0)

    updated = _patch(client, tx_id, {"amount": "450000", "occurred_at": yesterday.isoformat()})

    # 5주 350,000원어치를 450,000원 받고 팔았다.
    assert updated["asset"]["realized"] == "100000"
    assert updated["asset"]["proceeds_amount"] == "1450000"
    assert _amount(client, "카카오뱅크") == "1450000"
    # 줄은 새로 생기지 않고 제자리에서 바뀐다.
    assert _lines(db, tx_id) == [("sell", False, 450000, True), ("buy", True, 450000, True)]
    line = db.scalar(select(AssetEntry).where(AssetEntry.is_proceeds.is_(True)))
    assert line is not None
    assert line.occurred_on == yesterday.date()


def test_넣을_곳을_바꾸면_옛_통장은_돌아오고_새_통장이_오른다(
    client: TestClient, db: Session
) -> None:
    keys = _ready(client)
    sold = _sell(client, keys, asset_proceeds_key=keys["카카오뱅크"])
    tx_id = sold["transaction"]["id"]

    updated = _patch(client, tx_id, {"asset_proceeds_key": keys["토스뱅크 통장"]})

    assert updated["asset"]["proceeds_label"] == "토스뱅크 통장"
    assert updated["asset"]["proceeds_amount"] == "920000"
    assert _amount(client, "카카오뱅크") == "1000000"
    assert _amount(client, "토스뱅크 통장") == "920000"
    # 옛 통장의 줄은 지워지고 새 통장 장부 끝에 붙는다.
    assert _lines(db, tx_id) == [
        ("sell", False, 420000, True),
        ("buy", True, 420000, False),
        ("buy", True, 420000, True),
    ]


def test_null_을_보내면_넣은_곳이_비고_통장이_돌아온다(client: TestClient, db: Session) -> None:
    keys = _ready(client)
    sold = _sell(client, keys, asset_proceeds_key=keys["카카오뱅크"])
    tx_id = sold["transaction"]["id"]

    updated = _patch(client, tx_id, {"asset_proceeds_key": None})

    assert updated["transaction"]["asset_proceeds_key"] is None
    assert updated["transaction"]["asset_proceeds_label"] is None
    assert updated["asset"]["proceeds_key"] is None
    assert updated["asset"]["realized"] == "70000"
    assert _amount(client, "카카오뱅크") == "1000000"
    assert _assets(client)["summary"]["total_assets"] == "1850000"
    assert _lines(db, tx_id) == [("sell", False, 420000, True), ("buy", True, 420000, False)]


# ── 옛 번들(이 칸을 모른다) ────────────────────────────────


def test_본문에_칸이_없으면_넣은_곳이_지켜진다(client: TestClient) -> None:
    keys = _ready(client)
    sold = _sell(client, keys, asset_proceeds_key=keys["카카오뱅크"])
    tx_id = sold["transaction"]["id"]

    memo = _patch(client, tx_id, {"memo": "반만 팔았다"})
    assert memo["transaction"]["asset_proceeds_key"] == keys["카카오뱅크"]
    assert _amount(client, "카카오뱅크") == "1420000"

    # 옛 번들의 기록 고치기는 어디에, 쪽, 수량을 보내도 넣은 곳 칸은 모른다.
    old = _patch(
        client,
        tx_id,
        {
            "amount": "400000",
            "asset_item_key": keys["삼성전자"],
            "asset_side": "sell",
            "asset_quantity": "4",
        },
    )

    assert old["transaction"]["asset_proceeds_key"] == keys["카카오뱅크"]
    assert old["asset"]["proceeds_amount"] == "1400000"
    assert _amount(client, "카카오뱅크") == "1400000"


# ── 팔기가 아니게 되면 ─────────────────────────────────────


def test_넣었어요로_바꾸면_넣은_곳이_비고_통장_줄이_지워진다(
    client: TestClient, db: Session
) -> None:
    keys = _ready(client)
    sold = _sell(client, keys, asset_proceeds_key=keys["카카오뱅크"])
    tx_id = sold["transaction"]["id"]

    updated = _patch(client, tx_id, {"asset_side": "buy"})

    assert updated["transaction"]["asset_side"] == "buy"
    assert updated["transaction"]["asset_proceeds_key"] is None
    assert updated["asset"]["proceeds_key"] is None
    assert _amount(client, "카카오뱅크") == "1000000"
    # 10주 700,000원에 5주 420,000원을 더 샀다.
    stock = _item(_assets(client), "삼성전자")
    assert (stock["quantity"], stock["cost_basis"]) == ("15", "1120000")
    assert _lines(db, tx_id) == [("buy", False, 420000, True), ("buy", True, 420000, False)]


def test_어디에를_비워_그냥_이체가_되거나_지출로_바꿔도_넣은_곳이_빈다(
    client: TestClient,
) -> None:
    keys = _ready(client)
    first = _sell(client, keys, asset_proceeds_key=keys["카카오뱅크"])
    second = _save(
        client,
        "100000",
        asset_item_key=keys["삼성전자"],
        asset_side="sell",
        asset_quantity="1",
        asset_proceeds_key=keys["토스뱅크 통장"],
    )
    assert _amount(client, "토스뱅크 통장") == "600000"

    plain = _patch(client, first["transaction"]["id"], {"asset_item_key": None})
    spent = _patch(client, second["transaction"]["id"], {"type": "expense"})

    assert plain["transaction"]["asset_proceeds_key"] is None
    assert plain["asset"] is None
    assert spent["transaction"]["asset_proceeds_key"] is None
    assert _amount(client, "카카오뱅크") == "1000000"
    assert _amount(client, "토스뱅크 통장") == "500000"


def test_팔기가_아닌_기록에는_넣을_곳을_붙일_수_없다(client: TestClient) -> None:
    keys = _ready(client)
    body = {"occurred_at": _now(), "amount": "70000", "type": "transfer"}

    as_buy = client.post(
        TX,
        json={
            **body,
            "asset_item_key": keys["삼성전자"],
            "asset_quantity": "1",
            "asset_proceeds_key": keys["카카오뱅크"],
        },
        headers=AUTH,
    )
    no_dest = client.post(TX, json={**body, "asset_proceeds_key": keys["카카오뱅크"]}, headers=AUTH)
    expense = client.post(
        TX,
        json={**body, "type": "expense", "asset_proceeds_key": keys["카카오뱅크"]},
        headers=AUTH,
    )
    bought = _save(client, "70000", asset_item_key=keys["삼성전자"], asset_quantity="1")
    patched = client.patch(
        f"{TX}/{bought['transaction']['id']}",
        json={"asset_proceeds_key": keys["카카오뱅크"]},
        headers=AUTH,
    )

    assert as_buy.status_code == 422, as_buy.text
    assert no_dest.status_code == 422, no_dest.text
    assert expense.status_code == 422, expense.text
    assert patched.status_code == 422, patched.text
    assert "팔았어요 기록에만" in patched.json()["error"]["message"]
    assert _amount(client, "카카오뱅크") == "1000000"


# ── 넣을 수 있는 곳 ────────────────────────────────────────


def test_예적금_현금이_아닌_항목에는_넣을_수_없다(client: TestClient) -> None:
    keys = _ready(
        client,
        [
            {
                "group": "investment",
                "label": "S&P500 펀드",
                "amount": "1000000",
                "kind": "fund",
                "cost_basis": "1000000",
            },
            {"group": "pension", "label": "IRP", "amount": "2000000"},
            {"group": "deposit", "label": "전세 보증금", "amount": "50000000"},
            {"group": "debt", "label": "학자금", "amount": "3000000"},
        ],
    )
    sell = {
        "occurred_at": _now(),
        "amount": "420000",
        "type": "transfer",
        "asset_item_key": keys["삼성전자"],
        "asset_side": "sell",
        "asset_quantity": "5",
    }

    for label in ("S&P500 펀드", "IRP", "전세 보증금", "학자금"):
        res = client.post(TX, json={**sell, "asset_proceeds_key": keys[label]}, headers=AUTH)
        assert res.status_code == 422, (label, res.text)
        assert "예적금·현금 항목에만" in res.json()["error"]["message"], label
    missing = client.post(
        TX,
        json={**sell, "asset_proceeds_key": "00000000-0000-0000-0000-000000000000"},
        headers=AUTH,
    )
    assert missing.status_code == 422, missing.text

    # 막힌 요청은 아무것도 남기지 않는다. 판 기록도 없다.
    body = _assets(client)
    assert _item(body, "삼성전자")["quantity"] == "10"
    assert _item(body, "IRP")["amount"] == "2000000"
    assert _item(body, "학자금")["amount"] == "3000000"
    # 기록은 처음에 산 것 하나뿐이다.
    assert [row["asset_side"] for row in client.get(TX, headers=AUTH).json()["items"]] == ["buy"]

    # 고치기로 붙일 때도 같다.
    sold = _sell(client, keys)
    res = client.patch(
        f"{TX}/{sold['transaction']['id']}",
        json={"asset_proceeds_key": keys["IRP"]},
        headers=AUTH,
    )
    assert res.status_code == 422, res.text
    assert _item(_assets(client), "IRP")["amount"] == "2000000"


def test_판_항목_자신에게는_넣을_수_없다(client: TestClient) -> None:
    keys = _ready(client)

    res = client.post(
        TX,
        json={
            "occurred_at": _now(),
            "amount": "420000",
            "type": "transfer",
            "asset_item_key": keys["삼성전자"],
            "asset_side": "sell",
            "asset_quantity": "5",
            "asset_proceeds_key": keys["삼성전자"],
        },
        headers=AUTH,
    )

    assert res.status_code == 422, res.text
    assert "판 항목에는" in res.json()["error"]["message"]
    assert _item(_assets(client), "삼성전자")["quantity"] == "10"


# ── 지우기, 되돌리기 ───────────────────────────────────────


def test_지우면_두_줄이_함께_지워져_통장과_종목이_돌아온다(client: TestClient, db: Session) -> None:
    keys = _ready(client)
    sold = _sell(client, keys, asset_proceeds_key=keys["카카오뱅크"])
    tx_id = sold["transaction"]["id"]

    assert client.delete(f"{TX}/{tx_id}", headers=AUTH).status_code == 204

    body = _assets(client)
    assert _item(body, "카카오뱅크")["amount"] == "1000000"
    stock = _item(body, "삼성전자")
    assert (stock["quantity"], stock["cost_basis"]) == ("10", "700000")
    assert body["summary"]["total_assets"] == "2200000"
    assert _lines(db, tx_id) == [("sell", False, 420000, False), ("buy", True, 420000, False)]


def test_저장_직후_되돌려도_두_줄이_함께_지워진다(client: TestClient) -> None:
    keys = _ready(client)
    sold = _sell(client, keys, asset_proceeds_key=keys["카카오뱅크"])

    res = client.post(f"{TX}/{sold['transaction']['id']}/undo", headers=AUTH)

    assert res.status_code == 204, res.text
    assert _amount(client, "카카오뱅크") == "1000000"
    assert _item(_assets(client), "삼성전자")["quantity"] == "10"


def test_지운_거래를_되살려_장부를_맞추면_두_줄이_함께_돌아온다(
    client: TestClient, db: Session
) -> None:
    """거래를 되살리는 API 는 아직 없다. 장부 맞추기가 되살린 거래의 두 줄을 다시 세우는지 본다."""
    keys = _ready(client)
    sold = _sell(client, keys, asset_proceeds_key=keys["카카오뱅크"])
    tx_id = sold["transaction"]["id"]
    assert client.delete(f"{TX}/{tx_id}", headers=AUTH).status_code == 204
    assert _amount(client, "카카오뱅크") == "1000000"

    user = db.scalar(select(User))
    tx = db.scalar(select(Transaction).where(Transaction.asset_proceeds_key.is_not(None)))
    assert user is not None and tx is not None
    tx.deleted_at = None
    db.flush()
    asset_entries.sync_transaction(db, user, tx, ledger.today_for(user))
    db.commit()

    body = _assets(client)
    assert _item(body, "카카오뱅크")["amount"] == "1420000"
    stock = _item(body, "삼성전자")
    assert (stock["quantity"], stock["cost_basis"]) == ("5", "350000")
    assert _lines(db, tx_id)[-2:] == [("sell", False, 420000, True), ("buy", True, 420000, True)]


def test_넣은_통장을_손으로_고친_뒤에는_판_기록을_지워도_그_값이_그대로다(
    client: TestClient,
) -> None:
    keys = _ready(client)
    sold = _sell(client, keys, asset_proceeds_key=keys["카카오뱅크"])
    body = _assets(client)
    items = [
        {**item, "amount": "2000000"} if item["label"] == "카카오뱅크" else item
        for item in body["items"]
    ]
    res = client.put(ASSETS, json={"items": items}, headers=AUTH)
    assert res.status_code == 200, res.text

    assert client.delete(f"{TX}/{sold['transaction']['id']}", headers=AUTH).status_code == 204

    assert _amount(client, "카카오뱅크") == "2000000"


# ── 모은 돈 ───────────────────────────────────────────────


def test_판_돈을_통장에_넣어도_이번_달_모은_돈은_그대로다(client: TestClient) -> None:
    keys = _ready(client)
    # 모은 돈은 삼성전자를 산 700,000원 하나다.
    assert _assets(client)["summary"]["month_saved"] == "700000"

    sold = _sell(client, keys, asset_proceeds_key=keys["카카오뱅크"])

    assert sold["asset"]["month_saved"] == "700000"
    assert _assets(client)["summary"]["month_saved"] == "700000"
    analysis = client.get(f"{ASSETS}/analysis?scope=all", headers=AUTH)
    assert analysis.status_code == 200, analysis.text
    saved_items = analysis.json()["saved_items"]
    assert [(row["label"], row["amount"]) for row in saved_items] == [("삼성전자", "700000")]
    # 결산의 모은 돈도 같다. 판 돈 420,000원은 옮긴 돈에 한 번만 든다(통장 줄은 거래가 아니다).
    closing = client.get("/api/v1/reports/closing", headers=AUTH)
    assert closing.status_code == 200, closing.text
    flow = closing.json()["flow"]
    assert (flow["saved"], flow["moved"]) == ("700000", "420000")


# ── 새 통장 ───────────────────────────────────────────────


def test_새_통장을_만들며_넣으면_예적금_현금에_그_통장이_생기고_받은_돈이_든다(
    client: TestClient,
) -> None:
    keys = _ready(client)
    sold = _sell(client, keys)

    updated = _patch(
        client, sold["transaction"]["id"], {"new_proceeds_asset": {"label": " 케이뱅크 "}}
    )

    assert updated["asset"]["proceeds_label"] == "케이뱅크"
    assert updated["asset"]["proceeds_amount"] == "420000"
    made = _item(_assets(client), "케이뱅크")
    assert (made["group"], made["amount"]) == ("cash", "420000")
    assert updated["transaction"]["asset_proceeds_key"] == made["item_key"]
    assert _assets(client)["summary"]["total_assets"] == "2270000"


def test_저장하면서_새_통장을_만들어_넣을_수도_있다(client: TestClient) -> None:
    keys = _ready(client)

    sold = _sell(client, keys, new_proceeds_asset={"label": "케이뱅크"})

    assert sold["asset"]["proceeds_label"] == "케이뱅크"
    assert _amount(client, "케이뱅크") == "420000"


def test_있는_통장과_같은_이름이면_새로_만들지_않고_그_통장에_넣는다(client: TestClient) -> None:
    keys = _ready(client)
    sold = _sell(client, keys)

    updated = _patch(
        client, sold["transaction"]["id"], {"new_proceeds_asset": {"label": "카카오뱅크"}}
    )

    assert updated["transaction"]["asset_proceeds_key"] == keys["카카오뱅크"]
    assert _labels(client).count("카카오뱅크") == 1
    assert _amount(client, "카카오뱅크") == "1420000"


def test_새_통장_이름이_비었거나_기존_통장과_함께_보내면_422(client: TestClient) -> None:
    keys = _ready(client)
    sold = _sell(client, keys)
    tx_id = sold["transaction"]["id"]

    _patch(client, tx_id, {"new_proceeds_asset": {"label": "   "}}, status=422)
    _patch(
        client,
        tx_id,
        {"asset_proceeds_key": keys["카카오뱅크"], "new_proceeds_asset": {"label": "케이뱅크"}},
        status=422,
    )

    assert _amount(client, "카카오뱅크") == "1000000"


def test_새_통장을_만든_뒤_장부에서_막히면_그_통장이_남지_않는다(client: TestClient) -> None:
    """새 통장은 장부를 접기 전에 만들어진다. 접다가 막힌 요청이 빈 통장만 남기면 안 된다."""
    keys = _ready(client)

    # 10주뿐인데 11주를 판다. 본문은 맞는 모양이라 서비스까지 가고, 장부를 접다가 막힌다.
    over = client.post(
        TX,
        json={
            "occurred_at": _now(),
            "amount": "420000",
            "type": "transfer",
            "asset_item_key": keys["삼성전자"],
            "asset_side": "sell",
            "asset_quantity": "11",
            "new_proceeds_asset": {"label": "케이뱅크"},
        },
        headers=AUTH,
    )
    assert over.status_code == 422, over.text
    assert "가진 것보다 많이" in over.json()["error"]["message"]
    assert _labels(client) == ["카카오뱅크", "토스뱅크 통장", "삼성전자"]

    # 고치기에서도 같다. 5주를 판 기록을 11주로 고치면서 새 통장을 만든다.
    sold = _sell(client, keys)
    res = client.patch(
        f"{TX}/{sold['transaction']['id']}",
        json={"asset_quantity": "11", "new_proceeds_asset": {"label": "케이뱅크"}},
        headers=AUTH,
    )
    assert res.status_code == 422, res.text
    assert "가진 것보다 많이" in res.json()["error"]["message"]
    assert _labels(client) == ["카카오뱅크", "토스뱅크 통장", "삼성전자"]
    assert _item(_assets(client), "삼성전자")["quantity"] == "5"
    assert _listed(client, sold["transaction"]["id"])["asset_proceeds_key"] is None


def test_새_통장으로_넣은_판_기록을_지우면_빈_통장이_남지_않는다(client: TestClient) -> None:
    keys = _ready(client)
    sold = _sell(client, keys, new_proceeds_asset={"label": "케이뱅크"})

    assert client.delete(f"{TX}/{sold['transaction']['id']}", headers=AUTH).status_code == 204

    assert _labels(client) == ["카카오뱅크", "토스뱅크 통장", "삼성전자"]


def test_다른_기록이_남은_새_통장은_판_기록을_지워도_목록에_남는다(client: TestClient) -> None:
    keys = _ready(client)
    sold = _sell(client, keys, new_proceeds_asset={"label": "케이뱅크"})
    made = sold["transaction"]["asset_proceeds_key"]
    _save(client, "50000", asset_item_key=made)

    assert client.delete(f"{TX}/{sold['transaction']['id']}", headers=AUTH).status_code == 204

    assert _amount(client, "케이뱅크") == "50000"


# ── 손으로 만든 빈 통장 ────────────────────────────────────


def test_며칠_전에_손으로_만든_빈_통장은_넣을_곳으로_골랐다가_판_기록을_지워도_남는다(
    client: TestClient, db: Session
) -> None:
    """판 기록은 닷새 전, 빈 통장은 이틀 전에 손으로 만들었다. 넣을 곳은 오늘 붙이고 오늘 지운다.

    그 통장이 「이 기록으로 생긴 것」 인지는 판 기록을 적은 날이 아니라 통장 줄이 붙은 날로 가른다.
    """
    keys = _ready(client, [{"group": "cash", "label": "비상금", "amount": "0"}])
    sold = _sell(client, keys)
    tx_id = sold["transaction"]["id"]
    today = datetime.now(KST).date()
    tx = db.get(Transaction, uuid.UUID(tx_id))
    snapshot = db.scalar(select(AssetSnapshot).where(AssetSnapshot.effective_on == today))
    assert tx is not None and snapshot is not None
    tx.created_at = datetime.now(UTC) - timedelta(days=5)
    snapshot.effective_on = today - timedelta(days=2)
    db.commit()

    _patch(client, tx_id, {"asset_proceeds_key": keys["비상금"]})
    assert _amount(client, "비상금") == "420000"
    assert client.delete(f"{TX}/{tx_id}", headers=AUTH).status_code == 204

    assert _labels(client) == ["카카오뱅크", "토스뱅크 통장", "비상금", "삼성전자"]
    assert _amount(client, "비상금") == "0"


def test_매달_넣는_돈을_적어_둔_빈_통장은_같은_날_넣을_곳으로_골랐다가_지워도_남는다(
    client: TestClient,
) -> None:
    """같은 날 손으로 만든 빈 통장은 「새 통장」 과 장부가 같다.

    매달 넣는 돈이 적혀 있으면 사람이 만든 것이다. 「새 통장」 은 이름만 받는다.
    """
    keys = _ready(
        client,
        [{"group": "cash", "label": "청년도약계좌", "amount": "0", "monthly_amount": "300000"}],
    )
    sold = _sell(client, keys, asset_proceeds_key=keys["청년도약계좌"])
    assert _amount(client, "청년도약계좌") == "420000"

    assert client.delete(f"{TX}/{sold['transaction']['id']}", headers=AUTH).status_code == 204

    made = _item(_assets(client), "청년도약계좌")
    assert (made["amount"], made["monthly_amount"]) == ("0", "300000")


# ── 한 거래의 두 줄을 가르는 표식 ────────────────────────────


def test_판_항목을_다른_종목으로_바꾸고_금액을_고치고_지워도_두_줄이_제_줄을_찾는다(
    client: TestClient, db: Session
) -> None:
    """판 종목 줄과 통장 줄은 쪽이나 항목이 아니라 표식으로 가른다. 섞이면 엉뚱한 줄을 고친다."""
    keys = _ready(client)
    naver = _save(
        client,
        "800000",
        new_asset={"group": "investment", "kind": "stock", "label": "네이버"},
        asset_quantity="4",
    )["asset"]["item_key"]
    sold = _sell(client, keys, asset_proceeds_key=keys["카카오뱅크"])
    tx_id = sold["transaction"]["id"]

    # 삼성전자가 아니라 네이버 2주(400,000원어치)를 420,000원 받고 판 것으로 고친다.
    moved = _patch(
        client, tx_id, {"asset_item_key": naver, "asset_side": "sell", "asset_quantity": "2"}
    )

    assert moved["asset"]["realized"] == "20000"
    assert moved["transaction"]["asset_proceeds_key"] == keys["카카오뱅크"]
    body = _assets(client)
    samsung, held = _item(body, "삼성전자"), _item(body, "네이버")
    assert (samsung["quantity"], samsung["cost_basis"]) == ("10", "700000")
    assert (held["quantity"], held["cost_basis"]) == ("2", "400000")
    assert _item(body, "카카오뱅크")["amount"] == "1420000"
    # 삼성전자의 sell 줄만 지워지고 통장 줄은 제자리다. 네이버 장부 끝에 sell 줄이 붙었다.
    assert _lines(db, tx_id) == [
        ("sell", False, 420000, False),
        ("buy", True, 420000, True),
        ("sell", False, 420000, True),
    ]

    fixed = _patch(client, tx_id, {"amount": "500000"})

    assert fixed["asset"]["realized"] == "100000"
    assert fixed["asset"]["proceeds_amount"] == "1500000"
    assert _amount(client, "카카오뱅크") == "1500000"
    assert _lines(db, tx_id) == [
        ("sell", False, 420000, False),
        ("buy", True, 500000, True),
        ("sell", False, 500000, True),
    ]

    assert client.delete(f"{TX}/{tx_id}", headers=AUTH).status_code == 204

    body = _assets(client)
    samsung, held = _item(body, "삼성전자"), _item(body, "네이버")
    assert (samsung["quantity"], samsung["cost_basis"]) == ("10", "700000")
    assert (held["quantity"], held["cost_basis"]) == ("4", "800000")
    assert _item(body, "카카오뱅크")["amount"] == "1000000"
    assert [alive for *_, alive in _lines(db, tx_id)] == [False, False, False]
