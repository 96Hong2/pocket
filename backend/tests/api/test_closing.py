"""월간 결산: 판정이 실제 거래를 지나 그대로 나오는지.

판정 자체는 tests/domain/test_closing.py 가 덮는다. 여기서 보는 것은 배선이다.
어느 달을 세는지, 예산·목표·무지출일이 정말 그 달 것과 이어지는지가 화면으로는
한참 뒤에야 드러난다. 지난달 예산은 API 로 저장할 수 없어 DB 에 직접 심는다.
"""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.period import BudgetPeriod
from app.models import Budget, User
from app.modules import ledger

AUTH = {"X-Anon-Key": "test-anon-key"}
TZ = ZoneInfo(ledger.DEFAULT_TIMEZONE)

TODAY = datetime.now(TZ).date()
THIS_MONTH = BudgetPeriod.containing(TODAY)
LAST_MONTH = THIS_MONTH.previous_period()
TWO_MONTHS_AGO = LAST_MONTH.previous_period()


def _day(period: BudgetPeriod, day_of_month: int) -> date:
    """그 달에 없는 날짜(2월 31일)는 말일로 붙인다."""
    return period.start.replace(day=min(day_of_month, period.total_days))


def _at(period: BudgetPeriod, day_of_month: int) -> str:
    """그 달 며칟날 정오. 정오라야 시간대가 바뀌어도 귀속 달이 안 흔들린다."""
    return datetime.combine(_day(period, day_of_month), time(hour=12), tzinfo=TZ).isoformat()


def _add(
    client: TestClient,
    *,
    amount: str,
    when: str,
    kind: str = "expense",
    category_id: str | None = None,
    source: str = "keypad",
) -> None:
    response = client.post(
        "/api/v1/transactions",
        json={
            "occurred_at": when,
            "amount": amount,
            "type": kind,
            "source": source,
            "confidence": 1,
            "excluded_from_budget": False,
            "category_id": category_id,
        },
        headers=AUTH,
    )
    assert response.status_code == 201, response.text


def _closing(client: TestClient, period: BudgetPeriod) -> dict:
    response = client.get(
        f"/api/v1/reports/closing?year={period.start.year}&month={period.start.month}",
        headers=AUTH,
    )
    assert response.status_code == 200, response.text
    return response.json()


def _category(client: TestClient, name: str) -> str:
    body = client.get("/api/v1/categories", headers=AUTH).json()
    return next(item["id"] for item in body["items"] if item["name"] == name)


def _kinds(body: dict) -> list[str]:
    return [item["kind"] for item in body["highlights"]]


@pytest.fixture
def user(client: TestClient, db: Session) -> User:
    """첫 요청이 곧 가입이다. 예산을 심으려면 사용자가 먼저 있어야 한다."""
    client.get("/api/v1/categories", headers=AUTH)
    row = db.scalar(select(User))
    assert row is not None
    return row


def _seed_budget(db: Session, user: User, period: BudgetPeriod, amount: str) -> None:
    """끝난 달 예산을 직접 심는다. 지난 기간은 API 로 저장할 수 없다."""
    db.add(
        Budget(
            user_id=user.id,
            period_start=period.start,
            period_end=period.end,
            amount=Decimal(amount),
        )
    )
    db.commit()


def test_끝난_달만_결산한다(client: TestClient, default_categories) -> None:
    _add(client, amount="10000", when=_at(LAST_MONTH, 3))
    _add(client, amount="10000", when=_at(THIS_MONTH, 1))

    assert _closing(client, LAST_MONTH)["is_closed"] is True
    # 아직 지나는 중인 달은 마지막 날 저녁에 쓴 돈이 아직 안 적혔다.
    assert _closing(client, THIS_MONTH)["is_closed"] is False


