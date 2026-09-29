"""줄글·캡처로 공유 가계부에 적기: 분석 → 검토 → 저장.

AUTH 가 은홍(만든 사람), OTHER 가 준호다. 여기서 지키는 것은 읽은 것이 그 가계부의 분류로
붙는 것, 지출만 켜지고 저장되는 것, 같이 쓰는 사람이 먼저 적은 것을 「이미 있어요」 로 끄는 것,
멤버가 아니거나 스위치가 꺼져 있으면 모델을 부르기 전에 막는 것이다.
"""

from __future__ import annotations

import base64
import uuid
from collections.abc import Iterator
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Category, ImportCandidate, ParseUsage
from app.modules import ledger

AUTH = {"X-Anon-Key": "test-anon-key"}
OTHER = {"X-Anon-Key": "second-device-key"}
THIRD = {"X-Anon-Key": "third-device-key"}
TODAY = datetime.now(ZoneInfo(ledger.DEFAULT_TIMEZONE)).date()

FIVE_ITEMS = "외식 30000 장보기 45000 데이트 영화 20000 택시 9000 용돈 50000"

PNG = base64.b64encode(
    base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
).decode()
IMAGE = f"data:image/png;base64,{PNG}"


@pytest.fixture
def api(two_devices: TestClient, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("SHARED_BOOKS_ENABLED", "true")
    get_settings.cache_clear()
    yield two_devices
    get_settings.cache_clear()


def _pair(client: TestClient) -> dict:
    body = {"kind": "couple", "name": "둘이 쓰는 돈", "settle_rule": "even", "my_name": "은홍"}
    book = client.post("/api/v1/books", json=body, headers=AUTH).json()
    joined = client.post(
        f"/api/v1/invites/{book['invite']['code']}/join", json={"name": "준호"}, headers=OTHER
    )
    assert joined.status_code == 200, joined.text
    return dict(joined.json())


def _category(book: dict, name: str) -> str:
    return str(next(c["id"] for c in book["categories"] if c["name"] == name))


def _analyze(
    client: TestClient, book_id: str | None, text: str = FIVE_ITEMS, headers: dict = AUTH
) -> Any:
    body: dict[str, Any] = {"text": text}
    if book_id is not None:
        body["book_id"] = book_id
    return client.post("/api/v1/imports/text", json=body, headers=headers)


def _row(batch: dict, merchant: str | None) -> dict:
    return dict(next(item for item in batch["candidates"] if item["merchant"] == merchant))


def _entries(client: TestClient, book_id: str, headers: dict = AUTH) -> list[dict]:
    r = client.get(f"/api/v1/books/{book_id}/entries", headers=headers)
    assert r.status_code == 200, r.text
    return list(r.json()["items"])


def test_공유_가계부로_읽으면_그_가계부_분류가_붙고_지출만_켜진다(
    api: TestClient, default_categories: list[Category]
) -> None:
    book = _pair(api)
    r = _analyze(api, book["id"])
    assert r.status_code == 201, r.text
    batch = r.json()

    assert batch["book_id"] == book["id"]
    picked = {item["merchant"]: item["category_id"] for item in batch["candidates"]}
    assert picked == {
        "외식": _category(book, "외식·배달"),
        "장보기": _category(book, "장보기"),
        "데이트 영화": _category(book, "데이트"),
        # 연인·부부 가계부에는 교통이 없다. 저장할 때 「기타」 로 간다.
        "택시": None,
        "용돈": None,
    }
    income = _row(batch, "용돈")
    assert (income["type"], income["is_selected"]) == ("income", False)
    assert batch["selected_count"] == 4
    assert batch["selected_expense_total"] == "104000"


def test_공유_묶음을_저장하면_공유_기록이_되고_내_가계부는_그대로다(
    api: TestClient, default_categories: list[Category]
) -> None:
    book = _pair(api)
    batch = _analyze(api, book["id"]).json()

    r = api.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)
    assert r.status_code == 200, r.text
    result = r.json()
    assert (result["created_count"], result["expense_total"]) == (4, "104000")
    assert result["book_id"] == book["id"]
    assert (result["feedback"], result["budget"]) == (None, None)
    assert result["book_month"]["spent"] == "104000"
    assert result["book_month"]["period_start"] == TODAY.replace(day=1).isoformat()

    # 준호도 바로 본다. 낸 사람은 은홍, 날짜는 오늘이다.
    seen = {e["title"]: e for e in _entries(api, book["id"], headers=OTHER)}
    assert set(seen) == {"외식", "장보기", "데이트 영화", "택시"}
    assert seen["택시"]["category_id"] == _category(book, "기타")
    assert seen["외식"]["category_id"] == _category(book, "외식·배달")
    for entry in seen.values():
        assert entry["paid_by_member_id"] == book["members"][0]["id"]
        assert entry["occurred_on"] == TODAY.isoformat()

    assert api.get("/api/v1/transactions", headers=AUTH).json()["items"] == []
    # 다시 누르면 두 번 들어가지 않는다.
    assert api.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH).status_code == 409
    assert len(_entries(api, book["id"])) == 4


