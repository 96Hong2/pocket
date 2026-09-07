"""목표 기반 생활비 제안이 지난달에서 어림하고, 아무것도 저장하지 않는지.

'오늘' 이 걸린 값(기한까지 매달 모을 돈)을 보므로 `ledger.today_for` 를 묶어 둔 다음에
본다. 묶지 않으면 달이 바뀌는 순간 기대값이 흔들린다.
"""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category
from app.modules import ledger

AUTH = {"X-Anon-Key": "test-anon-key"}
SUGGESTION = "/api/v1/budgets/suggestion"

# 고정된 오늘. 이 날 기준으로 12월 31일까지는 이번 달을 포함해 네 달이다.
PINNED = date(2026, 9, 3)
PERIOD = "year=2026&month=9"
# 어림값이 나오는 기간. 위 기준의 지난달이다.
BASIS = "2026-08"
# 이미 끝난 달. 어느 시점에 돌려도 과거다.
CLOSED_PERIOD = "year=2020&month=1"

TAKE_HOME = 3_000_000
FIXED_COSTS = 900_000
# 남은 4,000,000 을 네 달로 나눈다. 모자라면 안 되므로 올림이다.
GOAL_SAVING = 1_000_000


@pytest.fixture
def pinned_today(monkeypatch: pytest.MonkeyPatch) -> date:
    monkeypatch.setattr(ledger, "today_for", lambda user: PINNED)
    return PINNED


def _seed_last_month(client: TestClient, db: Session) -> None:
    """지난달 수입과 '주거·고정비' 지출. 다른 분류 지출도 한 건 섞어 둔다.

    섞어 두지 않으면 고정비 추정이 그 달 지출 전체를 세고 있어도 초록이다.
    """
    _add(client, "income", TAKE_HOME, day=15)
    _add(client, "expense", FIXED_COSTS, day=20, category=_category_id(db, "주거·고정비"))
    _add(client, "expense", 500_000, day=21, category=_category_id(db, "식비"))


def _add(
    client: TestClient, kind: str, amount: int, *, day: int, category: str | None = None
) -> None:
    res = client.post(
        "/api/v1/transactions",
        json={
            "occurred_at": f"{BASIS}-{day:02d}T12:00:00+09:00",
            "amount": str(amount),
            "type": kind,
            "source": "keypad",
            "category_id": category,
        },
        headers=AUTH,
    )
    assert res.status_code == 201, res.text


def _category_id(db: Session, name: str) -> str:
    row = db.scalar(select(Category).where(Category.name == name))
    assert row is not None
    return str(row.id)


def _goal(client: TestClient, *, deadline: str | None = "2026-12-31") -> None:
    res = client.post(
        "/api/v1/goals",
        json={"title": "제주도 여행", "target_amount": "4000000", "target_date": deadline},
        headers=AUTH,
    )
    assert res.status_code == 201, res.text


def _show(client: TestClient, query: str = "") -> dict:
    res = client.get(f"{SUGGESTION}?{PERIOD}{query}", headers=AUTH)
    assert res.status_code == 200, res.text
    return dict(res.json())


def test_지난달_수입과_고정비로_어림해서_제안한다(
    client: TestClient, db: Session, default_categories: list[Category], pinned_today: date
) -> None:
    _seed_last_month(client, db)
    _goal(client)

    body = _show(client)

    assert body["available"] is True
    assert body["goal_saving"] == str(GOAL_SAVING)
    assert body["take_home"] == {
        "amount": str(TAKE_HOME),
        "source": "estimated",
        "basis_start": f"{BASIS}-01",
        "basis_end": f"{BASIS}-31",
    }
    # 그 달 지출 전체(1,400,000)가 아니라 '주거·고정비' 만 센다.
    assert body["fixed_costs"]["amount"] == str(FIXED_COSTS)
    assert body["suggested"] == str(TAKE_HOME - GOAL_SAVING - FIXED_COSTS)
    assert body["reason"] is None


def test_질의로_준_값은_추정값_자리를_대신하고_근거_기간을_달지_않는다(
    client: TestClient, db: Session, default_categories: list[Category], pinned_today: date
) -> None:
    _seed_last_month(client, db)
    _goal(client)

    body = _show(client, "&take_home=3500000")

    assert body["take_home"] == {
        "amount": "3500000",
        "source": "given",
        "basis_start": None,
        "basis_end": None,
    }
    # 고정비는 안 줬으니 그대로 어림값이다. 한 칸만 고쳐도 나머지는 근거를 잃지 않는다.
    assert body["fixed_costs"]["source"] == "estimated"
    assert body["suggested"] == str(3_500_000 - GOAL_SAVING - FIXED_COSTS)


def test_제안을_조회해도_예산이_생기지_않는다(
    client: TestClient, db: Session, default_categories: list[Category], pinned_today: date
) -> None:
    """화면을 열어 본 것만으로 예산이 정해지면 사용자가 정하지 않은 숫자가 굳는다."""
    _seed_last_month(client, db)
    _goal(client)

    _show(client)

    budget = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()["budget"]
    assert budget["amount"] is None


def test_목표가_없으면_제안하지_않지만_어림값은_그대로_알려준다(
    client: TestClient, db: Session, default_categories: list[Category], pinned_today: date
) -> None:
    _seed_last_month(client, db)

    body = _show(client)

    assert body["available"] is False
    assert body["reason"] == "no_goal"
    assert body["suggested"] is None
    assert body["goal_saving"] is None
    assert body["take_home"]["amount"] == str(TAKE_HOME)


def test_기한이_없는_목표면_한_달_몫을_나눌_수_없어_제안하지_않는다(
    client: TestClient, db: Session, default_categories: list[Category], pinned_today: date
) -> None:
    _seed_last_month(client, db)
    _goal(client, deadline=None)

    body = _show(client)

    assert body["available"] is False
    assert body["reason"] == "no_deadline"


def test_끝난_달은_목표가_있어도_제안하지_않는다(client: TestClient) -> None:
    _goal(client)

    res = client.get(f"{SUGGESTION}?{CLOSED_PERIOD}", headers=AUTH)

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["available"] is False
    assert body["reason"] == "closed_period"


def test_지난달에_아무것도_없으면_어림값이_0_이고_짐작으로_메우지_않는다(
    client: TestClient, default_categories: list[Category], pinned_today: date
) -> None:
    _goal(client)

    body = _show(client)

    assert body["take_home"] == {
        "amount": "0",
        "source": "estimated",
        "basis_start": f"{BASIS}-01",
        "basis_end": f"{BASIS}-31",
    }
    assert body["fixed_costs"]["amount"] == "0"
    # 실수령이 0 이면 목표와 고정비를 뺄 것이 없다. 음수로 두지 않는다.
    assert body["suggested"] == "0"


def test_원_단위가_아닌_금액은_받지_않는다(client: TestClient) -> None:
    """소수를 받으면 제안액도 소수가 되고, 그 값으로 예산을 저장하면 저장 쪽이 거절한다."""
    res = client.get(f"{SUGGESTION}?{PERIOD}&take_home=1000.5", headers=AUTH)

    assert res.status_code == 422, res.text