def test_기록이_없는_달은_돌아볼_것이_없다(client: TestClient, default_categories) -> None:
    body = _closing(client, LAST_MONTH)

    assert body["has_any_transaction"] is False
    assert body["highlights"] == []
    assert body["change"] is None
    assert body["next"] is None
    assert body["flow"]["recorded_days"] == 0


def test_예산_안에서_마친_달은_남긴_돈을_함께_준다(
    client: TestClient, db: Session, user: User, default_categories
) -> None:
    _seed_budget(db, user, LAST_MONTH, "300000")
    _add(client, amount="240000", when=_at(LAST_MONTH, 5))

    body = _closing(client, LAST_MONTH)

    assert _kinds(body)[0] == "within_budget"
    assert body["highlights"][0]["amount"] == "60000"


def test_분류가_줄면_잘한_것으로_늘면_살펴볼_변화로_간다(
    client: TestClient, default_categories
) -> None:
    food = _category(client, "식비")
    cafe = _category(client, "카페·간식")
    _add(client, amount="300000", when=_at(TWO_MONTHS_AGO, 5), category_id=food)
    _add(client, amount="47300", when=_at(TWO_MONTHS_AGO, 6), category_id=cafe)
    _add(client, amount="200000", when=_at(LAST_MONTH, 5), category_id=food)
    _add(client, amount="90000", when=_at(LAST_MONTH, 6), category_id=cafe)

    body = _closing(client, LAST_MONTH)

    assert _kinds(body)[0] == "category_decrease"
    assert body["highlights"][0]["category_id"] == food
    assert body["highlights"][0]["amount"] == "100000"
    assert body["highlights"][0]["previous"] == "300000"

    assert body["change"]["category_id"] == cafe
    assert body["change"]["delta"] == "42700"
    # 다음 달 한도는 지난달 금액을 1,000원 단위로 올린 값이다.
    assert body["next"] == {
        "kind": "category_cap",
        "category_id": cafe,
        "suggested_cap": "48000",
    }


def test_안_쓴_날과_옮긴_돈이_그_달_것만_실린다(client: TestClient, default_categories) -> None:
    _add(client, amount="0", when=_at(LAST_MONTH, 4), source="no_spend")
    _add(client, amount="10000", when=_at(LAST_MONTH, 5))
    _add(client, amount="700000", when=_at(LAST_MONTH, 6), kind="transfer")
    # 이번 달 무지출일은 지난달 결산에 안 들어간다.
    _add(client, amount="0", when=_at(THIS_MONTH, 1), source="no_spend")

    body = _closing(client, LAST_MONTH)

    assert _kinds(body) == ["no_spend_days"]
    # 안 쓴 날 표시를 남긴 날과, 옮기기만 하고 쓰지는 않은 날 둘이다.
    assert body["highlights"][0]["count"] == 2
    # 이체만 있는 날도 적은 날이다. 집계에서 빠지는 것과 안 적은 것은 다르다.
    assert body["flow"]["recorded_days"] == 3
    assert body["flow"]["transfer"] == "700000"
    assert body["flow"]["expense"] == "10000"


def test_목표로_옮긴_돈은_그_달_기여만_센다(client: TestClient, default_categories) -> None:
    _add(client, amount="10000", when=_at(LAST_MONTH, 5))
    created = client.post(
        "/api/v1/goals",
        json={"title": "제주도 여행", "target_amount": "5000000"},
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    goal_id = created.json()["goal"]["id"]
    for period, day_of_month, amount in (
        (LAST_MONTH, 10, "300000"),
        (THIS_MONTH, 1, "500000"),
    ):
        response = client.post(
            f"/api/v1/goals/{goal_id}/contributions",
            json={"amount": amount, "occurred_on": _day(period, day_of_month).isoformat()},
            headers=AUTH,
        )
        assert response.status_code == 201, response.text

    body = _closing(client, LAST_MONTH)

    assert _kinds(body) == ["goal_contribution"]
    assert body["highlights"][0]["amount"] == "300000"
