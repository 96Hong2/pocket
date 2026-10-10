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
from fastapi import Header
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import Engine, create_engine, select, text
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
OTHER = {"X-Anon-Key": "pg-other-key"}
TOO_MANY = "코드를 너무 자주 보냈어요. 잠시 뒤에 다시 받아 주세요."


@pytest.fixture
def pg() -> Iterator[Engine]:
    assert PG_URL is not None
    # 운영과 같은 풀이다. 넉넉한 풀에서는 요청끼리 연결을 다 잡고 서로 기다리는 일이 안 보인다.
    # 기다림이 짧아야 그런 일이 생기면 500 으로 바로 드러난다.
    engine = create_engine(PG_URL, pool_size=5, max_overflow=5, pool_timeout=3)
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

    # 헤더의 익명키가 다르면 다른 사람이다. 남의 묶음을 저장해 보는 경우를 만든다.
    async def override_identity(x_anon_key: str = Header(alias="X-Anon-Key")) -> VerifiedIdentity:
        return VerifiedIdentity(anon_key=x_anon_key, verified_by="trusting")

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


def _together_json(count: int, call: Callable[[int], Response]) -> list[tuple[int, str | None]]:
    def run(i: int) -> tuple[int, str | None]:
        res = call(i)
        error = res.json().get("error") if res.status_code >= 400 else None
        return res.status_code, error["message"] if error else None

    with ThreadPoolExecutor(count) as pool:
        return sorted(pool.map(run, range(count)), key=lambda item: item[0])


def test_같은_묶음을_동시에_저장해도_한_번만_들어간다(pg_client: TestClient, pg: Engine) -> None:
    batch = pg_client.post(
        "/api/v1/imports/text", json={"text": "점심 12000, 커피 4500, 택시 8000"}, headers=AUTH
    ).json()
    path = f"/api/v1/imports/{batch['id']}/commit"

    responses = _together_json(16, lambda _: pg_client.post(path, headers=AUTH))

    # 하나만 저장하고 나머지는 지금 두 번 누를 때와 같은 409 다. 풀이 바닥나 500 이 나지 않는다.
    assert [status for status, _ in responses] == [200] + [409] * 15
    assert {message for status, message in responses if status == 409} == {
        "이미 저장한 분석 결과예요."
    }
    with Session(pg) as session:
        saved = session.scalars(select(Transaction)).all()
    assert len(saved) == len(batch["candidates"]) == 3


def test_저장_중인_묶음도_남이면_404_다(pg_client: TestClient, pg: Engine) -> None:
    """잠금을 못 얻은 쪽도 남의 묶음이면 409 가 아니라 404 다. 묶음이 있는지 새지 않게."""
    batch = pg_client.post("/api/v1/imports/text", json={"text": "점심 12000"}, headers=AUTH).json()
    path = f"/api/v1/imports/{batch['id']}/commit"
    key = {"key": f"import-commit:{batch['id']}"}

    # 주인의 저장이 돌고 있는 상황을 잠금만 쥐어 만든다.
    with pg.connect() as lock:
        assert lock.scalar(text("SELECT pg_try_advisory_lock(hashtextextended(:key, 0))"), key)
        lock.commit()
        try:
            other = pg_client.post(path, headers=OTHER)
            owner = pg_client.post(path, headers=AUTH)
        finally:
            lock.execute(text("SELECT pg_advisory_unlock(hashtextextended(:key, 0))"), key)
            lock.commit()

    assert other.status_code == 404, other.text
    assert owner.status_code == 409, owner.text
    assert owner.json()["error"]["message"] == "이미 저장한 분석 결과예요."
    # 둘 다 아무것도 저장하지 않았고, 잠금이 풀리면 주인은 그대로 저장한다.
    with Session(pg) as session:
        assert session.scalars(select(Transaction)).all() == []
    assert pg_client.post(path, headers=AUTH).status_code == 200


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


def test_한_사람이_동시에_보내도_서로_다른_주소_상한을_넘지_않는다(
    pg_client: TestClient, pg: Engine
) -> None:
    """세고 넣는 사이에 다른 요청이 끼면 상한 5 를 넘어 6, 7 통이 나간다."""

    def start(i: int) -> int:
        return pg_client.post(
            "/api/v1/account/email/start", json={"email": f"p{i}@example.com"}, headers=AUTH
        ).status_code

    statuses = _together(30, start)

    assert statuses == [204] * 5 + [429] * 25
    with Session(pg) as session:
        sent = session.scalars(select(LoginCode.email)).all()
    assert len(sent) == len(set(sent)) == 5
    late = pg_client.post(
        "/api/v1/account/email/start", json={"email": "late@example.com"}, headers=AUTH
    )
    assert late.status_code == 429
    assert late.json()["error"]["message"] == TOO_MANY
