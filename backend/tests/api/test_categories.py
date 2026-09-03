"""카테고리 조회. 화면이 이 목록으로 아이콘까지 그린다."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.domain.categories import DEFAULT_CATEGORIES
from app.models import Category, CategoryKind, User

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
