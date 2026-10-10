"""동시에 겹친 요청을 실제 PostgreSQL 에서 본다.

행 잠금과 advisory 잠금은 SQLite 에 없어, 나머지 API 테스트로는 겹침을 재현할 수 없다.
`PG_TEST_DATABASE_URL` 에 **비어 있는 전용 DB** 를 주면 돈다. 표를 만들고 끝나면 지운다.
주지 않으면 건너뛴다. 공용 DB 나 개발 DB 를 주지 않는다.

    PG_TEST_DATABASE_URL=postgresql+psycopg://pocket:pocket@localhost:5434/<빈 DB>
"""

from __future__ import annotations

import os
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.api.deps import get_verified_identity
from app.db.session import get_session
from app.domain.categories import DEFAULT_CATEGORIES
from app.integrations.apps_in_toss.anon_key import VerifiedIdentity
from app.integrations.email.factory import get_email_sender
from app.main import create_app
from app.models import Base, Category, LoginCode, Transaction

PG_URL = os.environ.get("PG_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not PG_URL, reason="PG_TEST_DATABASE_URL 이 없다")

AUTH = {"X-Anon-Key": "pg-anon-key"}


@pytest.fixture
def pg() -> Iterator[Engine]:
    assert PG_URL is not None
    engine = create_engine(PG_URL, pool_size=20, max_overflow=20)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add_all(
            Category(
                user_id=None, name=c.name, kind=c.kind, icon_key=c.icon_key, sort_order=c.sort_order
            )
            for c in DEFAULT_CATEGORIES
        )
        session.commit()
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def pg_client(pg: Engine) -> Iterator[TestClient]:
    maker = sessionmaker(bind=pg, expire_on_commit=False)

    def override_session() -> Iterator[Session]:
        with maker() as session:
            yield session

    async def override_identity() -> VerifiedIdentity:
        return VerifiedIdentity(anon_key=AUTH["X-Anon-Key"], verified_by="trusting")

    get_email_sender.cache_clear()
    app = create_app()
    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_verified_identity] = override_identity
    with TestClient(app) as client:
        yield client
    get_email_sender.cache_clear()


def _together(count: int, call: Callable[[int], int]) -> list[int]:
    with ThreadPoolExecutor(count) as pool:
        return sorted(pool.map(call, range(count)))


def test_같은_묶음을_동시에_저장해도_한_번만_들어간다(pg_client: TestClient, pg: Engine) -> None:
    batch = pg_client.post(
        "/api/v1/imports/text", json={"text": "점심 12000, 커피 4500, 택시 8000"}, headers=AUTH
    ).json()
    path = f"/api/v1/imports/{batch['id']}/commit"

    statuses = _together(8, lambda _: pg_client.post(path, headers=AUTH).status_code)

    # 하나만 저장하고 나머지는 지금 두 번 누를 때와 같은 409 다.
    assert statuses == [200] + [409] * 7
    with Session(pg) as session:
        saved = session.scalars(select(Transaction)).all()
    assert len(saved) == len(batch["candidates"]) == 3


def test_동시에_틀려도_코드마다_5번을_넘지_않는다(pg_client: TestClient, pg: Engine) -> None:
    email = "race@example.com"
    res = pg_client.post("/api/v1/account/email/start", json={"email": email}, headers=AUTH)
    assert res.status_code == 204
    code = pg_client.get(f"/api/v1/account/email/peek?email={email}", headers=AUTH).json()["code"]
    wrong = [f"{(int(code) + i) % 1_000_000:06d}" for i in range(1, 31)]

    def verify(i: int) -> int:
        return pg_client.post(
            "/api/v1/account/email/verify",
            json={"email": email, "code": wrong[i]},
            headers=AUTH,
        ).status_code

    assert set(_together(30, verify)) == {422}
    with Session(pg) as session:
        row = session.scalars(select(LoginCode)).one()
    assert row.attempts == 5
    assert row.consumed_at is not None
    # 죽은 코드는 맞는 코드도 안 통한다.
    late = pg_client.post(
        "/api/v1/account/email/verify", json={"email": email, "code": code}, headers=AUTH
    )
    assert late.status_code == 422
