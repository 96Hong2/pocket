"""기록 화면 칩이 설 순서.

칩은 앞자리 열한 개만 세우므로 이 순서가 곧 "무엇이 먼저 보이나" 다.
기본 분류는 모두가 같은 행을 봐서, 순서를 카테고리 행에 적으면 한 사람이 옮긴 것이
전부에게 옮겨진다. 그래서 사용자 설정에 남고, 이 파일이 그것을 지킨다.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.domain.categories import DEFAULT_CATEGORIES
from app.models import Category, CategoryKind, User

AUTH = {"X-Anon-Key": "test-anon-key"}


def _names(client: TestClient) -> list[str]:
    return [i["name"] for i in client.get("/api/v1/categories", headers=AUTH).json()["items"]]


def _ids(client: TestClient) -> list[str]:
    return [i["id"] for i in client.get("/api/v1/categories", headers=AUTH).json()["items"]]


def test_순서를_정하기_전에는_서버가_준_그대로다(
    client: TestClient, default_categories: list[Category]
) -> None:
    del default_categories
    assert _names(client) == [c.name for c in DEFAULT_CATEGORIES]


def test_정한_순서가_앞에_선다(client: TestClient, default_categories: list[Category]) -> None:
    del default_categories
    ids = _ids(client)
    # 맨 뒤 둘을 맨 앞으로 끌어올린다.
    moved = [ids[-1], ids[-2]]

    res = client.put("/api/v1/categories/order", json={"ids": moved}, headers=AUTH)
    assert res.status_code == 204

    after = _ids(client)
    assert after[:2] == moved
    # 나머지는 있던 차례를 그대로 지킨다. 한 칸 옮겼는데 목록이 통째로 뒤집히면 안 된다.
    assert after[2:] == [i for i in ids if i not in moved]


def test_목록에_없는_분류는_그대로_뒤에_붙는다(
    client: TestClient, default_categories: list[Category]
) -> None:
    del default_categories
    ids = _ids(client)
    client.put("/api/v1/categories/order", json={"ids": [ids[3]]}, headers=AUTH)

    after = _ids(client)
    assert after[0] == ids[3]
    assert after[1:] == [i for i in ids if i != ids[3]]


def test_남의_분류를_섞어_보내면_통째로_막는다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    del default_categories
    other = User(anon_key_hash="other-user-hash")
    db.add(other)
    db.flush()
    stranger = Category(
        user_id=other.id,
        name="남의 것",
        kind=CategoryKind.EXPENSE,
        icon_key="26_sparkles",
        sort_order=5,
    )
    db.add(stranger)
    db.commit()

    before = _ids(client)
    res = client.put(
        "/api/v1/categories/order",
        json={"ids": [str(stranger.id), before[0]]},
        headers=AUTH,
    )
    assert res.status_code == 422
    # 하나라도 걸리면 아무것도 저장하지 않는다. 조용히 걸러 내면 화면과 서버가 어긋난다.
    assert _ids(client) == before


def test_같은_분류를_두_번_보내면_막는다(
    client: TestClient, default_categories: list[Category]
) -> None:
    del default_categories
    ids = _ids(client)
    res = client.put("/api/v1/categories/order", json={"ids": [ids[0], ids[0]]}, headers=AUTH)
    assert res.status_code == 422


def test_없는_분류를_보내면_막는다(client: TestClient, default_categories: list[Category]) -> None:
    del default_categories
    res = client.put("/api/v1/categories/order", json={"ids": [str(uuid.uuid4())]}, headers=AUTH)
    assert res.status_code == 422


def test_순서를_정한_뒤_만든_분류는_맨_앞에_선다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """순서를 정한 사람에게는 목록에 없는 것이 전부 뒤로 밀린다.

    그대로 두면 방금 만든 분류가 「더 보기」 뒤에서 시작해, 만들자마자 찾지 못한다.
    """
    del default_categories
    client.put("/api/v1/categories/order", json={"ids": _ids(client)}, headers=AUTH)

    created = client.post(
        "/api/v1/categories",
        json={"name": "데이트", "icon_key": "26_sparkles"},
        headers=AUTH,
    ).json()

    assert _ids(client)[0] == created["id"]


def test_순서를_안_정했으면_만든_분류가_제자리에_선다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """한 번도 순서를 정한 적 없으면 서버 순서가 이미 제자리를 준다. 앞으로 끌어내지 않는다."""
    del default_categories
    created = client.post(
        "/api/v1/categories",
        json={"name": "데이트", "icon_key": "26_sparkles"},
        headers=AUTH,
    ).json()

    names = _names(client)
    assert names[0] != created["name"]
    # 기본 지출 분류 뒤, '기타' 앞이다(USER_CATEGORY_SORT_ORDER).
    assert names.index("데이트") < names.index("기타")


def test_쓴_횟수를_함께_준다(client: TestClient, default_categories: list[Category]) -> None:
    """화면의 「자주 쓴 순서로」가 이 값으로 줄을 세운다. 서버는 순서를 바꾸지 않는다."""
    del default_categories
    items = client.get("/api/v1/categories", headers=AUTH).json()["items"]
    food = next(i for i in items if i["name"] == "식비")
    assert food["usage_count"] == 0

    for amount in (1000, 2000):
        client.post(
            "/api/v1/transactions",
            json={
                "occurred_at": "2026-09-13T03:00:00+00:00",
                "amount": str(amount),
                "type": "expense",
                "category_id": food["id"],
                "source": "keypad",
            },
            headers=AUTH,
        )

    items = client.get("/api/v1/categories", headers=AUTH).json()["items"]
    assert next(i for i in items if i["name"] == "식비")["usage_count"] == 2
    # 순서는 그대로다. 쓸 때마다 칩이 움직이면 손이 기억한 자리가 무너진다.
    assert [i["name"] for i in items] == [c.name for c in DEFAULT_CATEGORIES]
