"""공유 가계부 API.

두 사람을 헤더의 익명키로 가른다. AUTH 가 은홍(만든 사람), OTHER 가 준호(초대받은 사람)다.
여기서 지키는 것은 멤버가 아니면 아무것도 못 본다는 것, 권한이 없는 쓰기는 404 라는 것,
그리고 개인 기록이 공유 가계부로 새지 않는다는 것이다.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.integrations.email.factory import get_email_sender
from app.models import Book, BookInvite, BookMember, Category, User

AUTH = {"X-Anon-Key": "test-anon-key"}
OTHER = {"X-Anon-Key": "second-device-key"}
THIRD = {"X-Anon-Key": "third-device-key"}
AUG = "year=2026&month=8"


def _key(n: int) -> dict[str, str]:
    return {"X-Anon-Key": f"member-{n}"}


@pytest.fixture
def api(two_devices: TestClient, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """스위치를 켠 앱. 설정은 캐시되므로 켜고 끌 때 비운다."""
    monkeypatch.setenv("SHARED_BOOKS_ENABLED", "true")
    get_settings.cache_clear()
    yield two_devices
    get_settings.cache_clear()


def _create(client: TestClient, headers: dict[str, str] = AUTH, **over: Any) -> dict:
    body = {"kind": "couple", "name": "우리 집", "settle_rule": "even", "my_name": "은홍"}
    body.update(over)
    r = client.post("/api/v1/books", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def _join(
    client: TestClient, code: str, headers: dict[str, str] = OTHER, name: str = "준호"
) -> Any:
    return client.post(f"/api/v1/invites/{code}/join", json={"name": name}, headers=headers)


def _pair(client: TestClient, **over: Any) -> dict:
    """은홍이 만들고 준호가 들어온 가계부."""
    book = _create(client, **over)
    r = _join(client, book["invite"]["code"])
    assert r.status_code == 200, r.text
    return r.json()


def _add(client: TestClient, book_id: str, headers: dict[str, str] = AUTH, **over: Any) -> dict:
    body: dict[str, Any] = {"amount": "32000", "occurred_on": "2026-08-15"}
    body.update(over)
    r = client.post(f"/api/v1/books/{book_id}/entries", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def _entries(client: TestClient, book_id: str, headers: dict[str, str] = AUTH) -> list[dict]:
    r = client.get(f"/api/v1/books/{book_id}/entries?{AUG}", headers=headers)
    assert r.status_code == 200, r.text
    return list(r.json()["items"])


def _category(book: dict, name: str) -> str:
    return next(c["id"] for c in book["categories"] if c["name"] == name)


def _member(book: dict, name: str) -> str:
    return next(m["id"] for m in book["members"] if m["name"] == name)


def _error(r: Any) -> str:
    return str(r.json()["error"]["code"])


# ── 스위치 ─────────────────────────────────────────────


def test_스위치가_꺼져_있으면_없는_경로처럼_답한다(
    two_devices: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SHARED_BOOKS_ENABLED", "false")
    get_settings.cache_clear()

    assert two_devices.get("/api/v1/books", headers=AUTH).status_code == 404
    r = two_devices.get("/api/v1/invites/abcdefghijkl", headers=AUTH)
    assert r.status_code == 404
    assert _error(r) == "NOT_FOUND"
    assert (
        two_devices.get("/api/v1/account/me", headers=AUTH).json()["shared_books_enabled"] is False
    )
    get_settings.cache_clear()


# ── 만들기와 초대 ─────────────────────────────────────


def test_만들면_관리자와_종류별_분류와_살아_있는_초대가_생긴다(api: TestClient) -> None:
    book = _create(api)

    assert book["my_role"] == "owner"
    assert book["active_member_count"] == 1
    assert [m["name"] for m in book["members"]] == ["은홍"]
    assert [c["name"] for c in book["categories"]] == [
        "장보기",
        "외식·배달",
        "주거비",
        "공과금",
        "생활",
        "데이트",
        "여가·취미",
        "경조사",
        "기타",
    ]
    assert len(book["invite"]["code"]) == 12
    listed = api.get("/api/v1/books", headers=AUTH).json()["items"]
    assert [item["id"] for item in listed] == [book["id"]]
    # 남에게는 목록에도 없고 열어도 없다.
    assert api.get("/api/v1/books", headers=OTHER).json()["items"] == []
    assert api.get(f"/api/v1/books/{book['id']}", headers=OTHER).status_code == 404


def test_초대를_열어_보고_이름을_적으면_들어온다(api: TestClient) -> None:
    book = _create(api)
    code = book["invite"]["code"]

    preview = api.get(f"/api/v1/invites/{code}", headers=OTHER).json()
    assert preview == {
        "status": "ok",
        "book_kind": "couple",
        "book_name": "우리 집",
        "inviter_name": "은홍",
        "active_member_count": 1,
        "book_id": None,
        "is_inviter": False,
    }

    joined = _join(api, code).json()
    assert joined["my_role"] == "member"
    assert joined["active_member_count"] == 2
    assert [m["name"] for m in joined["members"]] == ["은홍", "준호"]

    again = api.get(f"/api/v1/invites/{code}", headers=OTHER).json()
    assert (again["status"], again["book_id"], again["is_inviter"]) == ("member", book["id"], False)
    mine = api.get(f"/api/v1/invites/{code}", headers=AUTH).json()
    assert (mine["status"], mine["is_inviter"]) == ("member", True)
    # 이미 멤버면 두 번 눌러도 그대로 돌려준다.
    assert _join(api, code).status_code == 200


def test_연인_초대는_한_사람이_들어오면_닫힌다(api: TestClient) -> None:
    book = _create(api)
    code = book["invite"]["code"]
    assert _join(api, code).status_code == 200

    assert api.get(f"/api/v1/books/{book['id']}", headers=AUTH).json()["invite"] is None
    assert api.get(f"/api/v1/invites/{code}", headers=THIRD).json()["status"] == "closed"
    r = _join(api, code, headers=THIRD, name="서연")
    assert r.status_code == 409
    assert _error(r) == "INVITE_CLOSED"


def test_새_초대를_만들면_앞의_것은_닫힌다(api: TestClient) -> None:
    book = _create(api, kind="family", settle_rule="none", name="우리 가족")
    old = book["invite"]["code"]

    r = api.post(f"/api/v1/books/{book['id']}/invites", headers=AUTH)
    assert r.status_code == 201, r.text
    assert r.json()["code"] != old
    assert _error(_join(api, old)) == "INVITE_CLOSED"
    assert _join(api, r.json()["code"]).status_code == 200


def test_열_명이_차면_더_못_들어온다(api: TestClient) -> None:
    book = _create(api, kind="family", settle_rule="none", name="우리 가족")
    code = book["invite"]["code"]
    for n in range(9):
        assert _join(api, code, headers=_key(n), name=f"가족{n}").status_code == 200

    assert api.get(f"/api/v1/invites/{code}", headers=OTHER).json()["status"] == "full"
    r = _join(api, code)
    assert r.status_code == 409
    assert _error(r) == "BOOK_FULL"
    assert api.get(f"/api/v1/books/{book['id']}", headers=AUTH).json()["active_member_count"] == 10


def test_만료된_초대와_모르는_코드(api: TestClient, db: Session) -> None:
    book = _create(api)
    code = book["invite"]["code"]
    db.execute(
        update(BookInvite)
        .where(BookInvite.code == code)
        .values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
    )
    db.commit()

    expired = api.get(f"/api/v1/invites/{code}", headers=OTHER).json()
    # 만료 화면은 누구에게 새 링크를 부탁할지만 쓴다. 가계부 이름과 인원은 싣지 않는다.
    assert (
        expired["status"],
        expired["inviter_name"],
        expired["book_name"],
        expired["active_member_count"],
    ) == ("expired", "은홍", "", 0)
    r = _join(api, code)
    assert r.status_code == 409
    assert _error(r) == "INVITE_EXPIRED"
    assert api.get("/api/v1/invites/zzzzzzzzzzzz", headers=OTHER).status_code == 404
    assert api.get("/api/v1/invites/short", headers=OTHER).status_code == 404


def test_끝난_가계부는_초대도_합류도_기록도_막는다(api: TestClient) -> None:
    book = _create(api, kind="trip", name="우리 여행")
    code = book["invite"]["code"]

    ended = api.patch(f"/api/v1/books/{book['id']}", json={"ended": True}, headers=AUTH).json()
    assert ended["ended"] is True

    assert api.get(f"/api/v1/invites/{code}", headers=OTHER).json()["status"] == "ended"
    assert _error(_join(api, code)) == "BOOK_ENDED"
    assert _error(api.post(f"/api/v1/books/{book['id']}/invites", headers=AUTH)) == "BOOK_ENDED"
    r = api.post(
        f"/api/v1/books/{book['id']}/entries",
        json={"amount": "1000", "occurred_on": "2026-08-01"},
        headers=AUTH,
    )
    assert r.status_code == 409
    assert _error(r) == "BOOK_ENDED"

    reopened = api.patch(f"/api/v1/books/{book['id']}", json={"ended": False}, headers=AUTH)
    assert reopened.json()["ended"] is False
    assert _join(api, code).status_code == 200


# ── 권한 ───────────────────────────────────────────────


def test_관리자만_하는_일은_멤버에게_없는_것처럼_답한다(api: TestClient) -> None:
    book = _pair(api)
    book_id = book["id"]

    for body in ({"name": "바꾼 이름"}, {"ended": True}):
        r = api.patch(f"/api/v1/books/{book_id}", json=body, headers=OTHER)
        assert r.status_code == 404, body
    assert api.delete(f"/api/v1/books/{book_id}", headers=OTHER).status_code == 404
    owner_id = _member(book, "은홍")
    assert (
        api.delete(f"/api/v1/books/{book_id}/members/{owner_id}", headers=OTHER).status_code == 404
    )

    # 돈 나누기와 예산은 멤버 누구나 고친다.
    r = api.patch(
        f"/api/v1/books/{book_id}",
        json={"settle_rule": "none", "monthly_budget": "500000"},
        headers=OTHER,
    )
    assert r.status_code == 200, r.text
    assert (r.json()["settle_rule"], r.json()["monthly_budget"]) == ("none", "500000")
    cleared = api.patch(f"/api/v1/books/{book_id}", json={"monthly_budget": None}, headers=OTHER)
    assert cleared.json()["monthly_budget"] is None


def test_관리자는_멤버를_내보내고_내보낸_사람은_같은_링크로_못_돌아온다(api: TestClient) -> None:
    """단체방에 올린 링크는 살아 있어야 한다. 막히는 것은 내보낸 사람 하나다."""
    book = _create(api, kind="family", settle_rule="none", name="우리 가족")
    code = book["invite"]["code"]
    joined = _join(api, code).json()
    junho, owner = _member(joined, "준호"), _member(joined, "은홍")
    members = f"/api/v1/books/{book['id']}/members"

    assert api.delete(f"{members}/{owner}", headers=AUTH).status_code == 404
    assert api.delete(f"{members}/{junho}", headers=AUTH).status_code == 204

    assert api.get(f"/api/v1/books/{book['id']}", headers=OTHER).status_code == 404
    assert _error(_join(api, code)) == "INVITE_CLOSED"
    # 내보낸 사람이 옛 링크를 열어도 가계부 근황(이름, 인원, 초대한 사람)은 안 보인다.
    assert api.get(f"/api/v1/invites/{code}", headers=OTHER).json() == {
        "status": "closed",
        "book_kind": "family",
        "book_name": "",
        "inviter_name": None,
        "active_member_count": 0,
        "book_id": None,
        "is_inviter": False,
    }
    after = api.get(f"/api/v1/books/{book['id']}", headers=AUTH).json()
    assert (after["active_member_count"], after["invite"]["code"]) == (1, code)
    # 나간 사람의 이름은 내보내지 않는다.
    gone = next(m for m in after["members"] if m["id"] == junho)
    assert (gone["name"], gone["left"]) == (None, True)

    # 아직 안 들어온 사람은 같은 링크로 들어온다.
    assert api.get(f"/api/v1/invites/{code}", headers=THIRD).json()["status"] == "ok"
    assert _join(api, code, headers=THIRD, name="서연").status_code == 200
    assert _error(_join(api, code)) == "INVITE_CLOSED"


def test_스스로_나간_사람은_살아_있는_링크로_다시_들어온다(api: TestClient) -> None:
    book = _create(api, kind="family", settle_rule="none", name="우리 가족")
    code = book["invite"]["code"]
    assert _join(api, code).status_code == 200
    assert api.post(f"/api/v1/books/{book['id']}/leave", headers=OTHER).status_code == 204

    assert api.get(f"/api/v1/invites/{code}", headers=OTHER).json()["status"] == "ok"
    assert _join(api, code).status_code == 200


# ── 공유 기록 ───────────────────────────────────────────


def test_기록을_적으면_그_달_상태가_함께_온다(api: TestClient) -> None:
    book = _pair(api)
    api.patch(f"/api/v1/books/{book['id']}", json={"monthly_budget": "500000"}, headers=AUTH)

    created = _add(api, book["id"], headers=OTHER, category_id=_category(book, "장보기"))

    entry = created["entry"]
    assert entry["amount"] == "32000"
    assert entry["created_by_member_id"] == _member(book, "준호")
    assert entry["paid_by_member_id"] == _member(book, "준호")
    assert created["month"] == {
        "period_start": "2026-08-01",
        "period_end": "2026-08-31",
        "spent": "32000",
        "budget": "500000",
        "remaining": "468000",
    }
    assert [row["id"] for row in _entries(api, book["id"])] == [entry["id"]]


def test_여행_가계부는_저장_뒤_상태가_여행_전체다(api: TestClient) -> None:
    trip = _create(api, kind="trip", name="우리 여행")
    _add(api, trip["id"], amount="40000", occurred_on="2026-07-30")

    created = _add(api, trip["id"], amount="20000", occurred_on="2026-08-02")

    # 달로 끊으면 8월 20,000 이다. 여행은 7월 30일 기록까지 합쳐 60,000 이다.
    today = datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()
    assert created["month"] == {
        "period_start": "2026-07-30",
        "period_end": today,
        "spent": "60000",
        "budget": None,
        "remaining": None,
    }


def test_다른_가계부의_분류나_멤버가_아닌_낸_사람은_받지_않는다(api: TestClient) -> None:
    book = _pair(api)
    other_book = _create(api, headers=THIRD, my_name="서연")

    r = api.post(
        f"/api/v1/books/{book['id']}/entries",
        json={
            "amount": "1000",
            "occurred_on": "2026-08-01",
            "category_id": _category(other_book, "장보기"),
        },
        headers=AUTH,
    )
    assert _error(r) == "INVALID_CATEGORY"
    r = api.post(
        f"/api/v1/books/{book['id']}/entries",
        json={
            "amount": "1000",
            "occurred_on": "2026-08-01",
            "paid_by_member_id": other_book["my_member_id"],
        },
        headers=AUTH,
    )
    assert r.status_code == 422
    assert _error(r) == "INVALID_REQUEST"


def test_남이_고치면_고친_사람이_남고_적은_사람이_고치면_비운다(api: TestClient) -> None:
    book = _pair(api)
    entry = _add(api, book["id"])["entry"]
    url = f"/api/v1/books/{book['id']}/entries/{entry['id']}"

    by_junho = api.patch(url, json={"amount": "35000"}, headers=OTHER).json()
    assert by_junho["amount"] == "35000"
    assert by_junho["updated_by_member_id"] == _member(book, "준호")

    by_owner = api.patch(
        url, json={"title": "  이마트  ", "paid_by_member_id": _member(book, "준호")}, headers=AUTH
    ).json()
    assert by_owner["title"] == "이마트"
    assert by_owner["paid_by_member_id"] == _member(book, "준호")
    assert by_owner["updated_by_member_id"] is None

    # 금액과 날짜는 비울 수 없다.
    assert api.patch(url, json={"amount": None}, headers=AUTH).status_code == 422


def test_지우기는_적은_사람이나_관리자만_하고_되돌릴_수_있다(api: TestClient) -> None:
    book = _pair(api)
    mine = _add(api, book["id"])["entry"]
    theirs = _add(api, book["id"], headers=OTHER)["entry"]

    listed = {row["id"]: row for row in _entries(api, book["id"], headers=OTHER)}
    assert (listed[mine["id"]]["can_delete"], listed[mine["id"]]["can_move"]) == (False, False)
    assert (listed[theirs["id"]]["can_delete"], listed[theirs["id"]]["can_move"]) == (True, True)

    base = f"/api/v1/books/{book['id']}/entries"
    assert api.delete(f"{base}/{mine['id']}", headers=OTHER).status_code == 404
    # 관리자는 남이 적은 것도 지운다.
    assert api.delete(f"{base}/{theirs['id']}", headers=AUTH).status_code == 204
    assert [row["id"] for row in _entries(api, book["id"])] == [mine["id"]]

    restored = api.post(f"{base}/{theirs['id']}/restore", headers=OTHER)
    assert restored.status_code == 200, restored.text
    assert len(_entries(api, book["id"])) == 2
    # 안 지운 것은 되돌릴 것이 없다.
    assert api.post(f"{base}/{theirs['id']}/restore", headers=OTHER).status_code == 404


def test_내_가계부로_옮긴_기록은_되돌리기로_살아나지_않는다(
    api: TestClient, default_categories: list[Category]
) -> None:
    """준호가 적은 32,000 을 자기 가계부로 옮겼다. 공유 쪽에 다시 서면 같은 돈이 두 번 잡힌다."""
    book = _pair(api)
    entry = _add(api, book["id"], headers=OTHER)["entry"]
    base = f"/api/v1/books/{book['id']}/entries/{entry['id']}"
    moved = api.post(f"{base}/move-out", headers=OTHER)
    assert moved.status_code == 200, moved.text

    # 적은 사람도, 관리자도 못 살린다.
    assert api.post(f"{base}/restore", headers=OTHER).status_code == 404
    assert api.post(f"{base}/restore", headers=AUTH).status_code == 404

    assert _entries(api, book["id"]) == []
    settlement = api.get(f"/api/v1/books/{book['id']}/settlement?{AUG}", headers=AUTH).json()
    assert settlement["total"] == "0"
    personal = api.get(f"/api/v1/transactions?{AUG}", headers=OTHER).json()["items"]
    assert [(row["id"], row["amount"]) for row in personal] == [
        (moved.json()["transaction_id"], "32000")
    ]


# ── 옮기기 ─────────────────────────────────────────────


def _personal(client: TestClient, category_id: str | None, amount: str = "18000") -> dict:
    body = {
        "occurred_at": "2026-08-20T19:30:00+09:00",
        "amount": amount,
        "type": "expense",
        "source": "keypad",
        "merchant": "김밥천국",
        "category_id": category_id,
    }
    r = client.post("/api/v1/transactions", json=body, headers=AUTH)
    assert r.status_code == 201, r.text
    return dict(r.json()["transaction"])


def _personal_items(client: TestClient) -> list[dict]:
    return list(client.get(f"/api/v1/transactions?{AUG}", headers=AUTH).json()["items"])


def _default(rows: list[Category], name: str) -> str:
    return str(next(row.id for row in rows if row.name == name and row.kind.value == "expense"))


def test_내_가계부로_옮기면_같은_이름의_분류로_가고_없으면_기타로_간다(
    api: TestClient, default_categories: list[Category]
) -> None:
    trip = _create(api, kind="trip", name="우리 여행")
    meal = _add(api, trip["id"], category_id=_category(trip, "식비"), title="해장국")["entry"]
    snack = _add(api, trip["id"], category_id=_category(trip, "놀거리"), amount="5000")["entry"]
    base = f"/api/v1/books/{trip['id']}/entries"

    moved = api.post(f"{base}/{meal['id']}/move-out", headers=AUTH)
    assert moved.status_code == 200, moved.text
    api.post(f"{base}/{snack['id']}/move-out", headers=AUTH)

    items = {row["id"]: row for row in _personal_items(api)}
    tx = items[moved.json()["transaction_id"]]
    assert (tx["amount"], tx["merchant"], tx["type"]) == ("32000", "해장국", "expense")
    assert tx["category_id"] == _default(default_categories, "식비")
    assert tx["occurred_at"].startswith("2026-08-15")
    fallback = next(row for row in items.values() if row["amount"] == "5000")
    assert fallback["category_id"] == _default(default_categories, "기타")
    assert _entries(api, trip["id"]) == []


def test_남이_적은_기록은_내_가계부로_옮길_수_없다(api: TestClient) -> None:
    book = _pair(api)
    theirs = _add(api, book["id"], headers=OTHER)["entry"]

    r = api.post(f"/api/v1/books/{book['id']}/entries/{theirs['id']}/move-out", headers=AUTH)
    assert r.status_code == 404


def test_내_지출을_공유_가계부로_옮기면_내_가계부에서_빠진다(
    api: TestClient, default_categories: list[Category]
) -> None:
    trip = _create(api, kind="trip", name="우리 여행")
    tx = _personal(api, _default(default_categories, "식비"))

    r = api.post(
        f"/api/v1/books/{trip['id']}/entries/move-in",
        json={"transaction_id": tx["id"]},
        headers=AUTH,
    )
    assert r.status_code == 201, r.text
    entry = r.json()["entry"]
    assert (entry["amount"], entry["title"], entry["occurred_on"]) == (
        "18000",
        "김밥천국",
        "2026-08-20",
    )
    assert entry["category_id"] == _category(trip, "식비")
    assert entry["paid_by_member_id"] == trip["my_member_id"]
    assert _personal_items(api) == []

    # 같은 이름이 없으면 가계부의 「기타」 다.
    other = _personal(api, _default(default_categories, "구독"), amount="9900")
    r = api.post(
        f"/api/v1/books/{trip['id']}/entries/move-in",
        json={"transaction_id": other["id"]},
        headers=AUTH,
    )
    assert r.json()["entry"]["category_id"] == _category(trip, "기타")


def test_환불이_걸린_지출과_남의_거래는_옮기지_않는다(
    api: TestClient, default_categories: list[Category]
) -> None:
    book = _pair(api)
    tx = _personal(api, _default(default_categories, "식비"))
    refund = {
        "occurred_at": "2026-08-21T10:00:00+09:00",
        "amount": "3000",
        "type": "refund",
        "source": "keypad",
        "refund_of_transaction_id": tx["id"],
    }
    assert api.post("/api/v1/transactions", json=refund, headers=AUTH).status_code == 201

    url = f"/api/v1/books/{book['id']}/entries/move-in"
    r = api.post(url, json={"transaction_id": tx["id"]}, headers=AUTH)
    assert r.status_code == 422
    assert api.post(url, json={"transaction_id": tx["id"]}, headers=OTHER).status_code == 404


# ── 옮기기 되돌리기 ─────────────────────────────────────


def _tag(client: TestClient, name: str = "데이트") -> str:
    r = client.post("/api/v1/tags", json={"name": name}, headers=AUTH)
    assert r.status_code == 201, r.text
    return str(next(row["id"] for row in r.json()["items"] if row["name"] == name))


def test_공유로_옮긴_것을_되돌리면_원래_거래가_태그와_결제_수단째_돌아온다(
    api: TestClient, default_categories: list[Category]
) -> None:
    book = _pair(api)
    body = {
        "occurred_at": "2026-08-20T19:30:00+09:00",
        "amount": "18000",
        "type": "expense",
        "source": "screenshot",
        "merchant": "김밥천국",
        "memo": "둘이 먹음",
        "category_id": _default(default_categories, "식비"),
        "tag_id": _tag(api),
        "payment_method": "credit",
        "excluded_from_budget": True,
    }
    created = api.post("/api/v1/transactions", json=body, headers=AUTH)
    assert created.status_code == 201, created.text
    before = created.json()["transaction"]

    moved = api.post(
        f"/api/v1/books/{book['id']}/entries/move-in",
        json={"transaction_id": before["id"]},
        headers=AUTH,
    )
    assert moved.status_code == 201, moved.text
    entry = moved.json()["entry"]
    base = f"/api/v1/books/{book['id']}/entries/{entry['id']}"

    # 같이 쓰는 사람은 되돌릴 수 없다.
    assert api.post(f"{base}/undo-move-in", headers=OTHER).status_code == 404
    undone = api.post(f"{base}/undo-move-in", headers=AUTH)
    assert undone.status_code == 200, undone.text
    assert undone.json() == {"transaction_id": before["id"]}

    after = _personal_items(api)
    assert len(after) == 1
    keep = ("id", "amount", "merchant", "memo", "category_id", "tag_id", "payment_method")
    assert {k: after[0][k] for k in keep} == {k: before[k] for k in keep}
    assert after[0]["excluded_from_budget"] is True
    assert after[0]["source"] == "screenshot"
    assert after[0]["occurred_at"] == before["occurred_at"]
    assert _entries(api, book["id"]) == []

    # 지운 기록 되돌리기로 다시 살아나면 같은 돈이 두 번 잡힌다.
    assert api.post(f"{base}/restore", headers=AUTH).status_code == 404
    assert api.post(f"{base}/undo-move-in", headers=AUTH).status_code == 404
    assert len(_personal_items(api)) == 1


def test_옮긴_사이_그날_적은_안_썼어요는_옮기기를_되돌리면_걷힌다(
    api: TestClient, default_categories: list[Category]
) -> None:
    book = _pair(api)
    body = {
        "occurred_at": "2026-08-20T19:30:00+09:00",
        "amount": "18000",
        "type": "expense",
        "source": "keypad",
        "merchant": "김밥천국",
        "category_id": _default(default_categories, "식비"),
    }
    created = api.post("/api/v1/transactions", json=body, headers=AUTH)
    assert created.status_code == 201, created.text
    tx_id = created.json()["transaction"]["id"]
    moved = api.post(
        f"/api/v1/books/{book['id']}/entries/move-in",
        json={"transaction_id": tx_id},
        headers=AUTH,
    )
    assert moved.status_code == 201, moved.text
    entry = moved.json()["entry"]

    # 옮기고 나면 그날 목록이 비어 「안 썼어요」 를 적을 수 있다.
    mark = {
        "occurred_at": "2026-08-20T09:00:00+09:00",
        "amount": "0",
        "type": "expense",
        "source": "no_spend",
        "merchant": None,
    }
    marked = api.post("/api/v1/transactions", json=mark, headers=AUTH)
    assert marked.status_code == 201, marked.text

    undone = api.post(
        f"/api/v1/books/{book['id']}/entries/{entry['id']}/undo-move-in", headers=AUTH
    )
    assert undone.status_code == 200, undone.text

    after = _personal_items(api)
    assert [row["id"] for row in after] == [tx_id]
    assert all(row["source"] != "no_spend" for row in after)


def test_옮겨_온_것이_아닌_기록은_옮기기_되돌리기가_없다(api: TestClient) -> None:
    book = _pair(api)
    entry = _add(api, book["id"])["entry"]

    r = api.post(f"/api/v1/books/{book['id']}/entries/{entry['id']}/undo-move-in", headers=AUTH)
    assert r.status_code == 409
    assert _error(r) == "CONFLICT"
    assert len(_entries(api, book["id"])) == 1


def test_내_가계부로_옮긴_것을_되돌리면_낸_사람과_분류와_고친_사람이_그대로다(
    api: TestClient, default_categories: list[Category]
) -> None:
    book = _pair(api)
    date_category = _category(book, "데이트")
    entry = _add(
        api,
        book["id"],
        category_id=date_category,
        title="영화",
        paid_by_member_id=_member(book, "준호"),
    )["entry"]
    base = f"/api/v1/books/{book['id']}/entries/{entry['id']}"
    edited = api.patch(base, json={"memo": "팝콘 포함"}, headers=OTHER)
    assert edited.status_code == 200, edited.text

    moved = api.post(f"{base}/move-out", headers=AUTH)
    assert moved.status_code == 200, moved.text
    assert [row["id"] for row in _personal_items(api)] == [moved.json()["transaction_id"]]

    # 적은 사람만 되돌린다.
    assert api.post(f"{base}/undo-move-out", headers=OTHER).status_code == 404
    undone = api.post(f"{base}/undo-move-out", headers=AUTH)
    assert undone.status_code == 200, undone.text
    back = undone.json()
    assert back["id"] == entry["id"]
    assert (back["paid_by_member_id"], back["category_id"]) == (
        _member(book, "준호"),
        date_category,
    )
    assert back["updated_by_member_id"] == _member(book, "준호")
    assert (back["title"], back["memo"], back["amount"]) == ("영화", "팝콘 포함", "32000")
    assert _personal_items(api) == []
    assert [row["id"] for row in _entries(api, book["id"], headers=OTHER)] == [entry["id"]]

    # 이미 살아 있으면 되돌릴 것이 없다.
    assert api.post(f"{base}/undo-move-out", headers=AUTH).status_code == 404


def test_옮긴_거래에_환불이_붙으면_내_가계부로_옮기기를_되돌리지_않는다(api: TestClient) -> None:
    book = _pair(api)
    entry = _add(api, book["id"])["entry"]
    base = f"/api/v1/books/{book['id']}/entries/{entry['id']}"
    moved = api.post(f"{base}/move-out", headers=AUTH).json()
    refund = {
        "occurred_at": "2026-08-21T10:00:00+09:00",
        "amount": "3000",
        "type": "refund",
        "source": "keypad",
        "refund_of_transaction_id": moved["transaction_id"],
    }
    assert api.post("/api/v1/transactions", json=refund, headers=AUTH).status_code == 201

    r = api.post(f"{base}/undo-move-out", headers=AUTH)
    assert r.status_code == 409
    assert _entries(api, book["id"]) == []


def test_끝난_가계부에서는_옮기기를_되돌리지_않는다(
    api: TestClient, default_categories: list[Category]
) -> None:
    book = _pair(api)
    tx = _personal(api, _default(default_categories, "식비"))
    entry = api.post(
        f"/api/v1/books/{book['id']}/entries/move-in",
        json={"transaction_id": tx["id"]},
        headers=AUTH,
    ).json()["entry"]
    api.patch(f"/api/v1/books/{book['id']}", json={"ended": True}, headers=AUTH)

    r = api.post(f"/api/v1/books/{book['id']}/entries/{entry['id']}/undo-move-in", headers=AUTH)
    assert r.status_code == 409
    assert _error(r) == "BOOK_ENDED"
    assert _personal_items(api) == []


# ── 공유 분류 ───────────────────────────────────────────


def test_공유_분류는_멤버_누구나_만들고_기타_바로_앞에_선다(api: TestClient) -> None:
    book = _pair(api)
    url = f"/api/v1/books/{book['id']}/categories"

    r = api.post(url, json={"name": "  반려동물  ", "icon_key": "07_heart"}, headers=OTHER)
    assert r.status_code == 201, r.text
    made = r.json()
    assert (made["name"], made["icon_key"]) == ("반려동물", "07_heart")

    names = [
        c["name"] for c in api.get(f"/api/v1/books/{book['id']}", headers=AUTH).json()["categories"]
    ]
    assert names[-2:] == ["반려동물", "기타"]
    assert len(names) == len(book["categories"]) + 1

    again = api.post(url, json={"name": "반려동물", "icon_key": "26_sparkles"}, headers=AUTH)
    assert again.status_code == 409
    assert _error(again) == "DUPLICATE_CATEGORY"
    assert again.json()["error"]["message"] == "이미 있는 분류예요."
    assert (
        api.post(url, json={"name": "   ", "icon_key": "07_heart"}, headers=AUTH).status_code == 422
    )


def test_공유_분류는_30개까지다(api: TestClient) -> None:
    book = _create(api)
    url = f"/api/v1/books/{book['id']}/categories"
    for n in range(30 - len(book["categories"])):
        r = api.post(url, json={"name": f"분류{n}", "icon_key": "26_sparkles"}, headers=AUTH)
        assert r.status_code == 201, r.text

    r = api.post(url, json={"name": "하나 더", "icon_key": "26_sparkles"}, headers=AUTH)
    assert r.status_code == 422
    assert len(api.get(f"/api/v1/books/{book['id']}", headers=AUTH).json()["categories"]) == 30


def test_멤버가_아니거나_끝난_가계부에는_분류를_만들_수_없다(api: TestClient) -> None:
    book = _pair(api)
    url = f"/api/v1/books/{book['id']}/categories"
    body = {"name": "반려동물", "icon_key": "07_heart"}

    assert api.post(url, json=body, headers=THIRD).status_code == 404
    api.patch(f"/api/v1/books/{book['id']}", json={"ended": True}, headers=AUTH)
    r = api.post(url, json=body, headers=OTHER)
    assert r.status_code == 409
    assert _error(r) == "BOOK_ENDED"


# ── 정산 ───────────────────────────────────────────────


def test_반반_정산을_끝내고_바뀌면_알리고_되돌린다(api: TestClient) -> None:
    """PRD 숫자: 은홍 304,900, 준호 279,900 → 준호가 은홍에게 12,500."""
    book = _pair(api)
    book_id = book["id"]
    _add(api, book_id, amount="200000")
    _add(api, book_id, amount="104900")
    _add(api, book_id, headers=OTHER, amount="279900")
    url = f"/api/v1/books/{book_id}/settlement"

    result = api.get(f"{url}?{AUG}", headers=OTHER).json()
    assert (result["period"], result["total"], result["rule"]) == ("2026-08", "584800", "even")
    assert result["transfers"] == [
        {
            "from_member_id": _member(book, "준호"),
            "to_member_id": _member(book, "은홍"),
            "amount": "12500",
        }
    ]
    assert result["done"] is None

    done = api.post(f"{url}/done", json={"year": 2026, "month": 8}, headers=OTHER).json()
    assert done["done"]["done_by_member_id"] == _member(book, "준호")
    assert done["changed_after_done"] is False

    _add(api, book_id, amount="1000")
    assert api.get(f"{url}?{AUG}", headers=AUTH).json()["changed_after_done"] is True

    undone = api.delete(f"{url}/done?{AUG}", headers=AUTH).json()
    assert undone["done"] is None
    assert api.delete(f"{url}/done?{AUG}", headers=AUTH).status_code == 404


def test_여행은_달로_끊지_않고_같이_모은_돈은_정산이_없다(api: TestClient) -> None:
    trip = _create(api, kind="trip", name="우리 여행")
    _join(api, trip["invite"]["code"])
    _add(api, trip["id"], amount="40000", occurred_on="2026-07-30")
    _add(api, trip["id"], amount="20000", occurred_on="2026-08-02")

    result = api.get(f"/api/v1/books/{trip['id']}/settlement?{AUG}", headers=AUTH).json()
    assert (result["period"], result["period_start"], result["total"]) == ("all", None, "60000")
    assert [m["share"] for m in result["members"]] == ["30000", "30000"]

    pool = _pair(api, settle_rule="none")
    r = api.post(
        f"/api/v1/books/{pool['id']}/settlement/done", json={"year": 2026, "month": 8}, headers=AUTH
    )
    assert r.status_code == 422
    none = api.get(f"/api/v1/books/{pool['id']}/settlement?{AUG}", headers=AUTH).json()
    assert (none["members"], none["transfers"]) == ([], [])


def test_나갔다_다시_들어와도_예전_기록은_내_것이고_몫은_한_번만_진다(api: TestClient) -> None:
    """준호가 30,000 을 내고 나갔다가 같은 링크로 돌아왔다.

    멤버 줄은 둘이지만 한 사람이다. 둘이 15,000 씩이라 은홍이 15,000 을 보낸다.
    """
    book = _create(api, kind="family", settle_rule="even", name="우리 가족")
    code = book["invite"]["code"]
    _join(api, code)
    # 멤버 기간이 이번 달이라 이번 달에 적는다. 가계부 시간대가 서울이다.
    today = datetime.now(ZoneInfo("Asia/Seoul")).date()
    old = _add(api, book["id"], headers=OTHER, amount="30000", occurred_on=today.isoformat())
    old = old["entry"]
    assert api.post(f"/api/v1/books/{book['id']}/leave", headers=OTHER).status_code == 204

    back = _join(api, code)
    assert back.status_code == 200, back.text
    again = back.json()["my_member_id"]

    listed = api.get(f"/api/v1/books/{book['id']}/entries", headers=OTHER).json()["items"]
    assert [(e["id"], e["can_move"]) for e in listed] == [(old["id"], True)]
    result = api.get(f"/api/v1/books/{book['id']}/settlement", headers=AUTH).json()
    assert [m["member_id"] for m in result["members"]] == [book["my_member_id"], again]
    assert result["transfers"] == [
        {"from_member_id": book["my_member_id"], "to_member_id": again, "amount": "15000"}
    ]


def test_정산을_둘이_거의_같이_끝내도_되돌리기_한_번이면_안_끝낸_상태다(api: TestClient) -> None:
    book = _pair(api)
    _add(api, book["id"], amount="10000")
    url = f"/api/v1/books/{book['id']}/settlement"

    first = api.post(f"{url}/done", json={"year": 2026, "month": 8}, headers=AUTH).json()
    second = api.post(f"{url}/done", json={"year": 2026, "month": 8}, headers=OTHER).json()
    # 같은 보낼 돈이면 먼저 끝낸 것을 그대로 둔다.
    assert second["done"] == first["done"]
    assert second["done"]["done_by_member_id"] == _member(book, "은홍")

    undone = api.delete(f"{url}/done?{AUG}", headers=OTHER).json()
    assert undone["done"] is None
    assert api.get(f"{url}?{AUG}", headers=AUTH).json()["done"] is None


def test_관리자가_나가도_끝낸_정산의_남는_원은_그대로다(api: TestClient) -> None:
    """셋이 100,000 을 나누면 33,333 씩이고 1원이 남는다. 가계부를 만든 은홍이 33,334 를 진다.

    은홍이 나가 준호가 관리자가 되어도 은홍은 그 달 멤버였으니 몫이 그대로다.
    """
    book = _create(api, kind="family", name="우리 가족")
    code = book["invite"]["code"]
    _join(api, code)
    _join(api, code, headers=THIRD, name="서연")
    today = datetime.now(ZoneInfo("Asia/Seoul")).date()
    _add(api, book["id"], headers=THIRD, amount="100000", occurred_on=today.isoformat())
    url = f"/api/v1/books/{book['id']}/settlement"
    month = {"year": today.year, "month": today.month}

    done = api.post(f"{url}/done", json=month, headers=AUTH).json()
    assert [m["share"] for m in done["members"]] == ["33334", "33333", "33333"]
    assert api.post(f"/api/v1/books/{book['id']}/leave", headers=AUTH).status_code == 204
    assert api.get(f"/api/v1/books/{book['id']}", headers=OTHER).json()["my_role"] == "owner"

    after = api.get(f"{url}?year={today.year}&month={today.month}", headers=OTHER).json()
    assert [m["share"] for m in after["members"]] == ["33334", "33333", "33333"]
    assert after["changed_after_done"] is False


def test_나갔다가_다시_들어오면_비어_있던_달은_몫을_안_지고_끝낸_달은_그대로다(
    api: TestClient, db: Session
) -> None:
    """서연은 7월에 들어와 8월 15일에 나갔고 10월 2일에 다시 들어왔다.

    은홍이 8월과 9월에 90,000 씩 냈다.

    8월은 셋이 30,000 씩이라 준호와 서연이 은홍에게 30,000 씩 보낸다.
    9월은 서연이 없던 달이라 둘이 45,000 씩, 준호가 은홍에게 45,000 을 보낸다.
    8월을 끝낸 뒤 서연이 다시 들어와도 8월 기록은 그대로라 바뀐 것이 없다.
    """
    book = _create(api, kind="family", name="우리 가족")
    book_id = book["id"]
    code = book["invite"]["code"]
    _join(api, code)
    _join(api, code, headers=THIRD, name="서연")
    _add(api, book_id, amount="90000", occurred_on="2026-08-10")
    _add(api, book_id, amount="90000", occurred_on="2026-09-10")
    assert api.post(f"/api/v1/books/{book_id}/leave", headers=THIRD).status_code == 204

    def when(month: int, day: int, hour: int = 3) -> datetime:
        return datetime(2026, month, day, hour, tzinfo=UTC)

    def move(name: str, **values: datetime) -> None:
        db.execute(
            update(BookMember)
            .where(BookMember.book_id == uuid.UUID(book_id), BookMember.display_name == name)
            .values(**values)
        )
        db.commit()

    move("은홍", joined_at=when(7, 1, 3))
    move("준호", joined_at=when(7, 1, 4))
    move("서연", joined_at=when(7, 1, 5), left_at=when(8, 15))

    url = f"/api/v1/books/{book_id}/settlement"
    assert api.post(f"{url}/done", json={"year": 2026, "month": 8}, headers=AUTH).status_code == 200

    back = _join(api, code, headers=THIRD, name="서연")
    assert back.status_code == 200, back.text
    seoyeon = back.json()["my_member_id"]
    db.execute(
        update(BookMember).where(BookMember.id == uuid.UUID(seoyeon)).values(joined_at=when(10, 2))
    )
    db.commit()
    owner, junho = book["my_member_id"], _member(back.json(), "준호")

    aug = api.get(f"{url}?{AUG}", headers=AUTH).json()
    assert aug["transfers"] == [
        {"from_member_id": junho, "to_member_id": owner, "amount": "30000"},
        {"from_member_id": seoyeon, "to_member_id": owner, "amount": "30000"},
    ]
    assert aug["done"] is not None
    assert aug["changed_after_done"] is False

    sep = api.get(f"{url}?year=2026&month=9", headers=AUTH).json()
    assert [(m["member_id"], m["share"]) for m in sep["members"]] == [
        (owner, "45000"),
        (junho, "45000"),
    ]
    assert sep["transfers"] == [{"from_member_id": junho, "to_member_id": owner, "amount": "45000"}]


# ── 리포트 ─────────────────────────────────────────────


def test_리포트는_그_달_합계와_분류와_지난달_비교를_싣는다(api: TestClient) -> None:
    book = _pair(api)
    book_id = book["id"]
    api.patch(f"/api/v1/books/{book_id}", json={"monthly_budget": "500000"}, headers=AUTH)
    groceries, eating = _category(book, "장보기"), _category(book, "외식·배달")
    _add(api, book_id, amount="60000", occurred_on="2026-07-10", category_id=groceries)
    _add(api, book_id, amount="100000", occurred_on="2026-08-10", category_id=groceries)
    _add(api, book_id, headers=OTHER, amount="50000", occurred_on="2026-08-11", category_id=eating)

    report = api.get(f"/api/v1/books/{book_id}/report?{AUG}", headers=OTHER).json()

    assert (report["spent"], report["entry_count"], report["remaining"]) == ("150000", 2, "350000")
    assert report["spend_progress"] == "0.3000"
    assert [(row["category_id"], row["amount"]) for row in report["breakdown"]] == [
        (groceries, "100000"),
        (eating, "50000"),
    ]
    insight = report["insight"]
    # 지난 달끼리는 통째로 견준다. 150,000 - 60,000 = 90,000.
    assert (insight["previous_spent_same_window"], insight["compare_delta"]) == ("60000", "90000")
    assert insight["compare_window_end"] == "2026-08-31"
    # 양쪽 달에 다 있는 분류만 「늘었다」 로 친다. 장보기 60,000 → 100,000.
    assert insight["largest_increase"] == {
        "category_id": groceries,
        "current": "100000",
        "previous": "60000",
        "delta": "40000",
    }
    assert [(row["category_id"], row["delta"]) for row in insight["category_changes"]] == [
        (eating, "50000"),
        (groceries, "40000"),
    ]
    assert (insight["projected_month_end"], insight["is_projection_reliable"]) == (None, False)


def test_개인_기록은_공유_가계부로_새지_않고_공유_기록은_개인_합계를_안_바꾼다(
    api: TestClient, default_categories: list[Category]
) -> None:
    """C42. 은홍의 개인 지출 777,000 이 준호 화면 어디에도 없어야 한다."""
    _personal(api, _default(default_categories, "식비"), amount="777000")
    summary = api.get(f"/api/v1/transactions/summary?{AUG}", headers=AUTH).json()

    book = _pair(api)
    _add(api, book["id"], amount="32000")

    for path in (f"entries?{AUG}", f"report?{AUG}", f"settlement?{AUG}", ""):
        r = api.get(f"/api/v1/books/{book['id']}/{path}".rstrip("/"), headers=OTHER)
        assert r.status_code == 200, path
        assert "777000" not in r.text, path
    # 합계에 섞이면 부분 문자열로는 안 보인다(777,000 + 32,000 = 809,000). 합계를 직접 본다.
    report = api.get(f"/api/v1/books/{book['id']}/report?{AUG}", headers=OTHER).json()
    assert (report["spent"], report["entry_count"]) == ("32000", 1)
    settlement = api.get(f"/api/v1/books/{book['id']}/settlement?{AUG}", headers=OTHER).json()
    assert settlement["total"] == "32000"
    assert [row["amount"] for row in _entries(api, book["id"], headers=OTHER)] == ["32000"]
    assert api.get(f"/api/v1/transactions/summary?{AUG}", headers=AUTH).json() == summary
    assert api.get(f"/api/v1/transactions?{AUG}", headers=OTHER).json()["items"] == []


# ── 나가기와 지우기 ─────────────────────────────────────


def test_관리자가_나가면_먼저_들어온_멤버가_관리자가_되고_마지막이_나가면_지워진다(
    api: TestClient,
) -> None:
    book = _create(api, kind="family", settle_rule="none", name="우리 가족")
    code = book["invite"]["code"]
    _join(api, code)
    _join(api, code, headers=THIRD, name="서연")
    book_id = book["id"]

    assert api.post(f"/api/v1/books/{book_id}/leave", headers=AUTH).status_code == 204
    assert api.get(f"/api/v1/books/{book_id}", headers=OTHER).json()["my_role"] == "owner"
    assert api.get(f"/api/v1/books/{book_id}", headers=THIRD).json()["my_role"] == "member"

    api.post(f"/api/v1/books/{book_id}/leave", headers=OTHER)
    api.post(f"/api/v1/books/{book_id}/leave", headers=THIRD)
    assert api.get("/api/v1/books", headers=THIRD).json()["items"] == []
    assert api.post(f"/api/v1/books/{book_id}/restore", headers=THIRD).status_code == 404
    assert api.get(f"/api/v1/invites/{code}", headers=_key(1)).status_code == 404


def test_지운_가계부는_모두에게서_사라지고_지운_관리자만_되살린다(api: TestClient) -> None:
    book = _pair(api)
    book_id = book["id"]

    assert api.delete(f"/api/v1/books/{book_id}", headers=AUTH).status_code == 204
    assert api.get(f"/api/v1/books/{book_id}", headers=OTHER).status_code == 404
    assert api.get("/api/v1/books", headers=OTHER).json()["items"] == []
    assert api.post(f"/api/v1/books/{book_id}/restore", headers=OTHER).status_code == 404

    restored = api.post(f"/api/v1/books/{book_id}/restore", headers=AUTH)
    assert restored.status_code == 200, restored.text
    # 지울 때 닫은 초대는 되살리지 않는다. 필요하면 새로 만든다.
    assert restored.json()["invite"] is None
    assert api.get(f"/api/v1/books/{book_id}", headers=OTHER).status_code == 200


def test_지운_지_30일이_지나면_되살릴_수_없다(api: TestClient, db: Session) -> None:
    book = _create(api)
    api.delete(f"/api/v1/books/{book['id']}", headers=AUTH)
    db.execute(
        update(Book)
        .where(Book.name == "우리 집")
        .values(deleted_at=datetime.now(UTC) - timedelta(days=31))
    )
    db.commit()

    assert api.post(f"/api/v1/books/{book['id']}/restore", headers=AUTH).status_code == 404


# ── 이메일로 합치기 ─────────────────────────────────────


@pytest.fixture
def mail() -> Iterator[None]:
    get_email_sender.cache_clear()
    yield
    get_email_sender.cache_clear()


def _link_email(client: TestClient, headers: dict[str, str]) -> None:
    email = "shared@example.com"
    assert (
        client.post("/api/v1/account/email/start", json={"email": email}, headers=AUTH).status_code
        == 204
    )
    code = client.get(f"/api/v1/account/email/peek?email={email}", headers=AUTH).json()["code"]
    r = client.post(
        "/api/v1/account/email/verify", json={"email": email, "code": code}, headers=headers
    )
    assert r.status_code == 200, r.text


def test_공유_가계부만_있는_기기를_이메일로_이으면_멤버십이_따라온다(
    api: TestClient, mail: None
) -> None:
    """기록 없이 초대받아 들어온 기기다. 합친 뒤 그 사람이 가계부를 잃으면 안 된다."""
    _link_email(api, AUTH)
    book = _create(api, headers=OTHER, my_name="준호")

    _link_email(api, OTHER)

    listed = api.get("/api/v1/books", headers=AUTH).json()["items"]
    assert [(item["id"], item["my_role"]) for item in listed] == [(book["id"], "owner")]


def test_같은_가계부의_두_멤버를_합치면_기록이_한_사람에게_모인다(
    api: TestClient, db: Session, mail: None
) -> None:
    _link_email(api, AUTH)
    book = _pair(api)
    entry = _add(api, book["id"], headers=OTHER)["entry"]

    _link_email(api, OTHER)

    after = api.get(f"/api/v1/books/{book['id']}", headers=OTHER).json()
    assert after["active_member_count"] == 1
    assert after["my_member_id"] == _member(book, "은홍")
    users = {u.id for u in db.scalars(select(User).where(User.deleted_at.is_(None)))}
    active = db.scalars(select(BookMember).where(BookMember.left_at.is_(None))).all()
    assert [m.user_id in users for m in active] == [True]
    # 준호 기기로 적은 기록이 이제 은홍 멤버 줄의 것이다.
    listed = _entries(api, book["id"], headers=AUTH)
    assert [(e["id"], e["created_by_member_id"], e["can_move"]) for e in listed] == [
        (entry["id"], after["my_member_id"], True)
    ]
