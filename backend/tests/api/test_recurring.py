"""반복 지출 설정과 「곧 나갈 돈」 판정.

이 기능이 지켜야 할 것은 셋이다. 거래를 스스로 만들지 않는다(사람이 누른다).
전날과 당일 이틀만 묻는다. 한 회차에 한 번만 묻는다.
"""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.domain.recurring import due_date_in, next_due_on, remind_on, should_ask
from app.models import Category, RecurringExpense, User

AUTH = {"X-Anon-Key": "test-anon-key"}
RECURRING = "/api/v1/recurring"


def _expense_category(categories: list[Category]) -> Category:
    return next(c for c in categories if c.kind.value == "expense")


def _user(client: TestClient, db: Session) -> User:
    """사용자 행은 첫 요청에 생긴다. 먼저 한 번 불러 두고 그 행을 찾는다."""
    assert client.get(RECURRING, headers=AUTH).status_code == 200
    return db.query(User).one()


# ── 날짜 규칙 (domain) ──────────────────────────────────


def test_그_달에_없는_날짜는_마지막_날로_당긴다() -> None:
    """31일에 걸어 둔 구독이 2월에 사라지면 안 된다. 그 달에도 빠져나가는 것은 사실이다."""
    assert due_date_in(2026, 2, 31) == date(2026, 2, 28)
    assert due_date_in(2028, 2, 31) == date(2028, 2, 29)
    assert due_date_in(2026, 1, 31) == date(2026, 1, 31)


def test_다음_지출일은_오늘을_포함한다() -> None:
    assert next_due_on(date(2026, 9, 25), 25) == date(2026, 9, 25)
    assert next_due_on(date(2026, 9, 26), 25) == date(2026, 10, 25)
    # 12월을 넘기면 해가 바뀐다.
    assert next_due_on(date(2026, 12, 26), 25) == date(2027, 1, 25)


@pytest.mark.parametrize(
    ("today", "asked"),
    [
        (date(2026, 9, 24), False),  # 안 고르면 전날에는 안 묻는다
        (date(2026, 9, 25), True),  # 당일
        (date(2026, 9, 26), False),  # 지나면 안 조른다
    ],
)
def test_안_고르면_당일_하루만_묻는다(today: date, asked: bool) -> None:
    got = should_ask(today, 25, last_recorded_on=None, dismissed_on=None)
    assert (got is not None) is asked


@pytest.mark.parametrize(
    ("today", "asked"),
    [
        (date(2026, 9, 23), False),  # 이틀 전이면 아직 안 묻는다
        (date(2026, 9, 24), True),  # 전날
        (date(2026, 9, 25), True),  # 당일까지 카드는 서 있다
        (date(2026, 9, 26), False),
    ],
)
def test_전날로_걸어_두면_이틀_묻는다(today: date, asked: bool) -> None:
    got = should_ask(today, 25, lead_days=1, last_recorded_on=None, dismissed_on=None)
    assert (got is not None) is asked


def test_알리는_날은_며칠_전이냐로_갈린다() -> None:
    """푸시는 **알리기로 한 그날 하루만** 울린다. 카드가 서 있는 기간과 다르다."""
    assert remind_on(date(2026, 9, 25), 0) == date(2026, 9, 25)
    assert remind_on(date(2026, 9, 25), 1) == date(2026, 9, 24)
    # 범위 밖 값이 들어와도 화면이 흔들리지 않는다.
    assert remind_on(date(2026, 9, 25), 7) == date(2026, 9, 24)
    assert remind_on(date(2026, 9, 25), -3) == date(2026, 9, 25)


def test_전날에_적었으면_당일에_다시_안_묻는다() -> None:
    """표시를 '같은 달' 로 세면 전날 적은 사람에게 당일 또 뜬다. 회차로 센다."""
    assert (
        should_ask(
            date(2026, 9, 25),
            25,
            lead_days=1,
            last_recorded_on=date(2026, 9, 24),
            dismissed_on=None,
        )
        is None
    )
    # 다음 달에는 다시 묻는다.
    assert (
        should_ask(
            date(2026, 10, 24),
            25,
            lead_days=1,
            last_recorded_on=date(2026, 9, 24),
            dismissed_on=None,
        )
        is not None
    )


# ── 설정 (API) ──────────────────────────────────────────


def test_처음에는_걸어_둔_것이_없다(client: TestClient) -> None:
    assert client.get(RECURRING, headers=AUTH).json()["items"] == []
    assert client.get(f"{RECURRING}/due", headers=AUTH).json() == []