def test_같이_쓰는_사람이_먼저_적은_것은_이미_있어요로_꺼진다(
    api: TestClient, default_categories: list[Category]
) -> None:
    book = _pair(api)
    today = TODAY.isoformat()
    # 키패드로 적어 상호가 없는 기록은 같은 날·같은 금액이면 같은 것으로 본다.
    for body in (
        {"amount": "30000", "occurred_on": today},
        {"amount": "45000", "occurred_on": today, "title": "장보기"},
        {"amount": "20000", "occurred_on": today, "title": "팝콘"},
    ):
        r = api.post(f"/api/v1/books/{book['id']}/entries", json=body, headers=OTHER)
        assert r.status_code == 201, r.text

    batch = _analyze(api, book["id"]).json()
    flags = {i["merchant"]: (i["is_duplicate"], i["is_selected"]) for i in batch["candidates"]}
    assert flags["외식"] == (True, False)
    assert flags["장보기"] == (True, False)
    # 상호가 둘 다 있는데 다르면 다른 것이다.
    assert flags["데이트 영화"] == (False, True)
    assert flags["택시"] == (False, True)

    # 내 가계부에 같은 것이 있어도 공유 쪽 판정에는 안 들어간다.
    mine = {
        "occurred_at": datetime.now(ZoneInfo(ledger.DEFAULT_TIMEZONE)).isoformat(),
        "amount": "9000",
        "type": "expense",
        "merchant": "택시",
        "source": "keypad",
    }
    assert api.post("/api/v1/transactions", json=mine, headers=AUTH).status_code == 201
    again = _analyze(api, book["id"], text="택시 9000").json()
    assert again["candidates"][0]["is_duplicate"] is False


def test_같은_묶음의_앞줄과_겹치면_뒤엣줄이_꺼진다(
    api: TestClient, default_categories: list[Category]
) -> None:
    book = _pair(api)
    batch = _analyze(api, book["id"], text="외식 30000 외식 30000").json()
    assert [(i["is_duplicate"], i["is_selected"]) for i in batch["candidates"]] == [
        (False, True),
        (True, False),
    ]


def test_공유_묶음에서는_그_가계부_분류로만_고치고_지출_밖으로_못_바꾼다(
    api: TestClient, default_categories: list[Category]
) -> None:
    book = _pair(api)
    batch = _analyze(api, book["id"]).json()
    taxi = _row(batch, "택시")
    income = _row(batch, "용돈")
    url = f"/api/v1/imports/{batch['id']}/candidates"

    life = _category(book, "생활")
    r = api.patch(f"{url}/{taxi['id']}", json={"category_id": life}, headers=AUTH)
    assert r.status_code == 200, r.text
    assert _row(r.json(), "택시")["category_id"] == life

    personal = str(default_categories[0].id)
    r = api.patch(f"{url}/{taxi['id']}", json={"category_id": personal}, headers=AUTH)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_CATEGORY"

    r = api.patch(f"{url}/{taxi['id']}", json={"type": "income"}, headers=AUTH)
    assert r.status_code == 422
    r = api.patch(f"{url}/{income['id']}", json={"is_selected": True}, headers=AUTH)
    assert r.status_code == 422

    committed = api.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)
    assert committed.status_code == 200, committed.text
    taxi_entry = next(e for e in _entries(api, book["id"]) if e["title"] == "택시")
    assert taxi_entry["category_id"] == life


def test_고른_줄에_지출이_아닌_것이_있으면_저장하지_않는다(
    api: TestClient, db: Session, default_categories: list[Category]
) -> None:
    book = _pair(api)
    batch = _analyze(api, book["id"]).json()
    # 화면과 PATCH 가 막는 것을 DB 로 억지로 켠다. 저장이 마지막 그물이다.
    db.execute(
        update(ImportCandidate)
        .where(ImportCandidate.id == uuid.UUID(_row(batch, "용돈")["id"]))
        .values(is_selected=True)
    )
    db.commit()

    r = api.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)
    assert r.status_code == 422
    assert _entries(api, book["id"]) == []


def test_멤버가_아니면_404_끝났으면_BOOK_ENDED_이고_모델을_부르지_않는다(
    api: TestClient, db: Session, default_categories: list[Category]
) -> None:
    book = _pair(api)
    r = _analyze(api, book["id"], headers=THIRD)
    assert r.status_code == 404

    api.patch(f"/api/v1/books/{book['id']}", json={"ended": True}, headers=AUTH)
    r = _analyze(api, book["id"])
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "BOOK_ENDED"
    assert db.scalar(select(func.count()).select_from(ParseUsage)) == 0


def test_스위치가_꺼져_있으면_가계부를_달고_읽을_수_없다(
    api: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch, default_categories
) -> None:
    book = _pair(api)
    monkeypatch.setenv("SHARED_BOOKS_ENABLED", "false")
    get_settings.cache_clear()

    r = _analyze(api, book["id"])
    assert r.status_code == 404
    assert db.scalar(select(func.count()).select_from(ParseUsage)) == 0
    # 가계부 없이 읽는 길은 그대로다.
    assert _analyze(api, None).status_code == 201


def test_캡처도_공유_가계부_분류로_옮겨_붙고_환불_줄은_꺼진다(
    api: TestClient, default_categories: list[Category]
) -> None:
    book = _pair(api)
    r = api.post(
        "/api/v1/imports/capture", json={"image": IMAGE, "book_id": book["id"]}, headers=AUTH
    )
    assert r.status_code == 201, r.text
    batch = r.json()
    assert batch["book_id"] == book["id"]
    assert _row(batch, "스타벅스")["category_id"] == _category(book, "외식·배달")
    assert _row(batch, "GS25")["category_id"] == _category(book, "생활")
    refund = _row(batch, "MY 카드 캐시백")
    assert (refund["category_id"], refund["is_selected"]) == (None, False)

    committed = api.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)
    assert committed.status_code == 200, committed.text
    assert committed.json()["created_count"] == batch["selected_count"]
