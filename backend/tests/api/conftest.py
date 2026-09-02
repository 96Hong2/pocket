"""API 테스트용 앱. 실제 DB 대신 인메모리 SQLite 를 쓴다."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import _verifier_for, get_verified_identity
from app.core.config import get_settings
from app.db.session import get_session
from app.integrations.apps_in_toss.anon_key import VerifiedIdentity
from app.main import create_app
from app.models import Base


@pytest.fixture
def client() -> Iterator[TestClient]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    maker = sessionmaker(bind=engine, expire_on_commit=False)

    def override_session() -> Iterator[Session]:
        with maker() as session:
            yield session

    # 검증기는 네트워크를 타므로 테스트에서는 통과시킨다. 검증 자체는 통합 테스트가 덮는다.
    async def override_identity() -> VerifiedIdentity:
        return VerifiedIdentity(anon_key="test-anon-key", verified_by="local")

    app = create_app()
    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_verified_identity] = override_identity

    with TestClient(app) as c:
        yield c

    Base.metadata.drop_all(engine)


@pytest.fixture
def unauthenticated_client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """검증기를 갈아끼우지 않은 앱. 헤더가 없을 때 401 이 나는지 보기 위한 것이다.

    인증서가 없으면 검증기 생성이 실패하도록 설계돼 있어서, 로컬 개발과 같은 조건
    (ALLOW_UNVERIFIED_ANON_KEY=true)을 만들어 준다.
    """
    monkeypatch.setenv("ALLOW_UNVERIFIED_ANON_KEY", "true")
    monkeypatch.setenv("ENVIRONMENT", "local")
    get_settings.cache_clear()
    _verifier_for.cache_clear()

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    maker = sessionmaker(bind=engine, expire_on_commit=False)

    def override_session() -> Iterator[Session]:
        with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = override_session
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(engine)
    get_settings.cache_clear()
    _verifier_for.cache_clear()
