"""GET /assets/analysis 배선.

셈은 tests/domain/test_asset_analysis.py 가 본다. 여기서는 장부, 월말 점, 이번 달 모은 돈,
번 돈, 목표가 실제로 이어지는지와 체크인 복사만으로 지문이 안 바뀌는지를 본다.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User
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


def _analysis(client: TestClient, scope: str = "all") -> dict:
    res = client.get(f"{ASSETS}/analysis?scope={scope}", headers=AUTH)
    assert res.status_code == 200, res.text
    return res.json()


def _tx(client: TestClient, amount: str, kind: str = "transfer", **extra: object) -> dict:
    body = {"occurred_at": _now(), "amount": amount, "type": kind, **extra}
    res = client.post(TX, json=body, headers=AUTH)
    assert res.status_code == 201, res.text
    return res.json()


def _seed(client: TestClient) -> str:
    """통장, 연금, 부채를 적고 삼성전자 2주를 500,000원에 산 뒤 1주 가격 300,000원을 적는다."""
    body = _put(
        client,
        [
            {
                "group": "cash",
                "label": "청년도약계좌",
                "amount": "1000000",
                "monthly_amount": "300000",
            },
            {"group": "pension", "label": "IRP", "amount": "2000000"},
            {"group": "debt", "label": "학자금", "amount": "500000"},
        ],
    )
    cash_key = body["items"][0]["item_key"]
    created = _tx(
        client,
        "500000",
        new_asset={"group": "investment", "kind": "stock", "label": "삼성전자"},
        asset_quantity="2",
    )
    stock_key = created["asset"]["item_key"]
    items = client.get(ASSETS, headers=AUTH).json()["items"]
    stock = next(item for item in items if item["item_key"] == stock_key)
    _put(
        client,
        [
            *[
                {key: item[key] for key in ("group", "label", "amount", "item_key")}
                for item in items
                if item["item_key"] != stock_key
            ],
            {
                "group": "investment",
                "label": "삼성전자",
                "amount": stock["amount"],
                "item_key": stock_key,
                "unit_price": "300000",
            },
        ],
    )
    return cash_key


def test_빈_사람도_200_이고_목록이_비어_있다(client: TestClient) -> None:
    body = _analysis(client)

    assert body["total"] == "0"
    assert body["groups"] == [] and body["bundles"] == []
    assert body["returns"]["rows"] == []
    assert body["month_change"] is None
    # 번 돈이 없으면 저축률을 지어내지 않는다.
    assert body["saving"] == {"saved": "0", "income": "0", "rate": None, "goal": None}


def test_전체_분석은_도넛_수익률_저축률_입구를_한_번에_준다(client: TestClient) -> None:
    cash_key = _seed(client)
    _tx(client, "2000000", kind="income")
    _tx(client, "300000", asset_item_key=cash_key)
    client.post("/api/v1/goals", json={"title": "여행", "target_amount": "1000000"}, headers=AUTH)

    body = _analysis(client)

    assert body["summary"] == {
        "total_assets": "3900000",
        "total_assets_without_pension": "1900000",
        "total_liabilities": "500000",
        "net_worth": "3400000",
    }
    assert [(row["group"], row["amount"], row["ratio"]) for row in body["groups"]] == [
        ("cash", "1300000", "33.3"),
        ("investment", "600000", "15.4"),
        ("pension", "2000000", "51.3"),
    ]
    returns = body["returns"]
    assert [(row["label"], row["gain"], row["rate"]) for row in returns["rows"]] == [
        ("삼성전자", "100000", "20.0")
    ]
    assert (returns["cost"], returns["value"], returns["rate"]) == ("500000", "600000", "20.0")
    # 이번 달 모은 돈은 주식 산 돈과 통장에 넣은 돈이다.
    assert body["saving"]["saved"] == "800000"
    assert body["saving"]["income"] == "2000000"
    assert body["saving"]["rate"] == "40.0"
    assert body["saving"]["goal"]["title"] == "여행"
    assert [(row["scope"], row["item_count"]) for row in body["bundles"]] == [
        ("stock", 1),
        ("cash", 1),
    ]
    stock = next(row for row in body["bundles"] if row["scope"] == "stock")
    assert stock["fingerprint"] == _analysis(client, "stock")["fingerprint"]


def test_종류별_분석은_그_묶음_항목만_본다(client: TestClient) -> None:
    _seed(client)
    _tx(
        client,
        "100000",
        new_asset={"group": "investment", "kind": "coin", "label": "비트코인"},
        asset_quantity="0.003",
    )

    stock = _analysis(client, "stock")
    cash = _analysis(client, "cash")

    assert [(row["label"], row["ratio"]) for row in stock["items"]] == [("삼성전자", "100.0")]
    assert [row["label"] for row in stock["returns"]["rows"]] == ["삼성전자"]
    assert stock["summary"] is None and stock["saving"] is None
    assert [(row["label"], row["monthly_amount"]) for row in cash["items"]] == [
        ("청년도약계좌", "300000")
    ]
    assert cash["monthly_total"] == "300000"
    assert cash["returns"] is None
    # 코인은 전체 분석의 투자 조각과 수익률 줄 후보에만 든다.
    assert _analysis(client)["groups"][1]["amount"] == "700000"


def test_체크인_복사만으로는_지문이_안_바뀌고_금액이_바뀌면_바뀐다(
    client: TestClient, db: Session
) -> None:
    _seed(client)
    before = _analysis(client)
    snapshot = db.scalar(select(AssetSnapshot).order_by(AssetSnapshot.effective_on.desc()))
    assert snapshot is not None
    snapshot.effective_on = date.today() - timedelta(days=40)
    db.commit()

    month = datetime.now(KST).strftime("%Y-%m")
    res = client.post(f"{ASSETS}/checkin", json={"month": month}, headers=AUTH)
    assert res.status_code == 200, res.text
    after = _analysis(client)

    assert after["fingerprint"] == before["fingerprint"]
    assert after["bundles"] == before["bundles"]
    items = res.json()["items"]
    _put(
        client,
        [
            {key: item[key] for key in ("group", "label", "amount", "item_key")}
            | ({"amount": "1000001"} if item["label"] == "청년도약계좌" else {})
            for item in items
        ],
    )
    changed = _analysis(client)
    assert changed["fingerprint"] != before["fingerprint"]
    by_scope = {row["scope"]: row["fingerprint"] for row in changed["bundles"]}
    old_scope = {row["scope"]: row["fingerprint"] for row in before["bundles"]}
    assert by_scope["cash"] != old_scope["cash"]
    assert by_scope["stock"] == old_scope["stock"]


def test_지난달_대비는_지난달_월말_점과_견준다(client: TestClient, db: Session) -> None:
    _put(
        client,
        [
            {"group": "cash", "label": "예금", "amount": "3000000"},
            {"group": "debt", "label": "대출", "amount": "1000000"},
        ],
    )
    user = db.scalar(select(User))
    assert user is not None
    last_month_end = datetime.now(KST).date().replace(day=1) - timedelta(days=1)
    old = AssetSnapshot(user_id=user.id, effective_on=last_month_end)
    old.items = [
        AssetItem(group="cash", label="예금", amount=2500000, sort_order=0),
        AssetItem(group="debt", label="대출", amount=1200000, sort_order=1),
    ]
    db.add(old)
    db.commit()

    change = _analysis(client)["month_change"]

    assert change["previous_month"] == last_month_end.strftime("%Y-%m")
    assert change["previous_effective_on"] == last_month_end.isoformat()
    assert (change["previous_net_worth"], change["net_worth"], change["delta"]) == (
        "1300000",
        "2000000",
        "700000",
    )
    assert [(row["group"], row["delta"]) for row in change["groups"]] == [
        ("cash", "500000"),
        ("debt", "-200000"),
    ]


def test_모르는_scope_는_422(client: TestClient) -> None:
    res = client.get(f"{ASSETS}/analysis?scope=coin", headers=AUTH)

    assert res.status_code == 422


OTHER = {"X-Anon-Key": "second-device-key"}


def _month_start(months_back: int) -> date:
    day = datetime.now(KST).date().replace(day=1)
    for _ in range(months_back):
        day = (day - timedelta(days=1)).replace(day=1)
    return day


def test_빈_사람은_모은_돈_칸이_비고_달마다_막대는_여섯_개_0원이다(client: TestClient) -> None:
    body = _analysis(client)

    assert body["saved_items"] == [] and body["large_saves"] == []
    trend = body["saved_trend"]
    assert [point["amount"] for point in trend] == ["0"] * 6
    # 오래된 달부터 이어진 여섯 달. 마지막이 이번 달이다.
    assert [point["period_start"] for point in trend] == [
        _month_start(back).isoformat() for back in range(5, -1, -1)
    ]
    assert trend[-1]["month"] == _month_start(0).strftime("%Y-%m")
    # 종류별 분석은 이 칸들을 채우지 않는다.
    stock = _analysis(client, "stock")
    assert stock["saved_items"] == [] and stock["saved_trend"] == [] and stock["large_saves"] == []


def test_어디에_모았나와_큰_기록은_판_것과_지출과_남의_것을_빼고_큰_것부터다(
    two_devices: TestClient,
) -> None:
    client = two_devices
    cash_key = _seed(client)  # 삼성전자 2주를 500,000원에 산 기록이 이번 달에 있다.
    stock_key = next(
        item["item_key"]
        for item in client.get(ASSETS, headers=AUTH).json()["items"]
        if item["label"] == "삼성전자"
    )
    _tx(client, "300000", asset_item_key=cash_key)
    _tx(client, "100000", asset_item_key=cash_key)
    # 판 것, 지출, 어디에 없는 이체는 모은 돈이 아니다.
    _tx(client, "350000", asset_item_key=stock_key, asset_side="sell", asset_quantity="1")
    _tx(client, "900000", kind="expense")
    _tx(client, "800000")
    # 다른 사람이 같은 달에 더 크게 모아도 안 보인다.
    others = [{"group": "cash", "label": "남의 통장", "amount": "0"}]
    put = client.put(ASSETS, json={"items": others}, headers=OTHER)
    other = put.json()["items"][0]["item_key"]
    res = client.post(
        TX,
        json={
            "occurred_at": _now(),
            "amount": "5000000",
            "type": "transfer",
            "asset_item_key": other,
        },
        headers=OTHER,
    )
    assert res.status_code == 201, res.text

    body = _analysis(client)

    # 500,000 + 400,000 = 900,000. 500,000 / 900,000 = 55.6%, 400,000 / 900,000 = 44.4%
    assert [
        (row["label"], row["group"], row["kind"], row["amount"], row["ratio"])
        for row in body["saved_items"]
    ] == [
        ("삼성전자", "investment", "stock", "500000", "55.6"),
        ("청년도약계좌", "cash", None, "400000", "44.4"),
    ]
    assert body["saving"]["saved"] == "900000"
    assert [
        (row["amount"], row["asset_label"], row["asset_item_key"]) for row in body["large_saves"]
    ] == [
        ("500000", "삼성전자", stock_key),
        ("300000", "청년도약계좌", cash_key),
        ("100000", "청년도약계좌", cash_key),
    ]
    assert body["saved_trend"][-1]["amount"] == "900000"


def test_큰_기록은_다섯_줄까지고_지난달_기록은_이번_달_칸에_안_들고_지난달_막대에_든다(
    client: TestClient,
) -> None:
    key = _put(client, [{"group": "cash", "label": "적금", "amount": "0"}])["items"][0]["item_key"]
    for amount in ("10000", "20000", "30000", "40000", "50000", "60000"):
        _tx(client, amount, asset_item_key=key)
    last_month = datetime.combine(_month_start(1).replace(day=15), datetime.min.time(), KST)
    res = client.post(
        TX,
        json={
            "occurred_at": last_month.replace(hour=12).isoformat(),
            "amount": "700000",
            "type": "transfer",
            "asset_item_key": key,
        },
        headers=AUTH,
    )
    assert res.status_code == 201, res.text

    body = _analysis(client)

    assert [row["amount"] for row in body["large_saves"]] == [
        "60000",
        "50000",
        "40000",
        "30000",
        "20000",
    ]
    assert [(row["label"], row["amount"]) for row in body["saved_items"]] == [("적금", "210000")]
    assert [point["amount"] for point in body["saved_trend"]] == [
        "0",
        "0",
        "0",
        "0",
        "700000",
        "210000",
    ]


def _drop(client: TestClient, keep: str) -> None:
    items = client.get(ASSETS, headers=AUTH).json()["items"]
    _put(
        client,
        [
            {key: item[key] for key in ("group", "label", "amount", "item_key")}
            for item in items
            if item["item_key"] == keep
        ],
    )


def test_지운_항목에_모은_돈도_빠지지_않고_남은_줄이_있으면_그_이름으로_부른다(
    client: TestClient, db: Session
) -> None:
    body = _put(
        client,
        [
            {"group": "cash", "label": "통장", "amount": "0"},
            {"group": "cash", "label": "옛 적금", "amount": "0"},
        ],
    )
    keep, gone = (row["item_key"] for row in body["items"])
    _tx(client, "200000", asset_item_key=gone)
    # 지난 스냅샷에 남은 줄이 있으면 그 이름이다.
    snapshot = db.scalar(select(AssetSnapshot))
    assert snapshot is not None
    snapshot.effective_on = date.today() - timedelta(days=40)
    db.commit()
    _drop(client, keep)

    saved = _analysis(client)["saved_items"]

    assert [(row["label"], row["group"], row["amount"]) for row in saved] == [
        ("옛 적금", "cash", "200000")
    ]


def test_같은_날_지운_항목은_이름_없이_남아_모은_돈_합과_맞는다(client: TestClient) -> None:
    body = _put(
        client,
        [
            {"group": "cash", "label": "통장", "amount": "0"},
            {"group": "cash", "label": "옛 적금", "amount": "0"},
        ],
    )
    keep, gone = (row["item_key"] for row in body["items"])
    _tx(client, "200000", asset_item_key=gone)
    _tx(client, "100000", asset_item_key=keep)
    _drop(client, keep)

    body = _analysis(client)

    assert [(row["label"], row["group"], row["amount"]) for row in body["saved_items"]] == [
        (None, None, "200000"),
        ("통장", "cash", "100000"),
    ]
    assert body["saving"]["saved"] == "300000"