def test_만들고_고치고_지운다(client: TestClient, default_categories: list[Category]) -> None:
    category = _expense_category(default_categories)
    res = client.post(
        RECURRING,
        json={
            "name": "넷플릭스",
            "amount": "17000",
            "day_of_month": 25,
            "category_id": str(category.id),
        },
        headers=AUTH,
    )
    assert res.status_code == 201, res.text
    row = res.json()["items"][0]
    assert row["name"] == "넷플릭스"
    assert row["is_active"] is True

    changed = client.patch(f"{RECURRING}/{row['id']}", json={"amount": "13500"}, headers=AUTH)
    assert changed.status_code == 200, changed.text
    assert changed.json()["items"][0]["amount"] == "13500"

    assert client.delete(f"{RECURRING}/{row['id']}", headers=AUTH).status_code == 204
    assert client.get(RECURRING, headers=AUTH).json()["items"] == []


def test_없는_분류를_걸면_막는다(client: TestClient) -> None:
    import uuid

    res = client.post(
        RECURRING,
        json={
            "name": "넷플릭스",
            "amount": "17000",
            "day_of_month": 25,
            "category_id": str(uuid.uuid4()),
        },
        headers=AUTH,
    )
    # 거래 저장과 같은 판정을 쓴다. 분류를 못 찾으면 422 INVALID_CATEGORY 다.
    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == "INVALID_CATEGORY"


def test_수입_태그는_반복_지출에_못_건다(client: TestClient) -> None:
    """반복 지출로 만든 기록은 늘 지출이다. 수입 태그를 달면 저장하는 순간 거절당한다."""
    tag = client.post(
        "/api/v1/tags", json={"name": "보너스", "kind": "income"}, headers=AUTH
    ).json()["items"][0]

    res = client.post(
        RECURRING,
        json={"name": "넷플릭스", "amount": "17000", "day_of_month": 25, "tag_id": tag["id"]},
        headers=AUTH,
    )

    assert res.status_code == 422, res.text


# ── 곧 나갈 돈 (API) ────────────────────────────────────


def _seed(client: TestClient, db: Session, day_of_month: int, **kwargs) -> RecurringExpense:
    row = RecurringExpense(
        user_id=_user(client, db).id,
        name="넷플릭스",
        amount=17000,
        day_of_month=day_of_month,
        **kwargs,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_꺼_둔_것은_묻지_않는다(client: TestClient, db: Session) -> None:
    today = date.today()
    _seed(client, db, today.day, is_active=False)

    assert client.get(f"{RECURRING}/due", headers=AUTH).json() == []


def test_오늘이_그날이면_오늘로_알려_준다(client: TestClient, db: Session) -> None:
    today = date.today()
    _seed(client, db, today.day)

    items = client.get(f"{RECURRING}/due", headers=AUTH).json()

    assert len(items) == 1
    assert items[0]["is_today"] is True
    assert items[0]["due_on"] == today.isoformat()


def test_누르면_기록이_되고_그_회차는_다시_안_묻는다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    today = date.today()
    row = _seed(client, db, today.day, category_id=_expense_category(default_categories).id)

    res = client.post(f"{RECURRING}/{row.id}/record", headers=AUTH)

    assert res.status_code == 201, res.text
    created = res.json()["transaction"]
    assert created["amount"] == "17000"
    # 예고에 적어 둔 이름이 그대로 상호가 된다. 「무엇이 빠져나갔나」 가 목록에 보여야 한다.
    assert created["merchant"] == "넷플릭스"
    assert client.get(f"{RECURRING}/due", headers=AUTH).json() == []


def test_차례가_아닐_때_부르면_막는다(client: TestClient, db: Session) -> None:
    """막지 않으면 다음 달 날짜로 거래가 생겨 달력에 오지 않은 지출이 앉는다."""
    today = date.today()
    # 오늘에서 열흘 떨어진 날. 달을 넘겨도 늘 '아직 아닌' 날이 되게 고른다.
    far = ((today.day + 9) % 28) + 1
    row = _seed(client, db, far)

    res = client.post(f"{RECURRING}/{row.id}/record", headers=AUTH)

    assert res.status_code == 422, res.text


def test_이번_달은_됐다고_하면_그_회차는_안_묻는다(client: TestClient, db: Session) -> None:
    today = date.today()
    row = _seed(client, db, today.day)

    assert client.post(f"{RECURRING}/{row.id}/dismiss", headers=AUTH).status_code == 200
    assert client.get(f"{RECURRING}/due", headers=AUTH).json() == []
