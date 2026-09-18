"""태그 생성·수정·삭제와 기록에 다는 규칙.

태그는 카테고리와 다른 축이라, 지켜야 할 것도 다르다. 지출 태그와 수입 태그가 섞이면
리포트가 번 돈과 쓴 돈을 한 조각에 더한다. 태그를 지워도 기록은 남아야 하고, 그래야
이미 본 지난달 리포트가 나중에 달라지지 않는다.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.domain.tags import TAGS_PER_USER_MAX
from app.models import Category, Tag, User

AUTH = {"X-Anon-Key": "test-anon-key"}
TAGS = "/api/v1/tags"
TX = "/api/v1/transactions"


def _make(client: TestClient, name: str, *, kind: str = "expense", color: str = "sage") -> dict:
    res = client.post(TAGS, json={"name": name, "kind": kind, "color": color}, headers=AUTH)
    assert res.status_code == 201, res.text
    return next(item for item in res.json()["items"] if item["name"] == name)


def _expense_category(categories: list[Category]) -> Category:
    return next(c for c in categories if c.kind.value == "expense")


def test_처음에는_태그가_하나도_없다(client: TestClient) -> None:
    """기본 태그를 심지 않는다. 태그는 그 사람이 스스로 만드는 묶음이다."""
    assert client.get(TAGS, headers=AUTH).json()["items"] == []


def test_만들면_목록_전체를_돌려준다(client: TestClient) -> None:
    res = client.post(TAGS, json={"name": "출장", "color": "ocean"}, headers=AUTH)

    assert res.status_code == 201, res.text
    items = res.json()["items"]
    assert [item["name"] for item in items] == ["출장"]
    assert items[0]["color"] == "ocean"
    assert items[0]["kind"] == "expense"
    assert items[0]["usage_count"] == 0


def test_같은_종류_안에서_이름이_겹치면_막는다(client: TestClient) -> None:
    _make(client, "출장")

    res = client.post(TAGS, json={"name": " 출 장 "}, headers=AUTH)

    # 띄어쓰기만 다른 이름을 다른 태그로 받으면 목록에 똑같아 보이는 칩이 둘 선다.
    assert res.status_code == 409, res.text


def test_지출과_수입은_같은_이름을_따로_쓴다(client: TestClient) -> None:
    """「출장」 이 지출에도 수입에도 있는 사람이 있다. 목록이 갈려 있으니 이름도 갈린다."""
    _make(client, "출장", kind="expense")

    res = client.post(TAGS, json={"name": "출장", "kind": "income"}, headers=AUTH)

    assert res.status_code == 201, res.text
    assert len(res.json()["items"]) == 2


def test_종류마다_스무_개까지만_만든다(client: TestClient) -> None:
    for index in range(TAGS_PER_USER_MAX):
        _make(client, f"태그{index}")

    res = client.post(TAGS, json={"name": "하나더"}, headers=AUTH)

    assert res.status_code == 422, res.text
    # 수입 쪽은 아직 비어 있다. 상한은 종류마다다.
    assert (
        client.post(TAGS, json={"name": "보너스", "kind": "income"}, headers=AUTH).status_code
        == 201
    )


def test_남의_태그는_보이지도_고쳐지지도_않는다(client: TestClient, db: Session) -> None:
    other = User(anon_key_hash="other-user-hash")
    db.add(other)
    db.flush()
    stolen = Tag(user_id=other.id, name="남의태그")
    db.add(stolen)
    db.commit()

    assert client.get(TAGS, headers=AUTH).json()["items"] == []
    assert (
        client.patch(f"{TAGS}/{stolen.id}", json={"name": "내것"}, headers=AUTH).status_code == 404
    )


def test_이름과_색만_고친다(client: TestClient) -> None:
    tag = _make(client, "출장")

    res = client.patch(f"{TAGS}/{tag['id']}", json={"name": "외근", "color": "coral"}, headers=AUTH)

    assert res.status_code == 200, res.text
    changed = res.json()["items"][0]
    assert changed["name"] == "외근"
    assert changed["color"] == "coral"
    # 종류는 못 바꾼다. 바꾸면 그 태그로 적어 둔 지난 기록이 종류와 어긋난다.
    assert changed["kind"] == "expense"


def test_지운_태그의_기록은_남고_태그만_떨어진다(
    client: TestClient, default_categories: list[Category]
) -> None:
    tag = _make(client, "출장")
    created = client.post(
        TX,
        json={
            "occurred_at": "2026-09-18T12:00:00+09:00",
            "amount": "12000",
            "type": "expense",
            "category_id": str(_expense_category(default_categories).id),
            "tag_id": tag["id"],
        },
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    tx_id = created.json()["transaction"]["id"]

    assert client.delete(f"{TAGS}/{tag['id']}", headers=AUTH).status_code == 204

    items = client.get(TX, headers=AUTH).json()["items"]
    row = next(item for item in items if item["id"] == tx_id)
    # 기록은 그대로 있다. 지운 것은 태그지 그날 쓴 돈이 아니다.
    assert row["amount"] == "12000"
    assert client.get(TAGS, headers=AUTH).json()["items"] == []


def test_쓰인_건수를_함께_준다(client: TestClient, default_categories: list[Category]) -> None:
    tag = _make(client, "출장")
    for _ in range(2):
        client.post(
            TX,
            json={
                "occurred_at": "2026-09-18T12:00:00+09:00",
                "amount": "5000",
                "type": "expense",
                "category_id": str(_expense_category(default_categories).id),
                "tag_id": tag["id"],
            },
            headers=AUTH,
        )

    items = client.get(TAGS, headers=AUTH).json()["items"]
    assert items[0]["usage_count"] == 2


def test_수입_기록에_지출_태그를_달_수_없다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """섞이면 리포트가 번 돈과 쓴 돈을 한 조각에 더한다. 저장 자리에서 막는다."""
    tag = _make(client, "출장", kind="expense")
    income = next(c for c in default_categories if c.kind.value == "income")

    res = client.post(
        TX,
        json={
            "occurred_at": "2026-09-18T12:00:00+09:00",
            "amount": "300000",
            "type": "income",
            "category_id": str(income.id),
            "tag_id": tag["id"],
        },
        headers=AUTH,
    )

    assert res.status_code == 422, res.text


def test_종류를_바꾸면_안_맞는_태그가_떨어진다(
    client: TestClient, default_categories: list[Category]
) -> None:
    """막지 않고 뗀다. 종류를 고치는 것이 하려던 일이고 태그는 곁들인 값이다."""
    tag = _make(client, "출장", kind="expense")
    income = next(c for c in default_categories if c.kind.value == "income")
    created = client.post(
        TX,
        json={
            "occurred_at": "2026-09-18T12:00:00+09:00",
            "amount": "12000",
            "type": "expense",
            "category_id": str(_expense_category(default_categories).id),
            "tag_id": tag["id"],
        },
        headers=AUTH,
    )
    tx_id = created.json()["transaction"]["id"]

    res = client.patch(
        f"{TX}/{tx_id}",
        json={"type": "income", "category_id": str(income.id)},
        headers=AUTH,
    )

    assert res.status_code == 200, res.text
    assert res.json()["transaction"]["tag_id"] is None


def test_없는_태그를_달면_404(client: TestClient, default_categories: list[Category]) -> None:
    res = client.post(
        TX,
        json={
            "occurred_at": "2026-09-18T12:00:00+09:00",
            "amount": "12000",
            "type": "expense",
            "category_id": str(_expense_category(default_categories).id),
            "tag_id": str(uuid.uuid4()),
        },
        headers=AUTH,
    )

    assert res.status_code == 404, res.text
