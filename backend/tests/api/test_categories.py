"""카테고리 조회와 내가 만든 분류의 생성·수정·삭제.

화면이 이 목록으로 아이콘까지 그린다. 기본 분류는 모든 사용자가 같은 행을 보므로
고치거나 지울 수 없어야 하고, 내가 만든 분류를 지워도 과거 거래는 그대로 남아야 한다.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.categories import DEFAULT_CATEGORIES, USER_CATEGORY_SORT_ORDER
from app.models import Category, CategoryBudget, CategoryKind, MerchantRule, User
from app.modules import ledger

AUTH = {"X-Anon-Key": "test-anon-key"}


def test_기본_카테고리를_정한_순서로_준다(
    client: TestClient, default_categories: list[Category]
) -> None:
    del default_categories
    items = client.get("/api/v1/categories", headers=AUTH).json()["items"]
    assert [i["name"] for i in items] == [c.name for c in DEFAULT_CATEGORIES]
    assert [i["icon_key"] for i in items] == [c.icon_key for c in DEFAULT_CATEGORIES]
    assert all(i["is_default"] for i in items)


def test_남의_카테고리는_보이지_않는다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    del default_categories
    other = User(anon_key_hash="other-user-hash")
    db.add(other)
    db.flush()
    db.add(
        Category(
            user_id=other.id,
            name="남의 카테고리",
            kind=CategoryKind.EXPENSE,
            icon_key="26_sparkles",
            sort_order=5,
        )
    )
    db.commit()

    names = [i["name"] for i in client.get("/api/v1/categories", headers=AUTH).json()["items"]]
    assert "남의 카테고리" not in names
    assert len(names) == len(DEFAULT_CATEGORIES)


def test_지운_카테고리는_빠진다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    from datetime import UTC, datetime

    target = default_categories[0]
    db.merge(target).deleted_at = datetime.now(UTC)
    db.commit()

    names = [i["name"] for i in client.get("/api/v1/categories", headers=AUTH).json()["items"]]
    assert target.name not in names


# ── 내가 만든 분류 ──────────────────────────────────────
# 기본 분류는 모두가 같은 행을 본다. 여기서 막지 않으면 한 사람의 삭제가 전체에 번진다.


def _create(client: TestClient, name: str = "카페", icon_key: str = "06_coffee"):
    return client.post(
        "/api/v1/categories", json={"name": name, "icon_key": icon_key}, headers=AUTH
    )


def _names(client: TestClient) -> list[str]:
    return [i["name"] for i in client.get("/api/v1/categories", headers=AUTH).json()["items"]]


def test_만든_분류는_기본_지출_뒤_기타_앞에_선다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """0 을 그대로 쓰면 내가 만든 것이 '식비'보다 앞에 선다. '기타'는 끝에 남아야 한다."""
    del default_categories
    created = _create(client)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["sort_order"] == USER_CATEGORY_SORT_ORDER
    # 기록 시트 칩이 지출만 걸러 보여주므로 서버가 지출로 고정한다.
    assert body["kind"] == "expense"
    assert body["is_default"] is False

    names = _names(client)
    assert names.index("건강·미용") < names.index("카페") < names.index("기타")


def test_같은_이름을_또_만들면_거절한다(
    client: TestClient, default_categories: list[Category]
) -> None:
    del default_categories
    assert _create(client).status_code == 201
    again = _create(client)
    assert again.status_code == 409, again.text
    assert again.json()["error"]["code"] == "DUPLICATE_CATEGORY"


def test_기본_분류와_같은_이름은_만들지_못한다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """유니크 키가 (user_id, name) 이라 (NULL,'식비')와 (내,'식비')는 DB 가 안 막는다."""
    del default_categories
    res = _create(client, name="식비", icon_key="09_rice_bowl")
    assert res.status_code == 409, res.text
    assert res.json()["error"]["code"] == "DUPLICATE_CATEGORY"


def test_공백_차이는_같은_이름으로_본다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """DB 유니크는 바이트 일치라 못 막는다. 막지 않으면 같은 이름이 두 줄로 보인다."""
    del default_categories
    assert _create(client, name="카페").status_code == 201
    assert _create(client, name="카페 ").status_code == 409

    assert _create(client, name="카 페").status_code == 201
    inner = _create(client, name="카  페")
    assert inner.status_code == 409, inner.text
    assert inner.json()["error"]["code"] == "DUPLICATE_CATEGORY"


def test_기본_분류는_고치지도_지우지도_못한다(
    client: TestClient, default_categories: list[Category]
) -> None:
    target = default_categories[0]
    patched = client.patch(f"/api/v1/categories/{target.id}", json={"name": "내식비"}, headers=AUTH)
    assert patched.status_code == 422, patched.text
    assert patched.json()["error"]["code"] == "INVALID_REQUEST"

    removed = client.delete(f"/api/v1/categories/{target.id}", headers=AUTH)
    assert removed.status_code == 422, removed.text
    assert target.name in _names(client)


def test_남의_분류는_고치지도_지우지도_못한다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    del default_categories
    other = User(anon_key_hash="other-user-hash")
    db.add(other)
    db.flush()
    theirs = Category(
        user_id=other.id,
        name="남의 카테고리",
        kind=CategoryKind.EXPENSE,
        icon_key="26_sparkles",
        sort_order=85,
    )
    db.add(theirs)
    db.commit()

    patched = client.patch(
        f"/api/v1/categories/{theirs.id}", json={"name": "가로채기"}, headers=AUTH
    )
    assert patched.status_code == 404, patched.text
    assert patched.json()["error"]["code"] == "NOT_FOUND"
    assert client.delete(f"/api/v1/categories/{theirs.id}", headers=AUTH).status_code == 404


def test_이름을_바꿀_때도_겹침을_본다(
    client: TestClient, default_categories: list[Category]
) -> None:
    del default_categories
    mine = _create(client, name="카페").json()
    _create(client, name="반려동물", icon_key="26_sparkles")

    taken = client.patch(
        f"/api/v1/categories/{mine['id']}", json={"name": "반려동물"}, headers=AUTH
    )
    assert taken.status_code == 409, taken.text

    # 자기 이름을 그대로 다시 보내는 것은 겹침이 아니다.
    same = client.patch(
        f"/api/v1/categories/{mine['id']}",
        json={"name": "카페", "icon_key": "26_sparkles"},
        headers=AUTH,
    )
    assert same.status_code == 200, same.text
    assert same.json()["icon_key"] == "26_sparkles"


def test_분류를_지워도_그_거래는_그대로_남는다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """지난달 리포트가 나중에 달라지면 안 된다. 거래의 category_id 는 건드리지 않는다."""
    del default_categories
    mine = _create(client).json()
    saved = client.post(
        "/api/v1/transactions",
        json={
            "occurred_at": "2026-09-15T12:30:00+09:00",
            "amount": "12000",
            "type": "expense",
            "merchant": "테스트 카페",
            "source": "keypad",
            "category_id": mine["id"],
        },
        headers=AUTH,
    )
    assert saved.status_code == 201, saved.text

    assert client.delete(f"/api/v1/categories/{mine['id']}", headers=AUTH).status_code == 204
    assert "카페" not in _names(client)

    items = client.get("/api/v1/transactions?year=2026&month=9", headers=AUTH).json()["items"]
    assert [i["id"] for i in items] == [saved.json()["transaction"]["id"]]
    assert items[0]["category_id"] == mine["id"]


def test_분류를_지우면_기억한_규칙도_함께_빠진다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """규칙이 남으면 다음 캡처 분석이 죽은 분류를 후보에 붙여 저장이 묶음째 거절된다."""
    del default_categories
    mine = _create(client).json()
    me = db.scalars(select(User)).one()
    db.add(
        MerchantRule(
            user_id=me.id,
            merchant_normalized="스타벅스",
            merchant="스타벅스",
            category_id=uuid.UUID(mine["id"]),
        )
    )
    db.commit()
    assert len(client.get("/api/v1/merchant-rules", headers=AUTH).json()["items"]) == 1

    assert client.delete(f"/api/v1/categories/{mine['id']}", headers=AUTH).status_code == 204
    assert client.get("/api/v1/merchant-rules", headers=AUTH).json()["items"] == []
    # 목록이 비는 것만으로는 부족하다. 조회가 지운 분류를 걸러 주므로, 규칙이 DB 에 살아 있어도
    # 빈 목록이 나온다. 실제로 지워졌는지는 행을 직접 봐야 갈린다.
    rule = db.scalars(
        select(MerchantRule).where(MerchantRule.merchant_normalized == "스타벅스")
    ).one()
    assert rule.deleted_at is not None


def test_분류를_지우면_거기_걸린_한도도_함께_빠진다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """한도를 남기면 같은 이름으로 다시 만들었을 때 옛 한도가 되살아나 따라붙는다."""
    del default_categories
    mine = _create(client).json()
    today = datetime.now(ZoneInfo(ledger.DEFAULT_TIMEZONE)).date()
    month = f"year={today.year}&month={today.month}"
    assert (
        client.put(f"/api/v1/budgets?{month}", json={"amount": "500000"}, headers=AUTH).status_code
        == 200
    )
    limit = client.put(
        f"/api/v1/budgets/categories/{mine['id']}?{month}", json={"amount": "50000"}, headers=AUTH
    )
    assert limit.status_code == 200, limit.text

    assert client.delete(f"/api/v1/categories/{mine['id']}", headers=AUTH).status_code == 204
    row = db.scalars(
        select(CategoryBudget).where(CategoryBudget.category_id == uuid.UUID(mine["id"]))
    ).one()
    assert row.deleted_at is not None


def test_지운_이름으로_다시_만들면_같은_행이_돌아온다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """지운 행이 이름 자리를 계속 잡고 있다. 같은 id 라야 과거 거래가 이름을 되찾는다."""
    del default_categories
    mine = _create(client).json()
    assert client.delete(f"/api/v1/categories/{mine['id']}", headers=AUTH).status_code == 204
    # 두 번 눌러도 같은 결과다.
    assert client.delete(f"/api/v1/categories/{mine['id']}", headers=AUTH).status_code == 204

    again = _create(client, icon_key="26_sparkles")
    assert again.status_code == 201, again.text
    assert again.json()["id"] == mine["id"]
    assert again.json()["icon_key"] == "26_sparkles"
    assert _names(client).count("카페") == 1


def test_지운_이름으로_이름을_바꿀_수_있다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """지운 행이 붙들고 있던 이름 자리를 비켜 준다.

    화면 어디에도 없는 이름 때문에 "이미 있어요" 가 나가면 사용자는 되돌릴 방법이 없다.
    """
    del default_categories
    old = _create(client, name="카페").json()
    assert client.delete(f"/api/v1/categories/{old['id']}", headers=AUTH).status_code == 204

    mine = _create(client, name="커피").json()
    renamed = client.patch(f"/api/v1/categories/{mine['id']}", json={"name": "카페"}, headers=AUTH)
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["name"] == "카페"

    names = [row["name"] for row in client.get("/api/v1/categories", headers=AUTH).json()["items"]]
    assert names.count("카페") == 1

    # 지운 행은 그대로 남는다. 하드 삭제하면 그 분류로 적어 둔 과거 거래가 분류를 잃는다.
    tomb = db.get(Category, uuid.UUID(old["id"]))
    assert tomb is not None
    assert tomb.deleted_at is not None
    assert tomb.name != "카페"
