"""공유 가계부 시작일, 회비 비율, 입금, 회비 상태, 멤버 내역.

AUTH 가 은홍(만든 사람), OTHER 가 준호다. 오늘은 2026년 10월 5일로 묶는다.
시작일 25 면 10월 5일은 「10월」(9월 25일 ~ 10월 24일)에 든다. 기대값은 손으로 셈했다.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.core.config import get_settings
from app.integrations.email.factory import get_email_sender
from app.models import Book, BookMember
from app.modules.books import service
from app.modules.imports.service import _book_spends

AUTH = {"X-Anon-Key": "test-anon-key"}
OTHER = {"X-Anon-Key": "second-device-key"}
THIRD = {"X-Anon-Key": "third-device-key"}
OCT = "year=2026&month=10"
TODAY = date(2026, 10, 5)


@pytest.fixture
def api(two_devices: TestClient, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("SHARED_BOOKS_ENABLED", "true")
    monkeypatch.setattr(service, "_today", lambda book: TODAY)
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


def _pair(client: TestClient, db: Session, **over: Any) -> dict:
    """은홍이 만들고 준호가 들어온 가계부. 둘 다 9월 1일부터 멤버였던 것으로 당긴다."""
    book = _create(client, **over)
    r = _join(client, book["invite"]["code"])
    assert r.status_code == 200, r.text
    _backdate(db, book["id"])
    return r.json()


def _backdate(db: Session, book_id: str) -> None:
    """정산은 멤버였던 기간을 본다. 테스트를 언제 돌려도 10월 기간에 둘이 있게 한다.

    들어온 순서는 지킨다. 정산 줄이 들어온 순서라 은홍이 앞이다.
    """
    rows = db.scalars(
        select(BookMember)
        .where(BookMember.book_id == uuid.UUID(book_id))
        .order_by(BookMember.joined_at)
    ).all()
    for minute, row in enumerate(rows):
        db.execute(
            update(BookMember)
            .where(BookMember.id == row.id)
            .values(joined_at=datetime(2026, 9, 1, 3, minute, tzinfo=UTC))
        )
    db.commit()


def _member(book: dict, name: str) -> str:
    return next(m["id"] for m in book["members"] if m["name"] == name)


def _add(client: TestClient, book_id: str, headers: dict[str, str] = AUTH, **over: Any) -> dict:
    body: dict[str, Any] = {"amount": "10000", "occurred_on": "2026-10-05"}
    body.update(over)
    r = client.post(f"/api/v1/books/{book_id}/entries", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def _deposit(client: TestClient, book_id: str, headers: dict[str, str] = AUTH, **over: Any) -> dict:
    return _add(client, book_id, headers, kind="deposit", **over)


def _patch(client: TestClient, book_id: str, body: dict, headers: dict[str, str] = AUTH) -> Any:
    return client.patch(f"/api/v1/books/{book_id}", json=body, headers=headers)


def _message(r: Any) -> str:
    return str(r.json()["error"]["message"])


def _dues(client: TestClient, book_id: str, headers: dict[str, str] = AUTH) -> dict:
    r = client.get(f"/api/v1/books/{book_id}/dues", headers=headers)
    assert r.status_code == 200, r.text
    return dict(r.json())


def _statuses(dues: dict) -> list[str]:
    return [m["status"] for m in dues["members"]]


# ── 시작일 ─────────────────────────────────────────────


def test_시작일_25면_10월_5일은_9월_25일부터_10월_24일인_10월이다(
    api: TestClient, db: Session
) -> None:
    book = _pair(api, db)
    book_id = book["id"]
    # 관리자가 아닌 준호도 바꾼다. 회비, 예산과 같은 규칙이다.
    r = _patch(api, book_id, {"month_start_day": 25}, headers=OTHER)
    assert r.status_code == 200, r.text
    assert r.json()["month_start_day"] == 25

    created = _add(api, book_id, amount="1000", occurred_on="2026-10-05")
    assert (created["month"]["period_start"], created["month"]["period_end"]) == (
        "2026-09-25",
        "2026-10-24",
    )
    _add(api, book_id, amount="2000", occurred_on="2026-09-24")
    _add(api, book_id, amount="32000", occurred_on="2026-09-01")
    _add(api, book_id, amount="4000", occurred_on="2026-09-25")
    _add(api, book_id, headers=OTHER, amount="8000", occurred_on="2026-10-24")
    _add(api, book_id, amount="16000", occurred_on="2026-10-25")

    def days(query: str) -> list[str]:
        r = api.get(f"/api/v1/books/{book_id}/entries{query}", headers=AUTH)
        return [row["occurred_on"] for row in r.json()["items"]]

    october = ["2026-10-24", "2026-10-05", "2026-09-25"]
    assert days("") == october
    assert days(f"?{OCT}") == october
    # 「9월」 은 8월 25일 ~ 9월 24일이다.
    assert days("?year=2026&month=9") == ["2026-09-24", "2026-09-01"]

    settle = api.get(f"/api/v1/books/{book_id}/settlement?{OCT}", headers=AUTH).json()
    assert (settle["period"], settle["period_start"], settle["period_end"]) == (
        "2026-10",
        "2026-09-25",
        "2026-10-24",
    )
    # 1,000 + 4,000 + 8,000. 은홍 5,000, 준호 8,000 이라 은홍이 1,500 을 보낸다.
    assert settle["total"] == "13000"
    assert settle["transfers"] == [
        {
            "from_member_id": _member(book, "은홍"),
            "to_member_id": _member(book, "준호"),
            "amount": "1500",
        }
    ]

    done = api.post(
        f"/api/v1/books/{book_id}/settlement/done", json={"year": 2026, "month": 10}, headers=AUTH
    ).json()
    assert done["period"] == "2026-10"
    # 달을 안 보내도 오늘이 든 「10월」 이라 끝낸 것이 보인다.
    assert api.get(f"/api/v1/books/{book_id}/settlement", headers=AUTH).json()["done"] is not None

    report = api.get(f"/api/v1/books/{book_id}/report?{OCT}", headers=AUTH).json()
    assert (report["period_start"], report["spent"], report["entry_count"]) == (
        "2026-09-25",
        "13000",
        3,
    )
    # 이번 창은 9/25 ~ 10/5 열하루, 지난 창은 8/25 ~ 9/4 열하루다. 9/1 은 들고 9/24 는 빠진다.
    insight = report["insight"]
    assert (insight["compare_window_end"], insight["previous_spent_same_window"]) == (
        "2026-10-05",
        "32000",
    )


def test_시작일은_1부터_28까지이고_비울_수_없다(api: TestClient, db: Session) -> None:
    book = _pair(api, db)
    for value in (0, 29, None, "abc"):
        r = _patch(api, book["id"], {"month_start_day": value})
        assert r.status_code == 422, value
    assert api.get(f"/api/v1/books/{book['id']}", headers=AUTH).json()["month_start_day"] == 1


# ── 회비 비율 ───────────────────────────────────────────


def test_비율은_10퍼센트_단위로_합_100이고_지금_멤버_모두여야_한다(
    api: TestClient, db: Session
) -> None:
    book = _pair(api, db)
    me, junho = _member(book, "은홍"), _member(book, "준호")
    url = book["id"]

    cases = [
        ({me: 50, junho: 40}, "합이 100%가 되게 맞춰 주세요(지금 90%)."),
        ({me: 85, junho: 15}, "비율은 10% 단위로 정해 주세요."),
        ({me: 110, junho: -10}, "비율은 0%부터 100%까지예요."),
        ({me: 100}, "비율은 지금 멤버 모두에게 정해 주세요."),
        ({me: 50, junho: 40, str(uuid.uuid4()): 10}, "비율은 지금 멤버 모두에게 정해 주세요."),
    ]
    for body, message in cases:
        r = _patch(api, url, {"share_percents": body})
        assert (r.status_code, _message(r)) == (422, message), body

    r = _patch(api, url, {"share_percents": {me: 60, junho: 40}}, headers=OTHER)
    assert r.status_code == 200, r.text
    assert r.json()["share_percents"] == {me: 60, junho: 40}

    # 멤버가 아니면 있는지도 알리지 않는다.
    _create(api, headers=THIRD)
    r = _patch(api, url, {"share_percents": {me: 50, junho: 50}}, headers=THIRD)
    assert r.status_code == 404

    cleared = _patch(api, url, {"share_percents": None}).json()
    assert cleared["share_percents"] is None


def test_멤버가_들어오거나_나가거나_내보내지면_비율이_똑같이로_돌아간다(
    api: TestClient, db: Session
) -> None:
    book = _pair(api, db, kind="family", name="우리 가족")
    me, junho = _member(book, "은홍"), _member(book, "준호")
    book_id = book["id"]

    def set_ratio(percents: dict[str, int]) -> None:
        r = _patch(api, book_id, {"share_percents": percents})
        assert r.status_code == 200, r.text

    set_ratio({me: 60, junho: 40})
    third = _join(api, book["invite"]["code"], headers=THIRD, name="서연")
    assert third.json()["share_percents"] is None
    seoyeon = third.json()["my_member_id"]

    set_ratio({me: 40, junho: 30, seoyeon: 30})
    assert api.post(f"/api/v1/books/{book_id}/leave", headers=THIRD).status_code == 204
    assert api.get(f"/api/v1/books/{book_id}", headers=AUTH).json()["share_percents"] is None

    set_ratio({me: 70, junho: 30})
    assert api.delete(f"/api/v1/books/{book_id}/members/{junho}", headers=AUTH).status_code == 204
    assert api.get(f"/api/v1/books/{book_id}", headers=AUTH).json()["share_percents"] is None


def test_나중에_정산은_비율대로_나누고_문장이_쓸_비율을_싣는다(
    api: TestClient, db: Session
) -> None:
    """합계 100,000 을 은홍 60, 준호 40 으로. 은홍이 다 냈으니 준호가 40,000 을 보낸다."""
    book = _pair(api, db)
    me, junho = _member(book, "은홍"), _member(book, "준호")
    _patch(api, book["id"], {"share_percents": {me: 60, junho: 40}})
    _add(api, book["id"], amount="100000")

    result = api.get(f"/api/v1/books/{book['id']}/settlement?{OCT}", headers=OTHER).json()

    assert result["ratio"] is True
    assert [(m["member_id"], m["share"], m["percent"]) for m in result["members"]] == [
        (me, "60000", 60),
        (junho, "40000", 40),
    ]
    assert result["transfers"] == [{"from_member_id": junho, "to_member_id": me, "amount": "40000"}]


# ── 입금 ───────────────────────────────────────────────


def test_입금은_쓴_돈과_정산과_리포트_어디에도_안_든다(api: TestClient, db: Session) -> None:
    book = _pair(api, db)
    book_id = book["id"]
    _patch(api, book_id, {"monthly_budget": "500000"})

    put = _deposit(api, book_id, headers=OTHER, amount="300000")
    assert put["entry"]["kind"] == "deposit"
    assert put["entry"]["paid_by_member_id"] == _member(book, "준호")
    assert put["entry"]["can_move"] is False
    assert (put["month"]["spent"], put["month"]["deposited"]) == ("0", "300000")
    assert put["month"]["remaining"] == "500000"

    spent = _add(api, book_id, amount="50000")
    assert spent["entry"]["kind"] == "expense"
    assert (spent["month"]["spent"], spent["month"]["deposited"]) == ("50000", "300000")

    settle = api.get(f"/api/v1/books/{book_id}/settlement?{OCT}", headers=AUTH).json()
    assert settle["total"] == "50000"
    assert [m["paid"] for m in settle["members"]] == ["50000", "0"]

    report = api.get(f"/api/v1/books/{book_id}/report?{OCT}", headers=AUTH).json()
    assert (report["spent"], report["entry_count"], report["breakdown_total"]) == (
        "50000",
        1,
        "50000",
    )


def test_입금은_분류를_달지_않고_내_가계부로_옮기지_않는다(api: TestClient, db: Session) -> None:
    book = _pair(api, db, settle_rule="none")
    book_id = book["id"]
    category = book["categories"][0]["id"]

    r = api.post(
        f"/api/v1/books/{book_id}/entries",
        json={
            "kind": "deposit",
            "amount": "1000",
            "occurred_on": "2026-10-05",
            "category_id": category,
        },
        headers=AUTH,
    )
    assert (r.status_code, _message(r)) == (422, "입금에는 분류를 달 수 없어요.")

    entry = _deposit(api, book_id, amount="1000")["entry"]
    r = api.patch(
        f"/api/v1/books/{book_id}/entries/{entry['id']}",
        json={"category_id": category},
        headers=AUTH,
    )
    assert (r.status_code, _message(r)) == (422, "입금에는 분류를 달 수 없어요.")
    # 금액과 메모는 고친다. 종류는 그대로다.
    r = api.patch(
        f"/api/v1/books/{book_id}/entries/{entry['id']}",
        json={"amount": "2000", "memo": "10월 회비"},
        headers=AUTH,
    )
    assert (r.json()["kind"], r.json()["amount"], r.json()["memo"]) == (
        "deposit",
        "2000",
        "10월 회비",
    )

    r = api.post(f"/api/v1/books/{book_id}/entries/{entry['id']}/move-out", headers=AUTH)
    assert (r.status_code, _message(r)) == (422, "입금은 내 가계부로 옮길 수 없어요.")


def test_옛_화면은_입금을_못_보고_돈_나누기_값도_그대로다(api: TestClient, db: Session) -> None:
    """옛 번들은 include_deposits 와 kind 를 모른다. 지출만 받아 그리고 even, none 을 보낸다."""
    book = _pair(api, db, settle_rule="none")
    book_id = book["id"]
    assert book["settle_rule"] == "none"
    _deposit(api, book_id, amount="300000")
    old = api.post(
        f"/api/v1/books/{book_id}/entries",
        json={"amount": "7000", "occurred_on": "2026-10-05"},
        headers=OTHER,
    ).json()["entry"]
    assert old["kind"] == "expense"

    plain = api.get(f"/api/v1/books/{book_id}/entries", headers=AUTH).json()["items"]
    assert [row["id"] for row in plain] == [old["id"]]
    both = api.get(f"/api/v1/books/{book_id}/entries?include_deposits=true", headers=AUTH)
    assert sorted(row["kind"] for row in both.json()["items"]) == ["deposit", "expense"]

    r = _patch(api, book_id, {"settle_rule": "even"})
    assert r.json()["settle_rule"] == "even"
    # 같이 모은 돈(none)의 정산 끝내기는 지금처럼 막힌다.
    _patch(api, book_id, {"settle_rule": "none"})
    r = api.post(
        f"/api/v1/books/{book_id}/settlement/done", json={"year": 2026, "month": 10}, headers=AUTH
    )
    assert r.status_code == 422


# ── 회비 상태 ───────────────────────────────────────────


def test_각자_입금은_넣은_돈을_비율대로_낼_돈과_견준다(api: TestClient, db: Session) -> None:
    """한 달 회비 500,000 을 6:4 로. 은홍 300,000, 준호 200,000 을 내야 한다."""
    book = _pair(api, db, settle_rule="none")
    me, junho = _member(book, "은홍"), _member(book, "준호")
    book_id = book["id"]

    first = _dues(api, book_id)
    assert (first["rule"], first["period_key"], first["dues_amount"]) == ("none", "2026-10", None)
    # 회비를 정하지 않았으면 한 번이라도 넣었나만 본다.
    assert [(m["due"], m["status"]) for m in first["members"]] == [(None, "pending")] * 2

    r = _patch(api, book_id, {"dues_amount": "500000", "share_percents": {me: 60, junho: 40}})
    assert (r.json()["dues_amount"], r.json()["share_percents"]) == ("500000", {me: 60, junho: 40})
    _deposit(api, book_id, amount="300000")
    _deposit(api, book_id, headers=OTHER, amount="100000")
    # 다른 달 입금은 안 센다.
    _deposit(api, book_id, headers=OTHER, amount="100000", occurred_on="2026-09-24")

    dues = _dues(api, book_id)
    assert dues["ratio"] is True
    assert [
        (m["member_id"], m["percent"], m["due"], m["deposited"], m["status"])
        for m in dues["members"]
    ] == [
        (me, 60, "300000", "300000", "done"),
        (junho, 40, "200000", "100000", "pending"),
    ]

    _deposit(api, book_id, headers=OTHER, amount="100000")
    assert _statuses(_dues(api, book_id)) == ["done", "done"]

    # 회비를 지우면 넣은 적이 있나만 본다.
    _patch(api, book_id, {"dues_amount": None})
    assert [(m["due"], m["status"]) for m in _dues(api, book_id)["members"]] == [(None, "done")] * 2


def test_나중에_정산은_끝냈으면_모두_정산완료다(api: TestClient, db: Session) -> None:
    book = _pair(api, db)
    book_id = book["id"]
    url = f"/api/v1/books/{book_id}/settlement"

    empty = _dues(api, book_id)
    assert (empty["rule"], _statuses(empty)) == ("even", ["none", "none"])

    _add(api, book_id, amount="5000")
    _add(api, book_id, headers=OTHER, amount="5000")
    # 둘이 5,000 씩 내 주고받을 돈이 없다.
    assert _statuses(_dues(api, book_id)) == ["done", "done"]

    _add(api, book_id, amount="10000")
    assert _statuses(_dues(api, book_id)) == ["pending", "pending"]

    assert (
        api.post(f"{url}/done", json={"year": 2026, "month": 10}, headers=OTHER).status_code == 200
    )
    assert _statuses(_dues(api, book_id)) == ["done", "done"]

    # 끝낸 뒤 기록이 바뀌면 다시 계산한다.
    _add(api, book_id, amount="2000")
    assert _statuses(_dues(api, book_id)) == ["pending", "pending"]


# ── 멤버 내역 ───────────────────────────────────────────


def _history(
    client: TestClient,
    book_id: str,
    member_id: str,
    query: str = "",
    headers: dict[str, str] = AUTH,
) -> Any:
    return client.get(
        f"/api/v1/books/{book_id}/members/{member_id}/entries{query}", headers=headers
    )


def _pages(client: TestClient, book_id: str, member_id: str, limit: int) -> list[list[dict]]:
    """next_cursor 를 따라 끝까지 받는다."""
    pages: list[list[dict]] = []
    cursor = ""
    while True:
        r = _history(client, book_id, member_id, f"?limit={limit}{cursor}")
        assert r.status_code == 200, r.text
        body = r.json()
        pages.append(body["items"])
        if body["next_cursor"] is None:
            return pages
        assert body["next_cursor"] == body["items"][-1]["id"]
        cursor = f"&cursor={body['next_cursor']}"


def test_멤버_내역은_낸_지출과_넣은_입금을_최신순으로_limit_줄씩_나눠_싣는다(
    api: TestClient, db: Session
) -> None:
    book = _pair(api, db, settle_rule="none")
    book_id, junho = book["id"], _member(book, "준호")
    # 준호가 적었지만 낸 사람이 은홍인 것은 은홍 내역이다.
    _add(api, book_id, headers=OTHER, amount="999", paid_by_member_id=_member(book, "은홍"))
    for amount in ("1000", "2000", "3000"):
        _add(api, book_id, headers=OTHER, amount=amount, occurred_on="2026-10-03")
    _deposit(api, book_id, headers=OTHER, amount="50000", occurred_on="2026-10-01")
    _add(api, book_id, headers=OTHER, amount="4000", occurred_on="2026-09-20")
    gone = _add(api, book_id, headers=OTHER, amount="7777", occurred_on="2026-09-20")
    api.delete(f"/api/v1/books/{book_id}/entries/{gone['entry']['id']}", headers=OTHER)
    # 지운 입금도 합계와 목록에서 빠진다.
    gone_deposit = _deposit(api, book_id, headers=OTHER, amount="8888", occurred_on="2026-09-21")
    api.delete(f"/api/v1/books/{book_id}/entries/{gone_deposit['entry']['id']}", headers=OTHER)

    first = _history(api, book_id, junho, "?limit=2").json()
    assert (first["name"], first["paid_total"], first["deposited_total"]) == (
        "준호",
        "10000",
        "50000",
    )

    pages = _pages(api, book_id, junho, limit=2)
    assert [len(page) for page in pages] == [2, 2, 1]
    rows = [row for page in pages for row in page]
    # 같은 날 안의 순서는 적은 시각이라 여기서 안 본다. 날짜 순서와 빠짐, 겹침만 본다.
    assert [row["occurred_on"] for row in rows] == ["2026-10-03"] * 3 + [
        "2026-10-01",
        "2026-09-20",
    ]
    assert sorted(row["amount"] for row in rows[:3]) == ["1000", "2000", "3000"]
    assert [(row["kind"], row["amount"]) for row in rows[3:]] == [
        ("deposit", "50000"),
        ("expense", "4000"),
    ]
    assert len({row["id"] for row in rows}) == 5


def test_멤버_내역은_하루에_많이_적어도_한_쪽이_limit_을_넘지_않는다(
    api: TestClient, db: Session
) -> None:
    book = _pair(api, db)
    book_id, junho = book["id"], _member(book, "준호")
    made = {
        _add(api, book_id, headers=OTHER, amount=str(1000 + n))["entry"]["id"] for n in range(7)
    }

    pages = _pages(api, book_id, junho, limit=3)
    assert [len(page) for page in pages] == [3, 3, 1]
    assert {row["id"] for page in pages for row in page} == made

    # 다른 가계부의 줄이나 없는 줄을 커서로 주면 422 다.
    elsewhere = _create(api, headers=THIRD, name="남의 집")
    stranger = _add(api, elsewhere["id"], headers=THIRD)["entry"]["id"]
    for cursor in (stranger, str(uuid.uuid4())):
        assert _history(api, book_id, junho, f"?cursor={cursor}").status_code == 422


def test_나갔다_다시_들어온_사람의_내역은_예전_줄_기록까지_모인다(api: TestClient) -> None:
    book = _create(api, kind="family", name="우리 가족", settle_rule="none")
    code = book["invite"]["code"]
    old_id = _join(api, code).json()["my_member_id"]
    _deposit(api, book["id"], headers=OTHER, amount="10000", occurred_on="2026-09-30")
    assert api.post(f"/api/v1/books/{book['id']}/leave", headers=OTHER).status_code == 204

    left = _history(api, book["id"], old_id).json()
    # 나간 사람의 이름은 내보내지 않는다.
    assert (left["name"], left["deposited_total"]) == (None, "10000")

    back = _join(api, code, name="준호2").json()
    _deposit(api, book["id"], headers=OTHER, amount="20000")
    for member_id in (back["my_member_id"], old_id):
        history = _history(api, book["id"], member_id).json()
        assert (history["name"], history["deposited_total"]) == ("준호2", "30000")
        assert [row["amount"] for row in history["items"]] == ["20000", "10000"]
        assert "user_id" not in history


def test_멤버가_아니면_회비와_멤버_내역을_못_보고_다른_가계부_멤버_id_도_404다(
    api: TestClient, db: Session
) -> None:
    book = _pair(api, db)
    elsewhere = _create(api, headers=THIRD, name="남의 집")
    stranger = elsewhere["my_member_id"]

    assert api.get(f"/api/v1/books/{book['id']}/dues", headers=THIRD).status_code == 404
    assert _history(api, book["id"], _member(book, "준호"), headers=THIRD).status_code == 404
    assert _history(api, book["id"], stranger).status_code == 404
    assert _history(api, book["id"], str(uuid.uuid4())).status_code == 404
    assert _history(api, book["id"], _member(book, "준호"), "?limit=0").status_code == 422
    assert _history(api, book["id"], _member(book, "준호"), "?limit=101").status_code == 422


# ── 끝낸 정산과 비율 ────────────────────────────────────

SEPT = "year=2026&month=9"


def _settlement(client: TestClient, book_id: str, query: str) -> dict:
    r = client.get(f"/api/v1/books/{book_id}/settlement?{query}", headers=AUTH)
    assert r.status_code == 200, r.text
    return dict(r.json())


def _done(client: TestClient, book_id: str, month: int) -> None:
    r = client.post(
        f"/api/v1/books/{book_id}/settlement/done",
        json={"year": 2026, "month": month},
        headers=AUTH,
    )
    assert r.status_code == 200, r.text


def _sent(settle: dict) -> list[tuple[str, str, str]]:
    return [(t["from_member_id"], t["to_member_id"], t["amount"]) for t in settle["transfers"]]


def test_끝낸_정산은_비율이나_사람이_바뀌어도_끝낼_때의_비율로_센다(
    api: TestClient, db: Session
) -> None:
    """9월은 똑같이로, 10월은 6:4 로 끝낸다. 은홍이 두 달 다 100,000 을 냈다."""
    book = _pair(api, db, kind="family", name="우리 가족")
    me, junho = _member(book, "은홍"), _member(book, "준호")
    book_id = book["id"]
    _add(api, book_id, amount="100000", occurred_on="2026-09-10")
    _done(api, book_id, 9)

    assert _patch(api, book_id, {"share_percents": {me: 60, junho: 40}}).status_code == 200
    september = _settlement(api, book_id, SEPT)
    assert (september["ratio"], september["changed_after_done"]) == (False, False)
    assert [(m["share"], m["percent"]) for m in september["members"]] == [
        ("50000", None),
        ("50000", None),
    ]
    assert _sent(september) == [(junho, me, "50000")]

    _add(api, book_id, amount="100000")
    october = _settlement(api, book_id, OCT)
    assert october["ratio"] is True
    assert _sent(october) == [(junho, me, "40000")]
    _done(api, book_id, 10)

    # 서연이 11월에 들어와 비율이 비어도 끝낸 10월은 6:4 그대로다.
    joined = _join(api, book["invite"]["code"], headers=THIRD, name="서연").json()
    assert joined["share_percents"] is None
    db.execute(
        update(BookMember)
        .where(BookMember.id == uuid.UUID(joined["my_member_id"]))
        .values(joined_at=datetime(2026, 11, 1, 3, 0, tzinfo=UTC))
    )
    db.commit()
    kept = _settlement(api, book_id, OCT)
    assert (kept["ratio"], kept["changed_after_done"]) == (True, False)
    assert [m["percent"] for m in kept["members"]] == [60, 40]
    assert _sent(kept) == [(junho, me, "40000")]
    assert _statuses(_dues(api, book_id))[:2] == ["done", "done"]

    # 끝내기를 되돌리면 지금 비율(똑같이)로 다시 센다.
    r = api.delete(f"/api/v1/books/{book_id}/settlement/done?{OCT}", headers=AUTH)
    assert r.status_code == 200, r.text
    assert (r.json()["ratio"], r.json()["done"]) == (False, None)
    assert _sent(r.json()) == [(junho, me, "50000")]


def test_정산_끝내기_되돌리기는_가계부_줄을_잠근다(
    api: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    book = _pair(api, db)
    _add(api, book["id"], amount="10000")
    _done(api, book["id"], 10)

    locks: list[bool] = []
    original = service._access

    def spy(*args: Any, **kwargs: Any) -> Any:
        locks.append(bool(kwargs.get("lock", False)))
        return original(*args, **kwargs)

    monkeypatch.setattr(service, "_access", spy)
    r = api.delete(f"/api/v1/books/{book['id']}/settlement/done?{OCT}", headers=AUTH)
    assert r.status_code == 200, r.text
    assert locks == [True]


# ── 회비 상태의 빈자리 ──────────────────────────────────


def test_비율_0퍼센트인_사람은_낼_돈이_없어_입금완료가_붙지_않는다(
    api: TestClient, db: Session
) -> None:
    book = _pair(api, db, settle_rule="none")
    me, junho = _member(book, "은홍"), _member(book, "준호")
    r = _patch(api, book["id"], {"dues_amount": "300000", "share_percents": {me: 100, junho: 0}})
    assert r.status_code == 200, r.text

    dues = _dues(api, book["id"])
    assert [(m["due"], m["status"]) for m in dues["members"]] == [
        ("300000", "pending"),
        ("0", "none"),
    ]
    _deposit(api, book["id"], amount="300000")
    assert _statuses(_dues(api, book["id"])) == ["done", "none"]


def test_여행_가계부는_한_달_회비가_있어도_낼_돈을_싣지_않는다(api: TestClient) -> None:
    book = _create(api, kind="trip", name="제주", settle_rule="none")
    r = _patch(api, book["id"], {"dues_amount": "100000"})
    assert r.status_code == 200, r.text

    dues = _dues(api, book["id"])
    assert (dues["period_key"], dues["dues_amount"]) == ("all", "100000")
    assert [(m["due"], m["status"]) for m in dues["members"]] == [(None, "pending")]
    _deposit(api, book["id"], amount="20000")
    assert [(m["due"], m["status"]) for m in _dues(api, book["id"])["members"]] == [(None, "done")]


def test_끝낸_달_뒤에_들어온_사람은_그_달_정산완료가_아니다(api: TestClient, db: Session) -> None:
    book = _pair(api, db, kind="family", name="우리 가족")
    _add(api, book["id"], amount="10000", occurred_on="2026-09-10")
    _done(api, book["id"], 9)
    # 서연은 오늘 들어왔다. 9월 사람이 아니다.
    assert _join(api, book["invite"]["code"], headers=THIRD, name="서연").status_code == 200

    r = api.get(f"/api/v1/books/{book['id']}/dues?{SEPT}", headers=AUTH)
    assert _statuses(r.json()) == ["done", "done", "none"]


# ── 시작일과 해 넘김 ────────────────────────────────────


def test_시작일_20이면_12월_25일은_다음_해_1월이다(api: TestClient, db: Session) -> None:
    """12월 20일 ~ 1월 19일은 1월 날이 열아흐레로 더 많아 「2027년 1월」 이다."""
    book = _pair(api, db)
    book_id = book["id"]
    assert _patch(api, book_id, {"month_start_day": 20}).status_code == 200
    entry = _add(api, book_id, amount="5000", occurred_on="2026-12-25")
    assert (entry["month"]["period_start"], entry["month"]["period_end"]) == (
        "2026-12-20",
        "2027-01-19",
    )

    january = "year=2027&month=1"
    r = api.get(f"/api/v1/books/{book_id}/entries?{january}", headers=AUTH)
    assert [row["id"] for row in r.json()["items"]] == [entry["entry"]["id"]]
    december = api.get(f"/api/v1/books/{book_id}/entries?year=2026&month=12", headers=AUTH)
    assert december.json()["items"] == []

    settle = _settlement(api, book_id, january)
    assert (settle["period"], settle["period_start"], settle["period_end"], settle["total"]) == (
        "2027-01",
        "2026-12-20",
        "2027-01-19",
        "5000",
    )
    assert _dues(api, book_id)["period_key"] == "2026-10"


# ── 계정 합치기와 비율 ──────────────────────────────────


@pytest.fixture
def mail() -> Iterator[None]:
    get_email_sender.cache_clear()
    yield
    get_email_sender.cache_clear()


def _link_email(client: TestClient, headers: dict[str, str]) -> None:
    email = "shared@example.com"
    r = client.post("/api/v1/account/email/start", json={"email": email}, headers=AUTH)
    assert r.status_code == 204, r.text
    code = client.get(f"/api/v1/account/email/peek?email={email}", headers=AUTH).json()["code"]
    r = client.post(
        "/api/v1/account/email/verify", json={"email": email, "code": code}, headers=headers
    )
    assert r.status_code == 200, r.text


def test_같은_가계부의_두_멤버를_합치면_비율이_똑같이로_돌아간다(
    api: TestClient, db: Session, mail: None
) -> None:
    _link_email(api, AUTH)
    book = _pair(api, db)
    me, junho = _member(book, "은홍"), _member(book, "준호")
    assert _patch(api, book["id"], {"share_percents": {me: 60, junho: 40}}).status_code == 200

    _link_email(api, OTHER)

    after = api.get(f"/api/v1/books/{book['id']}", headers=AUTH).json()
    assert (after["active_member_count"], after["share_percents"]) == (1, None)


# ── 가져오기 중복 판정 ──────────────────────────────────


def test_가져오기_중복_후보는_지출만이고_입금은_안_본다(api: TestClient, db: Session) -> None:
    book = _pair(api, db, settle_rule="none")
    _deposit(api, book["id"], amount="30000", occurred_on="2026-10-02")
    _add(api, book["id"], amount="12000", occurred_on="2026-10-03", title="마트")

    row = db.get(Book, uuid.UUID(book["id"]))
    assert row is not None
    assert [(key.day, key.amount) for key in _book_spends(db, row)] == [(date(2026, 10, 3), 12000)]


# ── 남용 상한 ───────────────────────────────────────────


def test_지금_같이_쓰는_가계부는_상한까지만_만들고_들어간다(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(service, "MAX_BOOKS_PER_USER", 2)
    _create(api, headers=OTHER, name="하나")
    second = _create(api, headers=OTHER, name="둘")
    mine = _create(api, name="은홍 집")

    r = api.post(
        "/api/v1/books",
        json={"kind": "couple", "name": "셋", "settle_rule": "even", "my_name": "준호"},
        headers=OTHER,
    )
    assert (r.status_code, r.json()["error"]["code"], _message(r)) == (
        429,
        "USAGE_LIMIT",
        "가계부는 2개까지 함께 쓸 수 있어요.",
    )
    r = _join(api, mine["invite"]["code"])
    assert (r.status_code, _message(r)) == (429, "가계부는 2개까지 함께 쓸 수 있어요.")

    # 하나를 지우면 다시 들어간다.
    assert api.delete(f"/api/v1/books/{second['id']}", headers=OTHER).status_code == 204
    assert _join(api, mine["invite"]["code"]).status_code == 200


def test_한_가계부에_하루_적는_줄은_상한까지다(
    api: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(service, "MAX_ENTRIES_PER_DAY", 3)
    book = _pair(api, db)
    book_id = book["id"]
    _add(api, book_id)
    gone = _add(api, book_id, headers=OTHER)
    # 지운 줄도 센다. 지우고 다시 적기로 상한을 넘지 못한다.
    api.delete(f"/api/v1/books/{book_id}/entries/{gone['entry']['id']}", headers=OTHER)
    _deposit(api, book_id)

    for body in (
        {"amount": "1000", "occurred_on": "2026-10-05"},
        {"kind": "deposit", "amount": "1000", "occurred_on": "2026-10-05"},
    ):
        r = api.post(f"/api/v1/books/{book_id}/entries", json=body, headers=OTHER)
        assert (r.status_code, r.json()["error"]["code"]) == (429, "USAGE_LIMIT"), body
    assert _message(r) == "오늘은 이 가계부에 충분히 적었어요. 내일 다시 적어 주세요."

    # 가져오기는 stage_entry 로 한 줄씩 만든다. 같은 상한에 걸린다.
    row = db.get(Book, uuid.UUID(book_id))
    me = db.scalar(select(BookMember).where(BookMember.id == uuid.UUID(_member(book, "은홍"))))
    assert row is not None and me is not None
    with pytest.raises(ApiError) as caught:
        service.stage_entry(
            db, row, me, amount=Decimal(1000), category_id=None, title=None, occurred_on=TODAY
        )
    assert caught.value.code == "USAGE_LIMIT"
