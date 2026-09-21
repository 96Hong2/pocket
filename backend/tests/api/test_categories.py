"""카테고리 조회와 내가 만든 분류의 생성·수정·삭제.

화면이 이 목록으로 아이콘까지 그린다. 기본 분류는 모든 사용자가 같은 행을 보므로
**지울 수는 없고**, 이름·아이콘·색을 고치면 그 행이 아니라 내 설정에 남아 남의 화면을
건드리지 않아야 한다. 내가 만든 분류를 지워도 과거 거래는 그대로 남아야 한다.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import anon_key_hash
from app.domain.categories import (
    DEFAULT_CATEGORIES,
    USER_CATEGORY_SORT_ORDER,
    USER_INCOME_SORT_ORDER,
)
from app.domain.category_icons import NOT_EMOJI_MESSAGE
from app.models import Category, CategoryBudget, CategoryKind, MerchantRule, User
from app.modules import ledger
from app.modules.categories import service as category_service

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


def _create(
    client: TestClient,
    name: str = "카페",
    icon_key: str = "06_coffee",
    kind: str | None = None,
):
    body: dict[str, str] = {"name": name, "icon_key": icon_key}
    if kind is not None:
        body["kind"] = kind
    return client.post("/api/v1/categories", json=body, headers=AUTH)


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
    # 종류를 안 보내면 지출이다. 적는 것 대부분이 지출이라 그쪽을 기본으로 둔다.
    assert body["kind"] == "expense"
    assert body["is_default"] is False

    names = _names(client)
    assert names.index("건강·미용") < names.index("카페") < names.index("기타")


def test_수입_분류를_만들면_기본_수입_뒤_이체_앞에_선다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """수입 목록에서 내가 만든 것을 찾을 수 있어야 한다. 지출 사이에 끼면 안 된다."""
    del default_categories
    # '부업' 은 이제 기본 수입 분류라 같은 이름으로는 못 만든다.
    created = _create(client, name="배당금", icon_key="28_cash", kind="income")
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["kind"] == "income"
    assert body["sort_order"] == USER_INCOME_SORT_ORDER

    names = _names(client)
    assert names.index("기타") < names.index("배당금")
    assert names.index("기타 수입") < names.index("배당금") < names.index("이체")


def test_이체_분류는_만들지_못한다(client: TestClient, default_categories: list[Category]) -> None:
    """'이체' 는 집계에서 빠지는 화살표 한 줄이라 사용자가 늘릴 것이 없다."""
    del default_categories
    res = _create(client, name="계좌 옮김", kind="transfer")
    assert res.status_code == 422, res.text


def test_지운_지출_이름을_수입으로_다시_만들면_새_행이_생긴다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """되살리면 그 분류로 적어 둔 지난 지출이 수입 분류를 달게 된다.

    종류가 같을 때만 되살린다. 다르면 지운 행은 그대로 두고 새 행을 만든다.
    """
    del default_categories
    old = _create(client, name="보너스", icon_key="26_sparkles").json()
    assert client.delete(f"/api/v1/categories/{old['id']}", headers=AUTH).status_code == 204

    again = _create(client, name="보너스", icon_key="31_gift", kind="income")
    assert again.status_code == 201, again.text
    assert again.json()["id"] != old["id"]
    assert again.json()["kind"] == "income"
    assert _names(client).count("보너스") == 1

    # 지운 행은 남는다. 하드 삭제하면 그 분류로 적어 둔 과거 거래가 분류를 잃는다.
    tomb = db.get(Category, uuid.UUID(old["id"]))
    assert tomb is not None
    assert tomb.kind is CategoryKind.EXPENSE


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


def test_기본_분류는_지우지_못한다(client: TestClient, default_categories: list[Category]) -> None:
    target = default_categories[0]
    removed = client.delete(f"/api/v1/categories/{target.id}", headers=AUTH)
    assert removed.status_code == 422, removed.text
    assert target.name in _names(client)


def test_기본_분류를_고치면_공용_행이_아니라_내_설정에_남는다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """남의 화면은 그대로여야 한다. 여기가 무너지면 한 사람이 바꾼 이름이 전부에게 번진다."""
    target = default_categories[0]
    original = target.name

    patched = client.patch(
        f"/api/v1/categories/{target.id}",
        json={"name": "밥값", "color": "sage"},
        headers=AUTH,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["name"] == "밥값"
    assert patched.json()["color"] == "sage"
    assert "밥값" in _names(client)
    assert original not in _names(client)

    # 공용 행은 손대지 않았다.
    db.expire_all()
    shared = db.get(Category, target.id)
    assert shared is not None and shared.name == original

    # 남의 눈으로 같은 값을 본다. 화면이 읽는 그 함수를 그대로 부른다.
    other = User(anon_key_hash="other-user-hash")
    db.add(other)
    db.commit()
    seen = category_service.category_overrides(db, other)
    assert category_service.effective_name(shared, seen) == original
    assert category_service.effective_color(shared, seen) is None


def test_기본_분류를_원래_이름으로_되돌리면_덮어쓰기가_사라진다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """되돌릴 길이 없으면 한 번 고친 이름에 영영 묶인다."""
    target = default_categories[0]
    original = target.name

    client.patch(f"/api/v1/categories/{target.id}", json={"name": "밥값"}, headers=AUTH)
    back = client.patch(f"/api/v1/categories/{target.id}", json={"name": original}, headers=AUTH)
    assert back.status_code == 200, back.text
    assert back.json()["name"] == original

    user = db.scalar(select(User).where(User.anon_key_hash == anon_key_hash("test-anon-key")))
    assert user is not None
    assert str(target.id) not in category_service.category_overrides(db, user)


def test_기본_분류_색은_null_로_뗄_수_있다(
    client: TestClient, default_categories: list[Category]
) -> None:
    target = default_categories[0]
    client.patch(f"/api/v1/categories/{target.id}", json={"color": "sage"}, headers=AUTH)
    cleared = client.patch(f"/api/v1/categories/{target.id}", json={"color": None}, headers=AUTH)
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["color"] is None


def test_기본_분류를_내_분류와_같은_이름으로는_못_고친다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """행 이름이 아니라 **내 화면에 보이는 이름**으로 견뎌야 같은 이름 두 줄을 막는다."""
    mine = client.post(
        "/api/v1/categories",
        json={"name": "밥값", "icon_key": "09_rice_bowl"},
        headers=AUTH,
    )
    assert mine.status_code == 201, mine.text

    clash = client.patch(
        f"/api/v1/categories/{default_categories[0].id}", json={"name": "밥값"}, headers=AUTH
    )
    assert clash.status_code == 409, clash.text
    assert clash.json()["error"]["code"] == "DUPLICATE_CATEGORY"


def test_기본_분류를_다르게_부르면_같은_이름을_새로_못_만든다(
    client: TestClient, default_categories: list[Category]
) -> None:
    client.patch(
        f"/api/v1/categories/{default_categories[0].id}", json={"name": "밥값"}, headers=AUTH
    )
    again = client.post(
        "/api/v1/categories", json={"name": "밥값", "icon_key": "09_rice_bowl"}, headers=AUTH
    )
    assert again.status_code == 409, again.text


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


def test_이름과_아이콘에_null_을_보내면_그대로_둔다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """비울 수 없는 값이라 null 은 '안 보낸 것' 으로 본다. 422 도 500 도 아니다."""
    del default_categories
    mine = _create(client, name="카페", icon_key="26_sparkles").json()

    kept = client.patch(
        f"/api/v1/categories/{mine['id']}",
        json={"name": None, "icon_key": None},
        headers=AUTH,
    )
    assert kept.status_code == 200, kept.text
    assert kept.json()["name"] == "카페"
    assert kept.json()["icon_key"] == "26_sparkles"


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


# ── 직접 건 아이콘(이모지·사진) ────────────────────────────────

# 1x1 png. 내용이 무엇인지는 상관없고 base64 가 실제로 풀리는지만 본다.
TINY_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def test_이모지를_걸고_받아_온다(client: TestClient, default_categories: list[Category]) -> None:
    del default_categories
    created = client.post(
        "/api/v1/categories",
        headers=AUTH,
        json={"name": "치킨", "icon_key": "26_sparkles", "icon_custom": "emoji:🍗"},
    )
    assert created.status_code == 201
    assert created.json()["icon_custom"] == "emoji:🍗"
    # 기본 아이콘도 함께 남는다. 이모지를 지웠을 때 돌아갈 자리다.
    assert created.json()["icon_key"] == "26_sparkles"

    items = client.get("/api/v1/categories", headers=AUTH).json()["items"]
    assert [i["icon_custom"] for i in items if i["name"] == "치킨"] == ["emoji:🍗"]


def test_사진을_걸_수_있다(client: TestClient, default_categories: list[Category]) -> None:
    del default_categories
    created = client.post(
        "/api/v1/categories",
        headers=AUTH,
        json={"name": "우리집", "icon_key": "12_house", "icon_custom": TINY_PNG},
    )
    assert created.status_code == 201
    assert created.json()["icon_custom"] == TINY_PNG


def test_기본_아이콘을_보내면_걸어_둔_사진이_지워진다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """사진을 걸었다가 되돌리는 유일한 길이다. `icon_custom: null` 은 '그대로 둔다' 다."""
    del default_categories
    created = client.post(
        "/api/v1/categories",
        headers=AUTH,
        json={"name": "우리집", "icon_key": "12_house", "icon_custom": TINY_PNG},
    ).json()

    updated = client.patch(
        f"/api/v1/categories/{created['id']}",
        headers=AUTH,
        json={"icon_key": "16_paw"},
    )
    assert updated.status_code == 200
    assert updated.json()["icon_key"] == "16_paw"
    assert updated.json()["icon_custom"] is None


def test_아이콘_둘을_한꺼번에_보내면_막는다(
    client: TestClient, default_categories: list[Category]
) -> None:
    del default_categories
    created = client.post(
        "/api/v1/categories",
        headers=AUTH,
        json={"name": "우리집", "icon_key": "12_house"},
    ).json()

    blocked = client.patch(
        f"/api/v1/categories/{created['id']}",
        headers=AUTH,
        json={"icon_key": "16_paw", "icon_custom": "emoji:🐾"},
    )
    assert blocked.status_code == 422


def test_그림도_이모지도_아닌_값은_막는다(
    client: TestClient, default_categories: list[Category]
) -> None:
    del default_categories
    for bad in ("http://example.com/a.png", "data:image/svg+xml;base64,YQ==", "emoji:ab", "emoji:"):
        blocked = client.post(
            "/api/v1/categories",
            headers=AUTH,
            json={"name": f"막힘{bad[:6]}", "icon_key": "26_sparkles", "icon_custom": bad},
        )
        assert blocked.status_code == 422, bad


# ── 기록 화면에 먼저 보일 분류 ──────────────────────────────────


def _by_name(client: TestClient, name: str) -> dict:
    items = client.get("/api/v1/categories", headers=AUTH).json()["items"]
    return next(i for i in items if i["name"] == name)


def test_처음에는_전부_기록_화면에_보인다(
    client: TestClient, default_categories: list[Category]
) -> None:
    del default_categories
    items = client.get("/api/v1/categories", headers=AUTH).json()["items"]
    assert all(i["is_quick"] for i in items)


def test_기본_분류도_기록_화면에서_뺄_수_있다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """이름·아이콘은 못 고쳐도 이건 된다. 내 설정에만 남아 남에게 번지지 않는다."""
    del default_categories
    target = _by_name(client, "식비")

    patched = client.patch(
        f"/api/v1/categories/{target['id']}", headers=AUTH, json={"is_quick": False}
    )
    assert patched.status_code == 200
    assert patched.json()["is_quick"] is False
    # 이름은 그대로다. 기본 분류를 고친 것이 아니다.
    assert patched.json()["name"] == "식비"

    assert _by_name(client, "식비")["is_quick"] is False
    assert _by_name(client, "교통")["is_quick"] is True

    back = client.patch(f"/api/v1/categories/{target['id']}", headers=AUTH, json={"is_quick": True})
    assert back.json()["is_quick"] is True


def test_기본_분류의_아이콘도_내_화면에서만_바뀐다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    del default_categories
    target = _by_name(client, "식비")
    changed = client.patch(
        f"/api/v1/categories/{target['id']}", headers=AUTH, json={"icon_custom": "emoji:🍚"}
    )
    assert changed.status_code == 200, changed.text
    assert _by_name(client, "식비")["icon_custom"] == "emoji:🍚"

    shared = db.get(Category, uuid.UUID(target["id"]))
    assert shared is not None and shared.icon_custom is None


def test_내가_끈_것이_남에게_번지지_않는다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """기본 분류는 모두가 같은 행을 본다. 끈 것이 그 행에 적히면 전부에게 꺼진다."""
    del default_categories
    target = _by_name(client, "식비")
    client.patch(f"/api/v1/categories/{target['id']}", headers=AUTH, json={"is_quick": False})

    other = User(anon_key_hash="other-user-hash")
    db.add(other)
    db.commit()
    # 남의 눈으로 같은 목록을 본다. 화면이 읽는 그 값을 그대로 부른다.
    assert str(target["id"]) not in category_service.quick_hidden_ids(db, other)


def test_새로_만든_분류는_바로_기록_화면에_선다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """숨긴 것만 적으므로 목록을 따로 고치지 않아도 보인다."""
    del default_categories
    created = client.post(
        "/api/v1/categories",
        headers=AUTH,
        json={"name": "반려동물", "icon_key": "16_paw"},
    )
    assert created.json()["is_quick"] is True


def test_이모지가_아닌_글자는_왜_안_되는지_말해_준다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """뭉뚱그린 「요청 형식이 올바르지 않아요」 로는 무엇을 고쳐야 할지 알 수 없다."""
    del default_categories
    response = client.post(
        "/api/v1/categories",
        headers=AUTH,
        json={"name": "데이트", "icon_key": "01_coins", "icon_custom": "emoji:ㅋ"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["message"] == NOT_EMOJI_MESSAGE


def test_숫자_키캡은_아이콘으로_걸린다(
    client: TestClient, default_categories: list[Category]
) -> None:
    del default_categories
    response = client.post(
        "/api/v1/categories",
        headers=AUTH,
        json={"name": "일곱", "icon_key": "01_coins", "icon_custom": "emoji:7️⃣"},
    )
    assert response.status_code == 201
    assert response.json()["icon_custom"] == "emoji:7️⃣"


def test_만들_때_고른_색이_저장된다(client: TestClient, default_categories: list[Category]) -> None:
    """색을 고르고 저장했는데 목록이 회색이면, 고른 사람에게는 앱이 고장 난 것이다."""
    del default_categories
    created = client.post(
        "/api/v1/categories",
        json={"name": "커피값", "icon_key": "06_coffee", "color": "sage"},
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    assert created.json()["color"] == "sage"
    assert _by_name(client, "커피값")["color"] == "sage"


def test_지웠다_다시_만들면_보낸_색이_이긴다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """되살리기는 같은 행을 쓴다. 옛 색이 따라오면 다른 색을 고른 사람이 옛 색을 본다."""
    del default_categories
    made = client.post(
        "/api/v1/categories",
        json={"name": "커피값", "icon_key": "06_coffee", "color": "plum"},
        headers=AUTH,
    )
    client.delete(f"/api/v1/categories/{made.json()['id']}", headers=AUTH)

    again = client.post(
        "/api/v1/categories",
        json={"name": "커피값", "icon_key": "06_coffee", "color": "sky"},
        headers=AUTH,
    )
    assert again.status_code == 201, again.text
    assert again.json()["color"] == "sky"


def test_이름이_겹쳐_막히면_기록_화면_설정도_안_바뀐다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """한 요청이 반만 들어가면, 화면은 「저장 못 했어요」 인데 칩은 이미 사라져 있다."""
    client.post(
        "/api/v1/categories", json={"name": "밥값", "icon_key": "09_rice_bowl"}, headers=AUTH
    )
    target = default_categories[0]

    blocked = client.patch(
        f"/api/v1/categories/{target.id}",
        json={"is_quick": False, "name": "밥값"},
        headers=AUTH,
    )
    assert blocked.status_code == 409, blocked.text
    assert _by_name(client, target.name)["is_quick"] is True


def test_기본_분류를_다르게_부르면_그_이름으로_찾힌다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """찾는 사람이 부르는 이름으로 찾아야 한다. 화면에 없는 말로만 찾히면 검색이 아니다."""
    target = default_categories[0]
    made = client.post(
        "/api/v1/transactions",
        json={
            "occurred_at": "2026-09-15T12:30:00+09:00",
            "amount": "9000",
            "type": "expense",
            "source": "keypad",
            "category_id": str(target.id),
        },
        headers=AUTH,
    )
    assert made.status_code == 201, made.text

    client.patch(f"/api/v1/categories/{target.id}", json={"name": "밥값"}, headers=AUTH)

    found = client.get("/api/v1/transactions", params={"q": "밥값"}, headers=AUTH)
    assert found.status_code == 200, found.text
    assert len(found.json()["items"]) == 1

    # 바꾸기 전 이름으로 찾는 길도 남는다. 그 기억으로 찾는 사람이 있다.
    old = client.get("/api/v1/transactions", params={"q": target.name}, headers=AUTH)
    assert len(old.json()["items"]) == 1
