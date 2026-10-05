"""저축·투자 기록과 자산 장부(ADR-0044).

거래 쓰기 네 길(저장, 고치기, 지우기, 되돌리기)이 같은 commit 에서 장부를 바꾸고 다시 접는지,
옛 번들(56, 57)이 새 서버에 붙어도 응답 모양과 PUT 이 그대로인지 본다.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AssetEntry, User
from app.models.asset import AssetItem, AssetSnapshot

AUTH = {"X-Anon-Key": "test-anon-key"}
ASSETS = "/api/v1/assets"
TX = "/api/v1/transactions"
KST = ZoneInfo("Asia/Seoul")


def _now() -> str:
    return datetime.now(KST).replace(microsecond=0).isoformat()


def _put(client: TestClient, items: list[dict]) -> dict:
    res = client.put(ASSETS, json={"items": items}, headers=AUTH)
    assert res.status_code == 200, res.text
    return res.json()


def _assets(client: TestClient) -> dict:
    res = client.get(ASSETS, headers=AUTH)
    assert res.status_code == 200, res.text
    return res.json()


def _item(body: dict, label: str) -> dict:
    return next(item for item in body["items"] if item["label"] == label)


def _save(client: TestClient, amount: str, **asset: object) -> dict:
    body = {"occurred_at": _now(), "amount": amount, "type": "transfer", **asset}
    res = client.post(TX, json=body, headers=AUTH)
    assert res.status_code == 201, res.text
    return res.json()


def _reject(client: TestClient, body: dict) -> str:
    res = client.post(TX, json={"occurred_at": _now(), **body}, headers=AUTH)
    assert res.status_code == 422, res.text
    return res.text


def _stock(client: TestClient) -> tuple[str, dict]:
    """삼성전자 2주를 500,000원에 산다. 새 종목은 저장과 같은 commit 에서 생긴다."""
    created = _save(
        client,
        "500000",
        new_asset={"group": "investment", "kind": "stock", "label": "삼성전자"},
        asset_quantity="2",
    )
    return created["asset"]["item_key"], created


# ── 옛 번들 보존 ────────────────────────────────────────


def test_옛_모양_GET_의_groups_는_넷이고_다섯_그룹은_all_groups_에_있다(
    client: TestClient,
) -> None:
    body = _put(
        client,
        [
            {"group": "cash", "label": "토스뱅크", "amount": "1000000"},
            {"group": "pension", "label": "IRP", "amount": "2000000"},
        ],
    )

    assert [row["group"] for row in body["groups"]] == ["cash", "investment", "deposit", "debt"]
    assert [row["group"] for row in body["all_groups"]] == [
        "cash",
        "investment",
        "pension",
        "deposit",
        "debt",
    ]
    # 순자산에는 연금이 든다. 옛 화면은 연금 줄을 그룹으로 걸러 안 그린다(알려진 차이).
    assert body["summary"]["total_assets"] == "3000000"


def test_옛_모양_PUT_이_item_key_와_종목_칸을_지킨다(client: TestClient) -> None:
    key, _ = _stock(client)
    _put(
        client,
        [
            {
                "group": "investment",
                "label": "삼성전자",
                "amount": "500000",
                "item_key": key,
                "unit_price": "300000",
            },
            {"group": "cash", "label": "예금", "amount": "1000000"},
        ],
    )

    # 옛 번들은 {group, label, amount} 만 보낸다. 수량 종목의 amount 는 무시한다.
    body = _put(
        client,
        [
            {"group": "investment", "label": "삼성전자", "amount": "1"},
            {"group": "cash", "label": "예금", "amount": "1200000"},
        ],
    )

    stock = _item(body, "삼성전자")
    assert stock["item_key"] == key
    assert stock["kind"] == "stock"
    assert stock["quantity"] == "2"
    assert stock["cost_basis"] == "500000"
    assert stock["unit_price"] == "300000"
    assert stock["amount"] == "600000"
    assert stock["rate"] == "20.0"
    assert stock["rate_kind"] == "valuation"
    assert _item(body, "예금")["amount"] == "1200000"


def test_어디에_없는_이체는_지금처럼_저장된다(client: TestClient) -> None:
    created = _save(client, "50000")

    assert created["transaction"]["type"] == "transfer"
    assert created["transaction"]["asset_item_key"] is None
    assert created["asset"] is None


# ── 저장 ──────────────────────────────────────────────


def test_통장에_넣으면_금액이_늘고_이번_달_모은_돈에_든다(client: TestClient) -> None:
    key = _put(client, [{"group": "cash", "label": "청년도약계좌", "amount": "1000000"}])["items"][
        0
    ]["item_key"]

    created = _save(client, "300000", asset_item_key=key)

    assert created["asset"]["label"] == "청년도약계좌"
    assert created["asset"]["item_amount"] == "1300000"
    assert created["asset"]["month_saved"] == "300000"
    assert created["transaction"]["asset_side"] == "buy"
    assert created["transaction"]["asset_label"] == "청년도약계좌"
    body = _assets(client)
    assert _item(body, "청년도약계좌")["amount"] == "1300000"
    assert body["summary"]["month_saved"] == "300000"
    listed = client.get(TX, headers=AUTH).json()["items"][0]
    assert listed["asset_label"] == "청년도약계좌"


def test_주식을_사고_팔면_평균_매수가로_실현_수익이_나온다(client: TestClient) -> None:
    key, created = _stock(client)
    assert created["asset"]["quantity"] == "2"
    assert created["asset"]["item_amount"] == "500000"

    sold = _save(client, "300000", asset_item_key=key, asset_side="sell", asset_quantity="1")

    assert sold["asset"]["realized"] == "50000"
    assert sold["asset"]["rate"] == "20.0"
    # 판 돈은 모은 돈이 아니다.
    assert sold["asset"]["month_saved"] == "500000"
    stock = _item(_assets(client), "삼성전자")
    assert stock["quantity"] == "1"
    assert stock["cost_basis"] == "250000"
    assert stock["realized"] == "50000"
    assert (stock["rate"], stock["rate_kind"]) == ("20.0", "realized")


# ── 고치기, 지우기, 되돌리기 ─────────────────────────────


def test_고치면_장부_줄이_자리를_지킨_채_바뀐다(client: TestClient) -> None:
    key, created = _stock(client)
    sold = _save(client, "300000", asset_item_key=key, asset_side="sell", asset_quantity="1")

    tx_id = created["transaction"]["id"]
    res = client.patch(
        f"{TX}/{tx_id}", json={"amount": "600000", "asset_quantity": "3"}, headers=AUTH
    )

    assert res.status_code == 200, res.text
    assert res.json()["asset"]["quantity"] == "2"
    stock = _item(_assets(client), "삼성전자")
    # 3주 600,000원(평균 200,000원) 에서 1주를 팔았다.
    assert stock["cost_basis"] == "400000"
    assert stock["realized"] == "100000"
    assert sold["transaction"]["id"] != tx_id


def test_지우면_넣은_돈과_수량이_돌아오고_판_기록이_기대는_산_기록은_못_지운다(
    client: TestClient,
) -> None:
    key, created = _stock(client)
    sold = _save(client, "300000", asset_item_key=key, asset_side="sell", asset_quantity="2")

    blocked = client.delete(f"{TX}/{created['transaction']['id']}", headers=AUTH)
    assert blocked.status_code == 422, blocked.text

    assert client.delete(f"{TX}/{sold['transaction']['id']}", headers=AUTH).status_code == 204
    stock = _item(_assets(client), "삼성전자")
    assert stock["quantity"] == "2"
    assert stock["cost_basis"] == "500000"
    assert stock["realized"] is None


def test_되돌리면_통장_금액이_돌아온다(client: TestClient) -> None:
    key = _put(client, [{"group": "cash", "label": "적금", "amount": "1000000"}])["items"][0][
        "item_key"
    ]
    created = _save(client, "300000", asset_item_key=key)

    res = client.post(f"{TX}/{created['transaction']['id']}/undo", headers=AUTH)

    assert res.status_code == 204, res.text
    body = _assets(client)
    assert _item(body, "적금")["amount"] == "1000000"
    assert body["summary"]["month_saved"] == "0"


def test_손으로_고친_값은_그보다_먼저_적은_기록을_지워도_그대로다(client: TestClient) -> None:
    key = _put(client, [{"group": "cash", "label": "적금", "amount": "1000000"}])["items"][0][
        "item_key"
    ]
    created = _save(client, "300000", asset_item_key=key)
    _put(client, [{"group": "cash", "label": "적금", "amount": "3000000", "item_key": key}])

    client.delete(f"{TX}/{created['transaction']['id']}", headers=AUTH)

    assert _item(_assets(client), "적금")["amount"] == "3000000"


def test_지출을_저축으로_바꾸면_분류와_결제수단이_빠진다(
    client: TestClient, default_categories: list
) -> None:
    key = _put(client, [{"group": "cash", "label": "적금", "amount": "0"}])["items"][0]["item_key"]
    expense = client.post(
        TX,
        json={
            "occurred_at": _now(),
            "amount": "300000",
            "category_id": str(default_categories[0].id),
            "payment_method": "credit",
        },
        headers=AUTH,
    ).json()["transaction"]

    res = client.patch(
        f"{TX}/{expense['id']}", json={"type": "transfer", "asset_item_key": key}, headers=AUTH
    )

    assert res.status_code == 200, res.text
    tx = res.json()["transaction"]
    assert (tx["type"], tx["category_id"], tx["payment_method"]) == ("transfer", None, None)
    assert res.json()["asset"]["item_amount"] == "300000"


# ── 검사 ──────────────────────────────────────────────


def test_종목과_어디에_검사는_422(client: TestClient) -> None:
    key, _ = _stock(client)
    debt = _put(
        client,
        [
            {"group": "investment", "label": "삼성전자", "amount": "0", "item_key": key},
            {"group": "debt", "label": "학자금", "amount": "100000"},
        ],
    )
    debt_key = _item(debt, "학자금")["item_key"]
    fund = _save(
        client,
        "100000",
        new_asset={"group": "investment", "kind": "fund", "label": "S&P500 펀드"},
    )["asset"]["item_key"]

    transfer = {"type": "transfer"}
    _reject(client, {**transfer, "amount": "1000", "asset_item_key": key})
    _reject(client, {**transfer, "amount": "1000", "asset_item_key": fund, "asset_quantity": "1"})
    _reject(
        client,
        {
            **transfer,
            "amount": "900000",
            "asset_item_key": key,
            "asset_side": "sell",
            "asset_quantity": "3",
        },
    )
    _reject(client, {**transfer, "amount": "100001", "asset_item_key": fund, "asset_side": "sell"})
    _reject(client, {**transfer, "amount": "100001", "asset_item_key": debt_key})
    _reject(client, {"amount": "1000", "asset_item_key": key, "asset_quantity": "1"})
    _reject(
        client,
        {**transfer, "amount": "1000", "new_asset": {"group": "investment", "kind": "stock"}},
    )
    _reject(
        client,
        {**transfer, "amount": "1000", "asset_item_key": "00000000-0000-0000-0000-000000000000"},
    )

    # 부채는 갚은 만큼 준다.
    paid = _save(client, "40000", asset_item_key=debt_key)
    assert paid["asset"]["item_amount"] == "60000"


# ── 체크인과 월말 점 ─────────────────────────────────────


def _user(db: Session) -> User:
    user = db.scalar(select(User))
    assert user is not None
    return user


def test_체크인은_최신을_오늘로_복사하고_다시_불러도_그대로다(
    client: TestClient, db: Session
) -> None:
    _put(client, [{"group": "cash", "label": "예금", "amount": "1000000"}])
    snapshot = db.scalar(select(AssetSnapshot))
    assert snapshot is not None
    snapshot.effective_on = date.today() - timedelta(days=40)
    db.commit()

    month = datetime.now(KST).strftime("%Y-%m")
    first = client.post(f"{ASSETS}/checkin", json={"month": month}, headers=AUTH)
    again = client.post(f"{ASSETS}/checkin", json={"month": month}, headers=AUTH)

    assert first.status_code == 200, first.text
    assert first.json()["snapshot"]["effective_on"] == datetime.now(KST).date().isoformat()
    assert again.json()["snapshot"]["id"] == first.json()["snapshot"]["id"]
    assert _item(again.json(), "예금")["amount"] == "1000000"
    wrong = client.post(f"{ASSETS}/checkin", json={"month": "2020-01"}, headers=AUTH)
    assert wrong.status_code == 422


def test_월말_점은_그_달_마지막_스냅샷이고_첫_스냅샷_전_달은_없다(
    client: TestClient, db: Session
) -> None:
    _put(client, [{"group": "cash", "label": "예금", "amount": "3000000"}])
    user = _user(db)
    today = datetime.now(KST).date()
    last_month_end = today.replace(day=1) - timedelta(days=1)
    for day, amount in ((last_month_end.replace(day=2), 1000000), (last_month_end, 2000000)):
        old = AssetSnapshot(user_id=user.id, effective_on=day)
        old.items = [AssetItem(group="cash", label="예금", amount=amount, sort_order=0)]
        db.add(old)
    db.commit()

    res = client.get(f"{ASSETS}/history?months=3", headers=AUTH)

    assert res.status_code == 200, res.text
    points = res.json()["points"]
    assert [point["month"] for point in points] == [
        last_month_end.strftime("%Y-%m"),
        today.strftime("%Y-%m"),
    ]
    assert [point["net_worth"] for point in points] == ["2000000", "3000000"]
    assert points[0]["effective_on"] == last_month_end.isoformat()


def test_장부_줄은_사용자와_항목_키로_남고_시작_값_줄이_먼저다(
    client: TestClient, db: Session
) -> None:
    key = _put(client, [{"group": "cash", "label": "적금", "amount": "1000000"}])["items"][0][
        "item_key"
    ]
    _save(client, "300000", asset_item_key=key)

    rows = db.scalars(select(AssetEntry).order_by(AssetEntry.created_at)).all()
    assert [(row.side.value, int(row.amount)) for row in rows] == [
        ("set", 1000000),
        ("buy", 300000),
    ]
    assert rows[0].created_at < rows[1].created_at


# ── 리뷰에서 잡은 경계 ─────────────────────────────────


def test_새_종목으로_저장한_기록을_되돌리면_빈_항목이_남지_않는다(client: TestClient) -> None:
    _, created = _stock(client)

    res = client.post(f"{TX}/{created['transaction']['id']}/undo", headers=AUTH)

    assert res.status_code == 204, res.text
    assert [item["label"] for item in _assets(client)["items"]] == []


def test_새_종목으로_저장한_기록을_지워도_빈_항목이_남지_않는다(client: TestClient) -> None:
    _put(client, [{"group": "cash", "label": "예금", "amount": "1000000"}])
    _, created = _stock(client)

    res = client.delete(f"{TX}/{created['transaction']['id']}", headers=AUTH)

    assert res.status_code == 204, res.text
    assert [item["label"] for item in _assets(client)["items"]] == ["예금"]


def test_다른_기록이_남은_새_종목은_지워도_목록에_남는다(client: TestClient) -> None:
    key, created = _stock(client)
    _save(client, "250000", asset_item_key=key, asset_quantity="1")

    res = client.delete(f"{TX}/{created['transaction']['id']}", headers=AUTH)

    assert res.status_code == 204, res.text
    stock = _item(_assets(client), "삼성전자")
    assert stock["quantity"] == "1"
    assert stock["cost_basis"] == "250000"


def test_옛_모양_PUT_으로_이름만_바꿔도_종목_칸과_장부가_이어진다(client: TestClient) -> None:
    key, _ = _stock(client)

    # 옛 번들은 {group, label, amount} 만, 목록 전체를 같은 차례로 보낸다.
    body = _put(client, [{"group": "investment", "label": "SAM2", "amount": "500000"}])

    [stock] = body["items"]
    assert stock["label"] == "SAM2"
    assert stock["item_key"] == key
    assert stock["kind"] == "stock"
    assert stock["quantity"] == "2"
    assert stock["cost_basis"] == "500000"
    listed = client.get(TX, headers=AUTH).json()["items"]
    assert [row["asset_label"] for row in listed] == ["SAM2"]


def test_수량_곱하기_1주_가격은_장부와_같이_사사오입한다(client: TestClient) -> None:
    body = _put(
        client,
        [
            {
                "group": "investment",
                "label": "비트코인",
                "amount": "0",
                "kind": "coin",
                "quantity": "0.5",
                "cost_basis": "30000",
                "unit_price": "75001",
            }
        ],
    )

    assert _item(body, "비트코인")["amount"] == "37501"


def test_아주_작은_수량도_지수_표기_없이_나간다(client: TestClient) -> None:
    created = _save(
        client,
        "100000",
        new_asset={"group": "investment", "kind": "coin", "label": "코인"},
        asset_quantity="0.00123456",
    )
    key = created["asset"]["item_key"]

    sold = _save(client, "90000", asset_item_key=key, asset_side="sell", asset_quantity="0.0012345")

    assert sold["transaction"]["asset_quantity"] == "0.0012345"
    assert sold["asset"]["quantity"] == "0.00000006"
    assert _item(_assets(client), "코인")["quantity"] == "0.00000006"
    tiny = _save(client, "1000", asset_item_key=key, asset_quantity="0.00000001")
    assert tiny["transaction"]["asset_quantity"] == "0.00000001"
    listed = client.get(TX, headers=AUTH).json()["items"]
    assert "0.00000001" in [row["asset_quantity"] for row in listed]


def test_조금_손해_보고_팔아_수익률이_0_이면_부호_없는_0_이다(client: TestClient) -> None:
    created = _save(
        client,
        "250000",
        new_asset={"group": "investment", "kind": "stock", "label": "카카오"},
        asset_quantity="1",
    )

    sold = _save(
        client,
        "249900",
        asset_item_key=created["asset"]["item_key"],
        asset_side="sell",
        asset_quantity="1",
    )

    assert sold["asset"]["realized"] == "-100"
    assert sold["asset"]["rate"] == "0.0"
    assert _item(_assets(client), "카카오")["rate"] == "0.0"


def test_펀드의_지금_금액을_적으면_평가_수익률이_선다(client: TestClient) -> None:
    _put(
        client,
        [
            {
                "group": "investment",
                "label": "S&P500 펀드",
                "amount": "1200000",
                "kind": "fund",
                "cost_basis": "1000000",
            }
        ],
    )

    fund = _item(_assets(client), "S&P500 펀드")
    assert fund["rate_kind"] == "valuation"
    assert fund["rate"] == "20.0"
    assert fund["price_noted_on"] == datetime.now(KST).date().isoformat()


# ── 넣은 돈을 모르는 투자 항목(캡처로 금액만 들어온 것) ─────────


def _captured(client: TestClient, label: str = "아마존", amount: str = "1000000") -> str:
    """캡처로 금액만 들어온 투자 항목. 종류도 넣은 돈도 없다."""
    body = _put(client, [{"group": "investment", "label": label, "amount": amount}])
    item = _item(body, label)
    assert item["cost_basis"] is None
    assert item["rate"] is None
    return item["item_key"]


def test_넣은_돈_모르는_항목을_전부_팔고_넣은_돈을_적으면_그_판_기록부터_수익률이_나온다(
    client: TestClient,
) -> None:
    key = _captured(client)

    sold = _save(
        client,
        "1200000",
        asset_item_key=key,
        asset_side="sell",
        asset_remaining="0",
        asset_cost_basis="800000",
    )

    assert sold["asset"]["realized"] == "400000"
    assert sold["asset"]["rate"] == "50.0"
    assert sold["asset"]["item_amount"] == "0"
    item = _item(_assets(client), "아마존")
    assert item["amount"] == "0"
    assert (item["realized"], item["rate"], item["rate_kind"]) == ("400000", "50.0", "realized")


def test_넣은_돈을_비우고_팔면_받은_돈만_적히고_수익률은_어디에도_없다(
    client: TestClient,
) -> None:
    key = _captured(client)

    sold = _save(client, "1200000", asset_item_key=key, asset_side="sell", asset_remaining="0")

    assert sold["asset"]["realized"] is None
    assert sold["asset"]["rate"] is None
    assert sold["asset"]["item_amount"] == "0"
    item = _item(_assets(client), "아마존")
    assert (item["realized"], item["rate"], item["cost_basis"]) == (None, None, None)
    returns = client.get("/api/v1/assets/analysis", headers=AUTH).json()["returns"]
    assert returns is None or returns["rows"] == []


def test_일부를_팔면_남은_금액이_항목_금액이고_평가_수익률도_선다(client: TestClient) -> None:
    body = _put(
        client,
        [{"group": "investment", "label": "아마존", "amount": "1000000", "cost_basis": "800000"}],
    )
    key = _item(body, "아마존")["item_key"]

    sold = _save(client, "300000", asset_item_key=key, asset_side="sell", asset_remaining="900000")

    assert (sold["asset"]["realized"], sold["asset"]["rate"]) == ("100000", "50.0")
    item = _item(_assets(client), "아마존")
    assert (item["amount"], item["cost_basis"]) == ("900000", "600000")
    assert (item["rate"], item["rate_kind"]) == ("50.0", "valuation")


def test_넣은_돈을_모르면_넣었어요를_더해도_계속_모른다(client: TestClient) -> None:
    key = _captured(client)

    _save(client, "200000", asset_item_key=key)

    item = _item(_assets(client), "아마존")
    assert (item["amount"], item["cost_basis"], item["rate"]) == ("1200000", None, None)


def test_항목_시트에서_넣은_돈만_적으면_칩이_생기고_비우면_계속_모른다(
    client: TestClient,
) -> None:
    key = _captured(client)
    _put(client, [{"group": "investment", "label": "아마존", "amount": "1000000", "item_key": key}])
    assert _item(_assets(client), "아마존")["cost_basis"] is None

    _put(
        client,
        [
            {
                "group": "investment",
                "label": "아마존",
                "amount": "1000000",
                "item_key": key,
                "cost_basis": "800000",
            }
        ],
    )

    item = _item(_assets(client), "아마존")
    assert (item["cost_basis"], item["rate"], item["rate_kind"]) == ("800000", "25.0", "valuation")


def test_남은_금액_없는_옛_팔기_줄은_다시_접어도_같은_값이다(client: TestClient) -> None:
    body = _put(
        client,
        [
            {
                "group": "investment",
                "label": "펀드",
                "amount": "1100000",
                "kind": "fund",
                "cost_basis": "1000000",
            }
        ],
    )
    key = _item(body, "펀드")["item_key"]
    sold = _save(client, "550000", asset_item_key=key, asset_side="sell")
    assert (sold["asset"]["realized"], sold["asset"]["rate"]) == ("50000", "10.0")

    # 이름만 바꾸는 PUT 이 다시 접게 한다. 옛 줄은 받은 돈 ÷ 지금 금액으로 접힌다.
    body = _put(
        client,
        [
            {
                "group": "investment",
                "label": "펀드 A",
                "amount": "550000",
                "kind": "fund",
                "item_key": key,
            }
        ],
    )
    item = _item(body, "펀드 A")
    assert (item["amount"], item["cost_basis"], item["realized"]) == ("550000", "500000", "50000")


def test_넣었어요로_바꾸면_남은_금액과_넣은_돈_전체가_비워진다(
    client: TestClient, db: Session
) -> None:
    key = _captured(client)
    sold = _save(
        client,
        "300000",
        asset_item_key=key,
        asset_side="sell",
        asset_remaining="800000",
        asset_cost_basis="900000",
    )

    res = client.patch(
        f"{TX}/{sold['transaction']['id']}", json={"asset_side": "buy"}, headers=AUTH
    )

    assert res.status_code == 200, res.text
    entry = db.scalar(select(AssetEntry).where(AssetEntry.transaction_id.is_not(None)))
    assert entry is not None
    assert (entry.side, entry.remaining, entry.cost_basis) == ("buy", None, None)
    assert _item(_assets(client), "아마존")["amount"] == "1300000"
