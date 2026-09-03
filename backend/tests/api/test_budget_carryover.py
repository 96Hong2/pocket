"""자동 이어쓰기가 실제 API 를 지나 그대로 나오는지.

판단 자체는 tests/domain/test_carryover.py 가 덮는다. 여기서 보는 것은 배선이다.
새 달의 첫 조회가 예산을 만들어 주지 못하면 사용자는 달이 바뀔 때마다 예산을 다시 정해야 하고,
반대로 아무 달에나 만들어 주면 넘겨보기만 해도 없던 예산이 생긴다. 둘 다 화면으로는 늦게 드러난다.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.period import BudgetPeriod
from app.models import Budget, Category, CategoryBudget, User
from app.modules import ledger

AUTH = {"X-Anon-Key": "test-anon-key"}

TODAY = datetime.now(ZoneInfo(ledger.DEFAULT_TIMEZONE)).date()
THIS_MONTH = BudgetPeriod.containing(TODAY)
LAST_MONTH = THIS_MONTH.previous_period()
NEXT_MONTH = THIS_MONTH.next_period()


def _query(period: BudgetPeriod) -> str:
    return f"year={period.start.year}&month={period.start.month}"


@pytest.fixture
def user(client: TestClient, db: Session) -> User:
    """첫 요청이 곧 가입이다. 예산을 심으려면 사용자가 먼저 있어야 한다."""
    client.get("/api/v1/categories", headers=AUTH)
    row = db.scalar(select(User))
    assert row is not None
    return row


def _seed_last_month(
    db: Session,
    user: User,
    amount: str = "600000",
    category_budgets: tuple[tuple[Category, str], ...] = (),
) -> Budget:
    """지난달 예산을 직접 심는다. 지난 기간은 API 로 저장할 수 없다."""
    row = Budget(
        user_id=user.id,
        period_start=LAST_MONTH.start,
        period_end=LAST_MONTH.end,
        amount=Decimal(amount),
    )
    db.add(row)
    db.flush()
    for category, limit in category_budgets:
        db.add(CategoryBudget(budget_id=row.id, category_id=category.id, amount=Decimal(limit)))
    db.commit()
    return row


def _category(db: Session, name: str) -> Category:
    row = db.scalar(select(Category).where(Category.name == name))
    assert row is not None
    return row


def _budget_rows(db: Session) -> list[Budget]:
    return list(db.scalars(select(Budget).order_by(Budget.period_start)))


# ── 네 갈래 ─────────────────────────────────────────────


def test_이번_달_예산이_없으면_지난달_금액을_그대로_가져온다(
    client: TestClient, db: Session, user: User
) -> None:
    """달이 바뀌었다고 알려 줄 사용자 동작이 없다.

    첫 조회가 만들어 주지 못하면 사용자에게는 예산이 사라진 것처럼 보인다.
    """
    _seed_last_month(db, user, "600000")

    body = client.get(f"/api/v1/budgets?{_query(THIS_MONTH)}", headers=AUTH).json()
    assert body["budget"]["amount"] == "600000"
    # 배너를 띄우는 근거다. 사용자가 정한 예산과 구분되어야 한다.
    assert body["budget"]["is_auto_carried"] is True


def test_이어쓰기는_카테고리_예산까지_함께_가져온다(
    client: TestClient, db: Session, user: User, default_categories: list[Category]
) -> None:
    """금액만 넘어오면 카테고리 한도를 매달 다시 정해야 한다."""
    food = _category(db, "식비")
    cafe = _category(db, "카페·간식")
    _seed_last_month(db, user, "600000", ((food, "300000"), (cafe, "100000")))

    rows = client.get(f"/api/v1/budgets?{_query(THIS_MONTH)}", headers=AUTH).json()[
        "category_budgets"
    ]
    assert [(r["category_id"], r["amount"]) for r in rows] == [
        (str(food.id), "300000"),
        (str(cafe.id), "100000"),
    ]


def test_지운_카테고리의_한도는_넘어오지_않는다(
    client: TestClient, db: Session, user: User, default_categories: list[Category]
) -> None:
    """이름도 아이콘도 없는 줄이 넘어오면 화면이 그 행을 그리지 못한다."""
    food = _category(db, "식비")
    cafe = _category(db, "카페·간식")
    _seed_last_month(db, user, "600000", ((food, "300000"), (cafe, "100000")))
    cafe.deleted_at = datetime.now(UTC)
    db.commit()

    rows = client.get(f"/api/v1/budgets?{_query(THIS_MONTH)}", headers=AUTH).json()[
        "category_budgets"
    ]
    assert [r["category_id"] for r in rows] == [str(food.id)]


def test_이번_달_예산이_이미_있으면_덮어쓰지_않는다(
    client: TestClient, db: Session, user: User
) -> None:
    """조회할 때마다 지난달 금액으로 되돌아가면 이번 달에 정한 예산이 사라진다."""
    _seed_last_month(db, user, "600000")
    client.put(f"/api/v1/budgets?{_query(THIS_MONTH)}", json={"amount": "400000"}, headers=AUTH)

    body = client.get(f"/api/v1/budgets?{_query(THIS_MONTH)}", headers=AUTH).json()
    assert body["budget"]["amount"] == "400000"
    # 사용자가 직접 정했으니 배너가 사라져야 한다.
    assert body["budget"]["is_auto_carried"] is False


def test_지난달_예산이_없으면_아무것도_만들지_않는다(client: TestClient, db: Session) -> None:
    """예산을 한 번도 정하지 않은 사용자에게 예산 화면이 저절로 생기면 안 된다."""
    body = client.get(f"/api/v1/budgets?{_query(THIS_MONTH)}", headers=AUTH).json()
    assert body["budget"]["amount"] is None
    assert body["budget"]["is_auto_carried"] is False
    assert _budget_rows(db) == []


def test_자동_이어쓰기를_끄면_만들어지지_않는다(
    client: TestClient, db: Session, user: User
) -> None:
    """설정 한 줄이 이어쓰기를 끄는 유일한 방법이다. 안 먹으면 끌 수가 없다."""
    default = client.get("/api/v1/preferences", headers=AUTH)
    assert default.status_code == 200, default.text
    assert default.json()["budget_auto_carryover"] is True

    off = client.patch("/api/v1/preferences", json={"budget_auto_carryover": False}, headers=AUTH)
    assert off.json()["budget_auto_carryover"] is False
    _seed_last_month(db, user, "600000")

    body = client.get(f"/api/v1/budgets?{_query(THIS_MONTH)}", headers=AUTH).json()
    assert body["budget"]["amount"] is None
    assert [row.period_start for row in _budget_rows(db)] == [LAST_MONTH.start]


def test_이어써진_예산을_지우면_다시_조회해도_되살아나지_않는다(
    client: TestClient, db: Session, user: User
) -> None:
    """지운 자리에 남은 표시가 이어쓰기를 막는다. 없으면 지워도 다음 조회에 다시 생긴다."""
    _seed_last_month(db, user, "600000")
    client.get(f"/api/v1/budgets?{_query(THIS_MONTH)}", headers=AUTH)

    deleted = client.request("DELETE", f"/api/v1/budgets?{_query(THIS_MONTH)}", headers=AUTH)
    assert deleted.status_code == 204, deleted.text

    body = client.get(f"/api/v1/budgets?{_query(THIS_MONTH)}", headers=AUTH).json()
    assert body["budget"]["amount"] is None
    assert body["category_budgets"] == []


# ── 다른 달을 넘겨볼 때 ─────────────────────────────────


def test_다음_달과_지난_달을_조회해도_예산이_생기지_않는다(
    client: TestClient, db: Session, user: User
) -> None:
    """이어쓰기는 오늘이 속한 기간에서만 일어난다. 넘겨보기만 해도 생기면 유령 예산이 쌓인다."""
    _seed_last_month(db, user, "600000")

    ahead = client.get(f"/api/v1/budgets?{_query(NEXT_MONTH)}", headers=AUTH).json()
    far_past = client.get("/api/v1/budgets?year=2020&month=1", headers=AUTH).json()

    assert ahead["budget"]["amount"] is None
    assert far_past["budget"]["amount"] is None
    assert [row.period_start for row in _budget_rows(db)] == [LAST_MONTH.start]


def test_거래를_저장해도_같은_이어쓰기_결과를_본다(
    client: TestClient, db: Session, user: User
) -> None:
    """저장 응답만 보고 홈을 갱신한다. 여기만 배너 상태를 잃으면 홈이 잠깐 다른 말을 한다."""
    _seed_last_month(db, user, "600000")

    created = client.post(
        "/api/v1/transactions",
        json={
            "occurred_at": f"{TODAY.isoformat()}T12:30:00+09:00",
            "amount": "12000",
            "type": "expense",
            "merchant": "테스트 식당",
            "source": "keypad",
        },
        headers=AUTH,
    ).json()

    fetched = client.get(f"/api/v1/budgets?{_query(THIS_MONTH)}", headers=AUTH).json()["budget"]
    assert created["budget"] == fetched
    assert created["budget"]["amount"] == "600000"
    assert created["budget"]["is_auto_carried"] is True
