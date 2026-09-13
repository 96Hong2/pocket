"""앱 데이터 초기화.

되돌릴 수 없는 자리다. 여기서 지키는 것은 셋이다.
**전부 지워지나**(표가 하나 늘었을 때 빠뜨린 것이 드러나야 한다),
**남의 것은 안 지워지나**, 그리고 **기본 분류가 살아남나**.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.categories import DEFAULT_CATEGORIES
from app.models import (
    AssetItem,
    AssetSnapshot,
    Budget,
    Category,
    CategoryKind,
    Goal,
    GoalContribution,
    ImportBatch,
    ImportCandidate,
    MerchantRule,
    NotificationSetting,
    ParseUsage,
    Transaction,
    User,
    UserPreference,
)

AUTH = {"X-Anon-Key": "test-anon-key"}


def _fill(client: TestClient) -> str:
    """화면으로 만들 수 있는 것은 화면 길로 심는다. 실제로 쌓이는 모양과 같아야 한다."""
    categories = client.get("/api/v1/categories", headers=AUTH).json()["items"]
    food = next(i for i in categories if i["name"] == "식비")["id"]

    client.post(
        "/api/v1/transactions",
        json={
            "occurred_at": "2026-09-13T03:00:00+00:00",
            "amount": "12000",
            "type": "expense",
            "category_id": food,
            "source": "keypad",
            "merchant": "김밥천국",
        },
        headers=AUTH,
    )
    client.put("/api/v1/budgets", json={"amount": "500000"}, headers=AUTH)
    client.post(
        "/api/v1/goals",
        json={"name": "세부여행", "target_amount": "1300000"},
        headers=AUTH,
    )
    client.put(
        "/api/v1/assets",
        json={"items": [{"name": "월급통장", "group": "cash", "amount": "1000000"}]},
        headers=AUTH,
    )
    client.post(
        "/api/v1/categories",
        json={"name": "데이트", "icon_key": "26_sparkles"},
        headers=AUTH,
    )
    client.post(
        "/api/v1/merchant-rules",
        json={"merchant": "스타벅스", "category_id": food},
        headers=AUTH,
    )
    # 검토 묶음과 그 후보, 그리고 분석 사용량이 함께 쌓인다.
    analyzed = client.post("/api/v1/imports/text", json={"text": "점심 12000"}, headers=AUTH)
    assert analyzed.status_code == 201, analyzed.text
    client.patch("/api/v1/preferences", json={"home_hero": "income_expense"}, headers=AUTH)
    return food


def _count(db: Session, model, **where) -> int:  # type: ignore[no-untyped-def]
    stmt = select(func.count()).select_from(model)
    for field, value in where.items():
        stmt = stmt.where(getattr(model, field) == value)
    return db.scalar(stmt) or 0


def test_넣은_것이_전부_사라진다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    del default_categories
    _fill(client)
    user = db.scalar(select(User))
    assert user is not None

    assert _count(db, Transaction, user_id=user.id) == 1
    assert _count(db, Category, user_id=user.id) == 1
    # 지우기 전에 실제로 쌓여 있어야 한다. 0 을 0 과 견주면 아무것도 지키지 못한다.
    assert _count(db, ImportBatch, user_id=user.id) == 1
    assert _count(db, ImportCandidate) > 0
    assert _count(db, ParseUsage, user_id=user.id) == 1
    assert _count(db, MerchantRule, user_id=user.id) == 1

    res = client.post("/api/v1/account/reset", json={"confirm": True}, headers=AUTH)
    assert res.status_code == 204

    db.expire_all()
    for model in (Transaction, Budget, Goal, AssetSnapshot, MerchantRule, ParseUsage):
        assert _count(db, model, user_id=user.id) == 0, model.__name__
    assert _count(db, Category, user_id=user.id) == 0
    assert _count(db, UserPreference, user_id=user.id) == 0
    assert _count(db, NotificationSetting, user_id=user.id) == 0
    # 자식도 함께. 부모만 지우고 자식이 남으면 다음 조회가 없는 것을 가리킨다.
    assert _count(db, GoalContribution) == 0
    assert _count(db, AssetItem) == 0
    assert _count(db, ImportCandidate) == 0
    assert _count(db, ImportBatch) == 0


def test_사용자와_기본_분류는_남는다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """사용자 행은 사람이 넣은 것이 아니라 익명키에서 나온 자리다. 지우면 새 사람이 된다."""
    del default_categories
    _fill(client)
    client.post("/api/v1/account/reset", json={"confirm": True}, headers=AUTH)

    db.expire_all()
    assert _count(db, User) == 1
    names = [i["name"] for i in client.get("/api/v1/categories", headers=AUTH).json()["items"]]
    assert names == [c.name for c in DEFAULT_CATEGORIES]


def test_지운_뒤에도_바로_적을_수_있다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """첫 실행 직후와 같은 상태여야 한다. 설정 행이 사라졌다고 다음 저장이 막히면 안 된다."""
    del default_categories
    _fill(client)
    client.post("/api/v1/account/reset", json={"confirm": True}, headers=AUTH)

    assert client.get("/api/v1/preferences", headers=AUTH).status_code == 200
    food = next(
        i
        for i in client.get("/api/v1/categories", headers=AUTH).json()["items"]
        if i["name"] == "식비"
    )["id"]
    res = client.post(
        "/api/v1/transactions",
        json={
            "occurred_at": "2026-09-13T03:00:00+00:00",
            "amount": "3000",
            "type": "expense",
            "category_id": food,
            "source": "keypad",
        },
        headers=AUTH,
    )
    assert res.status_code == 201


def test_남의_것은_그대로다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    del default_categories
    other = User(anon_key_hash="other-user-hash")
    db.add(other)
    db.flush()
    db.add(
        Transaction(
            user_id=other.id,
            amount=Decimal("9000"),
            type="expense",
            occurred_at=datetime(2026, 9, 13, 3, tzinfo=UTC),
            source="keypad",
        )
    )
    db.add(
        Category(
            user_id=other.id,
            name="남의 분류",
            kind=CategoryKind.EXPENSE,
            icon_key="26_sparkles",
            sort_order=5,
        )
    )
    db.commit()

    _fill(client)
    client.post("/api/v1/account/reset", json={"confirm": True}, headers=AUTH)

    db.expire_all()
    assert _count(db, Transaction, user_id=other.id) == 1
    assert _count(db, Category, user_id=other.id) == 1


def test_동의_없이는_지우지_않는다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """화면의 체크는 화면에만 있다. 잘못 만들어진 요청 하나가 몇 달치를 지우지 못하게 한다."""
    del default_categories
    _fill(client)
    user = db.scalar(select(User))
    assert user is not None

    assert client.post("/api/v1/account/reset", json={}, headers=AUTH).status_code == 422
    assert (
        client.post("/api/v1/account/reset", json={"confirm": False}, headers=AUTH).status_code
        == 422
    )

    db.expire_all()
    assert _count(db, Transaction, user_id=user.id) == 1


def test_인증_없이는_못_지운다(unauthenticated_client: TestClient) -> None:
    res = unauthenticated_client.post("/api/v1/account/reset", json={"confirm": True})
    assert res.status_code == 401
