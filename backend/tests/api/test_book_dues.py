"""공유 가계부 시작일, 회비 비율, 입금, 회비 상태, 멤버 내역.

AUTH 가 은홍(만든 사람), OTHER 가 준호다. 오늘은 2026년 10월 5일로 묶는다.
시작일 25 면 10월 5일은 「10월」(9월 25일 ~ 10월 24일)에 든다. 기대값은 손으로 셈했다.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, date, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import BookMember
from app.modules.books import service

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


def test_멤버_내역은_낸_지출과_넣은_입금을_최신순으로_날을_쪼개지_않고_나눠_싣는다(
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

    first = _history(api, book_id, junho, "?limit=2").json()
    assert (first["name"], first["paid_total"], first["deposited_total"]) == (
        "준호",
        "10000",
        "50000",
    )
    # 10월 3일 셋을 쪼개지 않고 통째로 싣는다. 같은 날 안의 순서는 적은 시각이라 여기서 안 본다.
    assert sorted(row["amount"] for row in first["items"]) == ["1000", "2000", "3000"]
    assert first["next_before"] == "2026-10-03"

    second = _history(api, book_id, junho, f"?limit=2&before={first['next_before']}").json()
    assert [(row["kind"], row["amount"]) for row in second["items"]] == [
        ("deposit", "50000"),
        ("expense", "4000"),
    ]
    assert second["next_before"] is None

    # 한 쪽 끝에서 날이 갈리면 그날을 다음 쪽으로 미룬다.
    third = _history(api, book_id, junho, "?limit=4").json()
    assert [row["occurred_on"] for row in third["items"]] == ["2026-10-03"] * 3 + ["2026-10-01"]
    assert third["next_before"] == "2026-10-01"
    rest = _history(api, book_id, junho, f"?limit=4&before={third['next_before']}").json()
    assert [row["amount"] for row in rest["items"]] == ["4000"]


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
