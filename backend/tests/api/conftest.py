"""API 테스트용 앱. 실제 DB 대신 인메모리 SQLite 를 쓴다."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import _verifier_for, get_verified_identity
from app.core.config import get_settings
from app.db.session import get_session
from app.integrations.apps_in_toss.anon_key import VerifiedIdentity
from app.main import create_app
from app.models import Base


def _sqlite_engine() -> Engine:
    """테스트용 인메모리 DB.

    SQLite 는 외래키를 기본으로 끄고 들어온다. 켜 두지 않으면 없는 카테고리를 참조해도
    통과해서, PostgreSQL 에서만 터지는 결함을 테스트가 놓친다.
    """
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_connection, _record) -> None:  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


@pytest.fixture
def engine() -> Iterator[Engine]:
    engine = _sqlite_engine()
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    """테스트가 직접 데이터를 심을 때 쓰는 세션. 앱과 같은 엔진을 본다."""
    with sessionmaker(bind=engine, expire_on_commit=False)() as session:
        yield session


@pytest.fixture
def client(engine: Engine) -> Iterator[TestClient]:
    maker = sessionmaker(bind=engine, expire_on_commit=False)

    def override_session() -> Iterator[Session]:
        with maker() as session:
            yield session

    # 검증기는 네트워크를 타므로 테스트에서는 통과시킨다. 검증 자체는 통합 테스트가 덮는다.
    async def override_identity() -> VerifiedIdentity:
        return VerifiedIdentity(anon_key="test-anon-key", verified_by="trusting")

    app = create_app()
    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_verified_identity] = override_identity

    with TestClient(app) as c:
        yield c


@pytest.fixture
def unauthenticated_client(monkeypatch: pytest.MonkeyPatch, engine: Engine) -> Iterator[TestClient]:
    """검증기를 갈아끼우지 않은 앱. 헤더가 없을 때 401 이 나는지 보기 위한 것이다.

    인증서가 없으면 검증기 생성이 실패하도록 설계돼 있어서, 로컬 개발과 같은 조건
    (ALLOW_UNVERIFIED_ANON_KEY=true)을 만들어 준다.
    """
    monkeypatch.setenv("ALLOW_UNVERIFIED_ANON_KEY", "true")
    monkeypatch.setenv("ENVIRONMENT", "local")
    get_settings.cache_clear()
    _verifier_for.cache_clear()

    maker = sessionmaker(bind=engine, expire_on_commit=False)

    def override_session() -> Iterator[Session]:
        with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = override_session
    with TestClient(app) as c:
        yield c

    get_settings.cache_clear()
    _verifier_for.cache_clear()
