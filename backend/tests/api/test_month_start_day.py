"""한 달 시작일: 예산·리포트·결산은 사용자의 기간을, 달력과 공유 가계부는 달력 월을 본다.

기간 계산 자체는 tests/domain/test_period.py 의 표가 덮는다. 여기서 보는 것은 배선이다.
엔드포인트마다 어느 기간을 세는지, 시작일을 바꿀 때 예산 줄이 같은 이름 달로 따라오는지.
오늘은 2026년 10월 5일(월요일)로 묶는다. 시작일 25 면 「10월」 은 9월 25일 ~ 10월 24일이다.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable, Iterator
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.integrations.email.factory import get_email_sender
from app.models import Budget, CategoryBudget, User
from app.modules import ledger

AUTH = {"X-Anon-Key": "test-anon-key"}
OTHER = {"X-Anon-Key": "second-device-key"}
TZ = ZoneInfo(ledger.DEFAULT_TIMEZONE)
TODAY = date(2026, 10, 5)

Pin = Callable[[date], None]


@pytest.fixture
def pin(monkeypatch: pytest.MonkeyPatch) -> Pin:
    def _pin(day: date) -> None:
        monkeypatch.setattr(ledger, "today_for", lambda user: day)

    _pin(TODAY)
    return _pin


def _start_day(client: TestClient, value: Any, headers: dict[str, str] = AUTH) -> Any:
    return client.patch("/api/v1/preferences", json={"month_start_day": value}, headers=headers)


def _set_start_day(client: TestClient, value: int, headers: dict[str, str] = AUTH) -> None:
    response = _start_day(client, value, headers)
    assert response.status_code == 200, response.text
    assert response.json()["month_start_day"] == value


def _add(
    client: TestClient,
    day: date,
    amount: int,
    *,
    kind: str = "expense",
    category_id: str | None = None,
    asset_item_key: str | None = None,
) -> dict:
    body: dict[str, object] = {
        "occurred_at": datetime.combine(day, time(hour=12), tzinfo=TZ).isoformat(),
        "amount": str(amount),
        "type": kind,
        "source": "keypad",
        "confidence": 1,
        "excluded_from_budget": False,
    }
    if category_id:
        body["category_id"] = category_id
    if asset_item_key:
        body["asset_item_key"] = asset_item_key
    response = client.post("/api/v1/transactions", json=body, headers=AUTH)
    assert response.status_code == 201, response.text
    return response.json()


def _get(client: TestClient, path: str, headers: dict[str, str] = AUTH) -> dict:
    response = client.get(path, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _put_budget(
    client: TestClient, amount: int, query: str = "", headers: dict[str, str] = AUTH
) -> dict:
    response = client.put(f"/api/v1/budgets{query}", json={"amount": str(amount)}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _put_category_budget(
    client: TestClient,
    category_id: str,
    amount: int,
    query: str = "",
    headers: dict[str, str] = AUTH,
) -> None:
    response = client.put(
        f"/api/v1/budgets/categories/{category_id}{query}",
        json={"amount": str(amount)},
        headers=headers,
    )
    assert response.status_code == 200, response.text


def _category_amounts(body: dict) -> list[tuple[str, str]]:
    return sorted((row["category_id"], row["amount"]) for row in body["category_budgets"])


def _category(client: TestClient, name: str) -> str:
    body = _get(client, "/api/v1/categories")
    return next(item["id"] for item in body["items"] if item["name"] == name)


def _span(body: dict) -> tuple[str, str, str]:
    return (body["period_start"], body["period_end"], body["period_key"])


def _budget_rows(db: Session) -> list[tuple[date, date, Decimal, bool]]:
    db.expire_all()
    rows = db.scalars(select(Budget).order_by(Budget.period_start))
    return [(r.period_start, r.period_end, r.amount, r.deleted_at is not None) for r in rows]


# ── 설정 ────────────────────────────────────────────────


def test_시작일_기본값은_1이고_바꾸면_그대로_남는다(client: TestClient) -> None:
    assert _get(client, "/api/v1/preferences")["month_start_day"] == 1

    _set_start_day(client, 25)

    assert _get(client, "/api/v1/preferences")["month_start_day"] == 25


@pytest.mark.parametrize("value", [1, 28])
def test_시작일은_1부터_28까지_받는다(client: TestClient, value: int) -> None:
    _set_start_day(client, value)

    assert _get(client, "/api/v1/preferences")["month_start_day"] == value


@pytest.mark.parametrize("value", [0, 29, 31, -1, "열", 25.5, True])
def test_범위_밖_시작일은_422(client: TestClient, value: Any) -> None:
    assert _start_day(client, value).status_code == 422
    assert _get(client, "/api/v1/preferences")["month_start_day"] == 1


def test_시작일을_빼거나_null이면_그대로_둔다(client: TestClient) -> None:
    _set_start_day(client, 25)

    assert _start_day(client, None).json()["month_start_day"] == 25
    other = {"home_hero": "income_expense"}
    patched = client.patch("/api/v1/preferences", json=other, headers=AUTH)
    assert patched.json()["month_start_day"] == 25


# ── 리포트 ──────────────────────────────────────────────


def test_리포트는_시작일로_자른_기간과_흐름과_같은_날수_비교를_싣는다(
    client: TestClient, pin: Pin, default_categories: object
) -> None:
    _set_start_day(client, 25)
    _add(client, date(2026, 8, 26), 8_000)  # 9월 기간, 같은 날수 창 안(8/25 ~ 9/4)
    _add(client, date(2026, 9, 10), 16_000)  # 9월 기간, 창 밖
    _add(client, date(2026, 9, 24), 1_000)  # 9월 기간 마지막 날
    _add(client, date(2026, 9, 25), 2_000)  # 10월 기간 첫날
    _add(client, date(2026, 10, 5), 4_000)

    body = _get(client, "/api/v1/reports/monthly")

    assert _span(body) == ("2026-09-25", "2026-10-24", "2026-10")
    assert body["month_expense"] == "6000"
    assert [point["period_key"] for point in body["trend"]] == [
        "2026-05",
        "2026-06",
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10",
    ]
    assert _span(body["trend"][4]) == ("2026-08-25", "2026-09-24", "2026-09")
    assert body["trend"][4]["expense"] == "25000"
    comparison = body["comparison"]
    assert (comparison["current_start"], comparison["current_end"]) == ("2026-09-25", "2026-10-05")
    assert (comparison["previous_start"], comparison["previous_end"]) == (
        "2026-08-25",
        "2026-09-04",
    )
    assert (comparison["current_expense"], comparison["previous_expense"]) == ("6000", "8000")
    # 지난주 비교는 시작일과 상관없이 주다. 10월 5일은 월요일이라 하루짜리 창이다.
    assert (body["weeks"]["current_start"], body["weeks"]["current_end"]) == (
        "2026-10-05",
        "2026-10-05",
    )

    assert _get(client, "/api/v1/reports/monthly?year=2026&month=10") == body
    september = _get(client, "/api/v1/reports/monthly?year=2026&month=9")
    assert _span(september) == ("2026-08-25", "2026-09-24", "2026-09")
    assert september["month_expense"] == "25000"


def test_분류_펼치기는_리포트와_같은_시작일_기간을_센다(
    client: TestClient, pin: Pin, default_categories: object
) -> None:
    _set_start_day(client, 25)
    food = _category(client, "식비")
    _add(client, date(2026, 9, 24), 1_000, category_id=food)  # 9월 기간 마지막 날
    first = _add(client, date(2026, 9, 25), 2_000, category_id=food)  # 10월 기간 첫날
    last = _add(client, date(2026, 10, 24), 4_000, category_id=food)  # 10월 기간 마지막 날
    _add(client, date(2026, 10, 25), 8_000, category_id=food)  # 11월 기간 첫날
    pin(date(2026, 10, 26))

    report = _get(client, "/api/v1/reports/monthly?year=2026&month=10")
    row = next(r for r in report["expense_breakdown"] if r["category_id"] == food)
    body = _get(client, f"/api/v1/reports/category?year=2026&month=10&tab=expense&key={food}")

    assert _span(body) == ("2026-09-25", "2026-10-24", "2026-10")
    assert _span(body) == _span(report)
    assert body["total"] == row["amount"] == "6000"
    ids = [tx["id"] for tx in body["transactions"]]
    assert ids == [last["transaction"]["id"], first["transaction"]["id"]]
    # 질의 없이 부르면 오늘(10월 26일)이 든 「11월」 기간이다.
    current = _get(client, f"/api/v1/reports/category?tab=expense&key={food}")
    assert _span(current) == ("2026-10-25", "2026-11-24", "2026-11")
    assert current["total"] == "8000"


def test_결산은_기간_끝이_오늘보다_앞서면_끝난_기간이다(
    client: TestClient, pin: Pin, default_categories: object
) -> None:
    _set_start_day(client, 25)
    _add(client, date(2026, 9, 24), 1_000)

    september = _get(client, "/api/v1/reports/closing?year=2026&month=9")
    assert _span(september) == ("2026-08-25", "2026-09-24", "2026-09")
    assert september["is_closed"] is True
    assert september["flow"]["expense"] == "1000"

    current = _get(client, "/api/v1/reports/closing")
    assert _span(current) == ("2026-09-25", "2026-10-24", "2026-10")
    assert current["is_closed"] is False

    pin(date(2026, 10, 25))
    assert _get(client, "/api/v1/reports/closing?year=2026&month=10")["is_closed"] is True


# ── 예산 ────────────────────────────────────────────────


def test_예산은_시작일_기간으로_남은_날을_세고_이어쓴다(
    client: TestClient, db: Session, pin: Pin, default_categories: object
) -> None:
    _set_start_day(client, 25)
    pin(date(2026, 9, 10))
    september = _put_budget(client, 200_000)["budget"]
    assert _span(september) == ("2026-08-25", "2026-09-24", "2026-09")

    pin(TODAY)
    _add(client, date(2026, 9, 24), 1_000)
    _add(client, date(2026, 9, 25), 2_000)
    current = _get(client, "/api/v1/budgets")
    budget = current["budget"]

    assert _span(budget) == ("2026-09-25", "2026-10-24", "2026-10")
    # 지난 기간 예산을 새 기간으로 이어 쓴다.
    assert (budget["amount"], budget["is_auto_carried"]) == ("200000", True)
    assert (budget["total_days"], budget["remaining_days"]) == (30, 20)
    assert budget["budgeted_spend"] == "2000"
    assert current["month_expense"] == "2000"
    assert _get(client, "/api/v1/budgets?year=2026&month=10")["budget"] == budget
    assert [(start, end) for start, end, *_ in _budget_rows(db)] == [
        (date(2026, 8, 25), date(2026, 9, 24)),
        (date(2026, 9, 25), date(2026, 10, 24)),
    ]


def test_생활비_제안은_앞_기간을_기준으로_어림한다(
    client: TestClient, pin: Pin, default_categories: object
) -> None:
    _set_start_day(client, 25)
    _add(client, date(2026, 8, 24), 9_000_000, kind="income")  # 8월 기간이라 안 센다
    _add(client, date(2026, 8, 25), 3_000_000, kind="income")

    take_home = _get(client, "/api/v1/budgets/suggestion")["take_home"]

    assert (take_home["basis_start"], take_home["basis_end"]) == ("2026-08-25", "2026-09-24")
    assert take_home["amount"] == "3000000"


def test_달력_요약의_예산_블록은_이름이_같은_달의_예산이고_달력_월에_줄을_만들지_않는다(
    client: TestClient, db: Session, pin: Pin, default_categories: object
) -> None:
    _set_start_day(client, 25)
    _put_budget(client, 300_000)
    _add(client, date(2026, 9, 26), 2_000)
    _add(client, date(2026, 10, 5), 4_000)

    summary = _get(client, "/api/v1/transactions/summary")

    assert (summary["period_start"], summary["period_end"]) == ("2026-10-01", "2026-10-31")
    assert summary["month_expense"] == "4000"
    assert _span(summary["budget"]) == ("2026-09-25", "2026-10-24", "2026-10")
    assert (summary["budget"]["amount"], summary["budget"]["budgeted_spend"]) == ("300000", "6000")
    assert summary["budget"] == _get(client, "/api/v1/budgets")["budget"]
    assert [start for start, *_ in _budget_rows(db)] == [date(2026, 9, 25)]


def test_저장_응답의_예산_블록은_기록한_날이_든_시작일_기간이다(
    client: TestClient, pin: Pin, default_categories: object
) -> None:
    _set_start_day(client, 25)
    _put_budget(client, 300_000)
    _add(client, date(2026, 9, 25), 2_000)

    saved = _add(client, date(2026, 10, 5), 4_000)["budget"]

    assert _span(saved) == ("2026-09-25", "2026-10-24", "2026-10")
    assert (saved["amount"], saved["budgeted_spend"], saved["remaining_budget"]) == (
        "300000",
        "6000",
        "294000",
    )
    assert (saved["total_days"], saved["remaining_days"]) == (30, 20)
    assert saved == _get(client, "/api/v1/budgets")["budget"]

    # 앞 기간 마지막 날에 적으면 그 기간(9월) 블록이 온다. 9월 예산은 없다.
    earlier = _add(client, date(2026, 9, 24), 1_000)["budget"]

    assert _span(earlier) == ("2026-08-25", "2026-09-24", "2026-09")
    assert (earlier["amount"], earlier["budgeted_spend"]) == (None, "1000")


def test_모은_돈과_번_돈은_시작일_기간으로_센다(client: TestClient, pin: Pin) -> None:
    _set_start_day(client, 25)
    put = client.put(
        "/api/v1/assets",
        json={"items": [{"group": "cash", "label": "청년도약계좌", "amount": "1000000"}]},
        headers=AUTH,
    )
    assert put.status_code == 200, put.text
    key = put.json()["items"][0]["item_key"]
    _add(client, date(2026, 9, 24), 9_000_000, kind="income")  # 9월 기간이라 안 센다
    _add(client, date(2026, 9, 25), 2_000_000, kind="income")

    september = _add(client, date(2026, 9, 24), 100_000, kind="transfer", asset_item_key=key)
    first = _add(client, date(2026, 9, 25), 300_000, kind="transfer", asset_item_key=key)
    latest = _add(client, date(2026, 10, 5), 50_000, kind="transfer", asset_item_key=key)

    # 저장 응답은 그 기록이 든 기간의 모은 돈이다.
    assert september["asset"]["month_saved"] == "100000"
    assert first["asset"]["month_saved"] == "300000"
    assert latest["asset"]["month_saved"] == "350000"
    saving = _get(client, "/api/v1/assets/analysis?scope=all")["saving"]
    assert (saving["saved"], saving["income"]) == ("350000", "2000000")
    assert _get(client, "/api/v1/assets")["summary"]["month_saved"] == "350000"


def test_분석의_어디에_모았나와_달마다_모은_돈과_큰_기록은_시작일_기간을_따른다(
    client: TestClient, pin: Pin
) -> None:
    _set_start_day(client, 25)
    put = client.put(
        "/api/v1/assets",
        json={"items": [{"group": "cash", "label": "적금", "amount": "0"}]},
        headers=AUTH,
    )
    assert put.status_code == 200, put.text
    key = put.json()["items"][0]["item_key"]
    _add(client, date(2026, 9, 24), 100_000, kind="transfer", asset_item_key=key)
    _add(client, date(2026, 9, 25), 300_000, kind="transfer", asset_item_key=key)
    _add(client, date(2026, 10, 5), 50_000, kind="transfer", asset_item_key=key)

    body = _get(client, "/api/v1/assets/analysis?scope=all")

    # 「10월」 은 9월 25일 ~ 10월 24일이다. 9월 24일 것은 「9월」 막대에만 든다.
    assert body["saving"]["saved"] == "350000"
    assert [(row["label"], row["amount"]) for row in body["saved_items"]] == [("적금", "350000")]
    assert [row["amount"] for row in body["large_saves"]] == ["300000", "50000"]
    trend = body["saved_trend"]
    assert [point["period_key"] for point in trend] == [
        "2026-05",
        "2026-06",
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10",
    ]
    assert (trend[0]["period_start"], trend[0]["period_end"]) == ("2026-04-25", "2026-05-24")
    assert (trend[-1]["period_start"], trend[-1]["period_end"]) == ("2026-09-25", "2026-10-24")
    assert [point["amount"] for point in trend] == ["0", "0", "0", "0", "100000", "350000"]


# ── 시작일 바꾸기 ───────────────────────────────────────


def test_시작일을_바꾸면_예산_줄이_같은_이름_달로_옮겨_간다(
    client: TestClient, db: Session, pin: Pin, default_categories: object
) -> None:
    food = _category(client, "식비")
    pin(date(2026, 9, 10))
    _put_budget(client, 100_000)
    _put_category_budget(client, food, 40_000)
    pin(TODAY)
    assert _get(client, "/api/v1/budgets")["budget"]["is_auto_carried"] is True  # 10월 이어쓰기
    _put_budget(client, 500_000, "?year=2026&month=11")

    _set_start_day(client, 25)

    assert _budget_rows(db) == [
        (date(2026, 8, 25), date(2026, 9, 24), Decimal("100000"), False),
        (date(2026, 9, 25), date(2026, 10, 24), Decimal("100000"), False),
        (date(2026, 10, 25), date(2026, 11, 24), Decimal("500000"), False),
    ]
    september = _get(client, "/api/v1/budgets?year=2026&month=9")
    assert _span(september["budget"]) == ("2026-08-25", "2026-09-24", "2026-09")
    assert [(row["category_id"], row["amount"]) for row in september["category_budgets"]] == [
        (food, "40000")
    ]
    current = _get(client, "/api/v1/budgets")
    assert _span(current["budget"]) == ("2026-09-25", "2026-10-24", "2026-10")
    assert (current["budget"]["amount"], current["budget"]["is_auto_carried"]) == ("100000", True)
    assert [row["amount"] for row in current["category_budgets"]] == ["40000"]

    # 다시 바꿔도 이름 달은 그대로다. 시작일 5 의 「10월」 은 10월 5일 ~ 11월 4일이다.
    _set_start_day(client, 5)

    assert [(start, end) for start, end, *_ in _budget_rows(db)] == [
        (date(2026, 9, 5), date(2026, 10, 4)),
        (date(2026, 10, 5), date(2026, 11, 4)),
        (date(2026, 11, 5), date(2026, 12, 4)),
    ]
    current = _get(client, "/api/v1/budgets")
    assert _span(current["budget"]) == ("2026-10-05", "2026-11-04", "2026-10")
    assert len(db.scalars(select(CategoryBudget)).all()) == 2


def test_지운_예산도_옮겨_가서_이어쓰기가_되살리지_않는다(
    client: TestClient, db: Session, pin: Pin, default_categories: object
) -> None:
    pin(date(2026, 9, 10))
    _put_budget(client, 100_000)
    pin(TODAY)
    _get(client, "/api/v1/budgets")  # 10월에 이어 쓴다
    assert client.delete("/api/v1/budgets", headers=AUTH).status_code == 204

    _set_start_day(client, 25)

    assert _get(client, "/api/v1/budgets")["budget"]["amount"] is None
    assert _budget_rows(db) == [
        (date(2026, 8, 25), date(2026, 9, 24), Decimal("100000"), False),
        (date(2026, 9, 25), date(2026, 10, 24), Decimal("100000"), True),
    ]


def test_같은_이름_달에_줄이_둘이면_살아_있는_줄_하나만_옮긴다(
    client: TestClient, db: Session, pin: Pin
) -> None:
    """시작일을 바꾸는 사이에 다른 요청이 옛 기간에 이어쓰면 이름이 같은 줄이 둘 생길 수 있다."""
    _get(client, "/api/v1/preferences")
    user = db.scalars(select(User)).one()
    db.add_all(
        [
            Budget(
                user_id=user.id,
                period_start=date(2026, 10, 1),
                period_end=date(2026, 10, 31),
                amount=Decimal("100000"),
            ),
            # 옮겨 갈 자리에 이미 앉아 있는 지운 줄.
            Budget(
                user_id=user.id,
                period_start=date(2026, 9, 25),
                period_end=date(2026, 10, 24),
                amount=Decimal("70000"),
                deleted_at=datetime(2026, 10, 1, tzinfo=TZ),
            ),
        ]
    )
    db.commit()

    _set_start_day(client, 25)

    assert _budget_rows(db) == [(date(2026, 9, 25), date(2026, 10, 24), Decimal("100000"), False)]


def test_시작일이_같으면_예산을_건드리지_않는다(client: TestClient, db: Session, pin: Pin) -> None:
    _put_budget(client, 100_000)
    before = _budget_rows(db)

    _set_start_day(client, 1)

    assert _budget_rows(db) == before


def test_시작일을_같은_값으로_다시_보내도_예산을_건드리지_않는다(
    client: TestClient, db: Session, pin: Pin
) -> None:
    _set_start_day(client, 25)
    _put_budget(client, 100_000)
    before = _budget_rows(db)
    stamps = [(row.id, row.updated_at) for row in db.scalars(select(Budget))]
    assert before == [(date(2026, 9, 25), date(2026, 10, 24), Decimal("100000"), False)]

    _set_start_day(client, 25)

    assert _budget_rows(db) == before
    assert [(row.id, row.updated_at) for row in db.scalars(select(Budget))] == stamps


def test_같은_이름_달에_줄이_둘이면_사람이_정한_줄을_남기고_없는_분류_한도만_옮겨_온다(
    client: TestClient, db: Session, pin: Pin, default_categories: object
) -> None:
    """이어쓰기 줄이 나중에 고쳐졌어도 사람이 정한 줄이 남는다.

    지우는 줄의 분류 한도는 남는 줄에 없는 분류만 채운다.
    """
    food = _category(client, "식비")
    transit = _category(client, "교통")
    user = db.scalars(select(User)).one()
    user_set = Budget(
        user_id=user.id,
        period_start=date(2026, 10, 1),
        period_end=date(2026, 10, 31),
        amount=Decimal("100000"),
        updated_at=datetime(2026, 10, 1, tzinfo=TZ),
    )
    # 옮겨 갈 자리에 이미 앉아 있는, 더 나중에 고친 이어쓰기 줄.
    carried = Budget(
        user_id=user.id,
        period_start=date(2026, 9, 25),
        period_end=date(2026, 10, 24),
        amount=Decimal("70000"),
        is_auto_carried=True,
        updated_at=datetime(2026, 10, 3, tzinfo=TZ),
    )
    db.add_all([user_set, carried])
    db.flush()
    db.add_all(
        [
            CategoryBudget(
                budget_id=user_set.id, category_id=uuid.UUID(food), amount=Decimal("40000")
            ),
            CategoryBudget(
                budget_id=carried.id, category_id=uuid.UUID(food), amount=Decimal("20000")
            ),
            CategoryBudget(
                budget_id=carried.id, category_id=uuid.UUID(transit), amount=Decimal("15000")
            ),
        ]
    )
    db.commit()

    _set_start_day(client, 25)

    assert _budget_rows(db) == [(date(2026, 9, 25), date(2026, 10, 24), Decimal("100000"), False)]
    current = _get(client, "/api/v1/budgets")
    assert (current["budget"]["amount"], current["budget"]["is_auto_carried"]) == (
        "100000",
        False,
    )
    assert _category_amounts(current) == sorted([(food, "40000"), (transit, "15000")])
    assert len(db.scalars(select(CategoryBudget)).all()) == 2


# ── 달력 월 그대로인 곳 ─────────────────────────────────


def test_달력과_내역은_시작일과_상관없이_달력_월이다(
    client: TestClient, pin: Pin, default_categories: object
) -> None:
    _set_start_day(client, 25)
    _add(client, date(2026, 9, 26), 2_000)
    _add(client, date(2026, 10, 5), 4_000)

    calendar = _get(client, "/api/v1/transactions/calendar")
    assert (calendar["period_start"], calendar["period_end"]) == ("2026-10-01", "2026-10-31")
    october = _get(client, "/api/v1/transactions/calendar?year=2026&month=10")
    assert october == calendar
    listed = _get(client, "/api/v1/transactions?year=2026&month=10")
    assert [item["amount"] for item in listed["items"]] == ["4000"]


def test_공유_가계부_리포트는_시작일과_상관없이_달력_월이다(
    two_devices: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SHARED_BOOKS_ENABLED", "true")
    get_settings.cache_clear()
    try:
        _set_start_day(two_devices, 25)
        created = two_devices.post(
            "/api/v1/books",
            json={"kind": "couple", "name": "우리 집", "settle_rule": "even", "my_name": "은홍"},
            headers=AUTH,
        )
        assert created.status_code == 201, created.text

        report = _get(two_devices, f"/api/v1/books/{created.json()['id']}/report?year=2026&month=8")

        assert (report["period_start"], report["period_end"]) == ("2026-08-01", "2026-08-31")
    finally:
        get_settings.cache_clear()


# ── 계정 합치기 ─────────────────────────────────────────

EMAIL = "someone@example.com"


@pytest.fixture
def fresh_sender() -> Iterator[None]:
    """발송 스텁은 프로세스에 하나라 테스트 사이에 비운다."""
    get_email_sender.cache_clear()
    yield
    get_email_sender.cache_clear()


def _link(client: TestClient, headers: dict[str, str]) -> dict:
    started = client.post("/api/v1/account/email/start", json={"email": EMAIL}, headers=headers)
    assert started.status_code == 204, started.text
    code = _get(client, f"/api/v1/account/email/peek?email={EMAIL}", headers)["code"]
    verified = client.post(
        "/api/v1/account/email/verify", json={"email": EMAIL, "code": str(code)}, headers=headers
    )
    assert verified.status_code == 200, verified.text
    return verified.json()


def _owner_rows(db: Session) -> list[tuple[date, date, Decimal, bool]]:
    db.expire_all()
    owner = db.scalars(select(User).where(User.deleted_at.is_(None))).one()
    rows = db.scalars(
        select(Budget).where(Budget.user_id == owner.id).order_by(Budget.period_start)
    )
    return [(r.period_start, r.period_end, r.amount, r.deleted_at is not None) for r in rows]


def test_합칠_때_시작일이_다르면_옮겨_온_예산을_남는_계정의_기간으로_옮긴다(
    two_devices: TestClient,
    db: Session,
    pin: Pin,
    default_categories: object,
    fresh_sender: None,
) -> None:
    client = two_devices
    food = _category(client, "식비")
    # 남는 계정: 시작일 25, 10월 예산과 식비 한도.
    _link(client, AUTH)
    _set_start_day(client, 25)
    _put_budget(client, 300_000)
    _put_category_budget(client, food, 40_000)
    # 합쳐지는 기기: 시작일 1, 10월과 11월 예산.
    _put_budget(client, 100_000, headers=OTHER)
    _put_budget(client, 200_000, "?year=2026&month=11", headers=OTHER)
    _put_category_budget(client, food, 30_000, "?year=2026&month=11", headers=OTHER)

    assert _link(client, OTHER)["result"] == "merged"

    # 10월은 남는 계정 것, 11월은 남는 계정의 시작일 기간으로 옮겨 왔다.
    assert _owner_rows(db) == [
        (date(2026, 9, 25), date(2026, 10, 24), Decimal("300000"), False),
        (date(2026, 10, 25), date(2026, 11, 24), Decimal("200000"), False),
    ]
    november = _get(client, "/api/v1/budgets?year=2026&month=11", OTHER)
    assert _span(november["budget"]) == ("2026-10-25", "2026-11-24", "2026-11")
    assert november["budget"]["amount"] == "200000"
    assert _category_amounts(november) == [(food, "30000")]
    october = _get(client, "/api/v1/budgets", OTHER)
    assert october["budget"]["amount"] == "300000"
    assert _category_amounts(october) == [(food, "40000")]

    # 합친 뒤 시작일을 바꿔도 남는 계정이 정한 10월 예산과 한도가 그대로다.
    _set_start_day(client, 1, headers=OTHER)

    assert _owner_rows(db) == [
        (date(2026, 10, 1), date(2026, 10, 31), Decimal("300000"), False),
        (date(2026, 11, 1), date(2026, 11, 30), Decimal("200000"), False),
    ]
    october = _get(client, "/api/v1/budgets", OTHER)
    assert _span(october["budget"]) == ("2026-10-01", "2026-10-31", "2026-10")
    assert october["budget"]["amount"] == "300000"
    assert _category_amounts(october) == [(food, "40000")]
