"""손으로 걸어 두는 기억한 분류.

앱이 스스로 기억하는 길은 저장 경로 테스트(test_nl_import)가 이미 지킨다.
여기서 볼 것은 사람이 직접 적었을 때다. 같은 상호에 규칙이 둘 생기면 어느 쪽이 이기는지
아무도 모르게 되므로, 하나로 합쳐지는지가 핵심이다.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

AUTH = {"X-Anon-Key": "test-anon-key"}


def _create(client: TestClient, merchant: str, category_id: str):
    return client.post(
        "/api/v1/merchant-rules",
        json={"merchant": merchant, "category_id": category_id},
        headers=AUTH,
    )


def test_손으로_걸면_내가_적은_것으로_남는다(client: TestClient, default_categories) -> None:
    names = {category.name: str(category.id) for category in default_categories}

    created = _create(client, "스타벅스", names["카페·간식"])
    assert created.status_code == 201, created.text
    assert created.json()["source"] == "manual"
    # 실제로 맞은 적은 없다. 여기서 1 을 올리면 목록 순서가 거짓이 된다.
    assert created.json()["applied_count"] == 0

    items = client.get("/api/v1/merchant-rules", headers=AUTH).json()["items"]
    assert [(item["merchant"], item["source"]) for item in items] == [("스타벅스", "manual")]


def test_같은_상호를_또_걸면_분류만_바뀐다(client: TestClient, default_categories) -> None:
    names = {category.name: str(category.id) for category in default_categories}
    _create(client, "스타벅스", names["카페·간식"])

    again = _create(client, " 스타벅스 ", names["식비"])
    assert again.status_code == 201, again.text

    items = client.get("/api/v1/merchant-rules", headers=AUTH).json()["items"]
    assert len(items) == 1
    assert items[0]["category_id"] == names["식비"]


def test_지운_상호를_다시_걸면_되살아난다(client: TestClient, default_categories) -> None:
    names = {category.name: str(category.id) for category in default_categories}
    rule_id = _create(client, "스타벅스", names["카페·간식"]).json()["id"]
    client.request("DELETE", f"/api/v1/merchant-rules/{rule_id}", headers=AUTH)
    assert client.get("/api/v1/merchant-rules", headers=AUTH).json()["items"] == []

    _create(client, "스타벅스", names["식비"])
    items = client.get("/api/v1/merchant-rules", headers=AUTH).json()["items"]
    assert [item["merchant"] for item in items] == ["스타벅스"]


def test_빈_상호는_막는다(client: TestClient, default_categories) -> None:
    names = {category.name: str(category.id) for category in default_categories}
    # 공백만 적으면 정규화 결과가 비어 어떤 후보와도 안 맞는다.
    assert _create(client, "   ", names["식비"]).status_code == 422


def test_남의_분류에는_못_건다(client: TestClient, default_categories) -> None:
    del default_categories
    missing = "00000000-0000-4000-8000-000000000000"
    assert _create(client, "스타벅스", missing).status_code in (403, 404, 422)
