"""AI 사용량 상한이 실제 유료 호출과 맞게 세어지는지 본다.

지키는 것은 셋이다. 모델을 부르기 **전에** 사용량 줄이 커밋돼 있다(동시 요청이 함께 상한을
넘지 못하고, 모델을 기다리는 동안 DB 연결을 쥐지 않는다). 실제로 부른 횟수만큼 센다(전부 실패한
여러 장, 재시도 모델). 정상 사용자는 지금과 같은 응답을 받는다.
"""

from __future__ import annotations

import base64
from collections.abc import Iterator
from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, event, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import ORMExecuteState, Session, sessionmaker

from app.api.deps import get_verified_identity
from app.core.config import get_settings
from app.db.session import get_session
from app.integrations.apps_in_toss.anon_key import VerifiedIdentity
from app.integrations.llm import (
    LlmError,
    TransactionExtraction,
    get_escalation_client,
    get_llm_client,
)
from app.integrations.llm.contracts import ExtractedTransaction
from app.main import create_app
from app.models import ParseUsage

AUTH = {"X-Anon-Key": "test-anon-key"}
PNG = (
    "data:image/png;base64,"
    + base64.b64encode(
        base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        )
    ).decode()
)


@pytest.fixture
def app_client(engine: Engine) -> Iterator[tuple[TestClient, list[Session]]]:
    """요청이 쓴 세션을 붙잡아 두는 앱. 모델을 부르는 순간 그 세션이 무엇을 쥐고 있는지 본다."""
    maker = sessionmaker(bind=engine, expire_on_commit=False)
    sessions: list[Session] = []

    def override_session() -> Iterator[Session]:
        with maker() as session:
            sessions.append(session)
            yield session

    async def override_identity() -> VerifiedIdentity:
        return VerifiedIdentity(anon_key="test-anon-key", verified_by="trusting")

    app = create_app()
    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_verified_identity] = override_identity
    with TestClient(app) as c:
        yield c, sessions


def _extraction(amount: int = 12000) -> TransactionExtraction:
    return TransactionExtraction(
        candidates=[
            ExtractedTransaction(
                occurred_at=date.today(),
                amount=amount,
                type="expense",  # type: ignore[arg-type]
                merchant="김밥천국",
                confidence=0.9,
            )
        ]
    )


class _Model:
    """정해 둔 답을 차례로 내놓는 모델. 불릴 때마다 `on_call` 로 그 순간을 들여다본다."""

    def __init__(self, name: str, *answers: TransactionExtraction | Exception) -> None:
        self._name = name
        self._answers = list(answers)
        self.calls = 0
        self.on_call: Any = None

    @property
    def provider(self) -> str:
        return "fake"

    @property
    def is_stub(self) -> bool:
        return False

    @property
    def model(self) -> str:
        return self._name

    async def extract(self, **_: object) -> TransactionExtraction:
        self.calls += 1
        if self.on_call is not None:
            self.on_call()
        answer = self._answers[min(self.calls, len(self._answers)) - 1]
        if isinstance(answer, Exception):
            raise answer
        return answer


def _use(client: TestClient, first: _Model, second: _Model | None = None) -> None:
    overrides = client.app.dependency_overrides  # type: ignore[attr-defined]
    overrides[get_llm_client] = lambda: first
    overrides[get_escalation_client] = lambda: second


def _rows(db: Session) -> list[ParseUsage]:
    db.expire_all()
    return list(db.scalars(select(ParseUsage).order_by(ParseUsage.created_at)))


def test_모델을_부르는_동안_사용량은_이미_커밋돼_있고_연결을_쥐지_않는다(
    app_client: tuple[TestClient, list[Session]], db: Session, default_categories
) -> None:
    client, sessions = app_client
    seen: list[tuple[bool, int]] = []
    model = _Model("luna", _extraction())
    model.on_call = lambda: seen.append((sessions[-1].in_transaction(), len(_rows(db))))
    _use(client, model)

    response = client.post(
        "/api/v1/imports/capture", json={"images": [PNG, PNG, PNG]}, headers=AUTH
    )

    assert response.status_code == 201, response.text
    # 세 번 다 트랜잭션이 닫힌 채로 불렸고, 세 줄이 먼저 적혀 있었다.
    assert seen == [(False, 3)] * 3
    rows = _rows(db)
    assert len(rows) == 3
    assert not any(row.failed for row in rows)
    assert rows[0].candidate_count == 3


def test_상한을_세는_자리는_사용자_줄을_잠근다(
    client: TestClient, default_categories, monkeypatch: pytest.MonkeyPatch
) -> None:
    """동시에 보낸 요청이 같은 수를 보고 함께 통과하지 못하게 한다.

    테스트 DB(SQLite)는 잠금 구문을 지워서, 운영 DB(PostgreSQL)로 옮긴 SQL 로 본다.
    """
    del default_categories
    seen: list[str] = []

    def capture(state: ORMExecuteState) -> None:
        seen.append(str(state.statement.compile(dialect=postgresql.dialect())))

    event.listen(Session, "do_orm_execute", capture)
    try:
        response = client.post("/api/v1/imports/text", json={"text": "점심 12000"}, headers=AUTH)
    finally:
        event.remove(Session, "do_orm_execute", capture)

    assert response.status_code == 201, response.text
    locks = [sql for sql in seen if "FOR UPDATE" in sql]
    assert locks and "FROM users" in locks[0]


def test_여러_장이_전부_실패해도_장수만큼_센다(
    client: TestClient, db: Session, default_categories
) -> None:
    _use(client, _Model("luna", LlmError("응답 없음")))

    response = client.post(
        "/api/v1/imports/capture", json={"images": [PNG, PNG, PNG]}, headers=AUTH
    )

    # 화면이 보는 것은 지금과 같다.
    assert response.status_code == 503
    assert response.json()["error"]["message"].startswith("지금은 캡처를")
    rows = _rows(db)
    assert len(rows) == 3
    assert all(row.failed for row in rows)


def test_재시도_모델을_부르면_한_번_더_센다(
    client: TestClient, db: Session, default_categories
) -> None:
    first = _Model("luna", _extraction(amount=999_999_999_999))
    second = _Model("terra", _extraction())
    _use(client, first, second)

    response = client.post("/api/v1/imports/text", json={"text": "점심 12000"}, headers=AUTH)

    assert response.status_code == 201, response.text
    assert (first.calls, second.calls) == (1, 1)
    rows = _rows(db)
    assert len(rows) == 2
    primary, retry = sorted(rows, key=lambda row: row.escalated)
    assert (primary.model, primary.escalated, primary.failed) == ("luna", False, False)
    assert (retry.model, retry.escalated, retry.failed) == ("terra", True, False)
    # 비싼 쪽으로 간 비율은 지금처럼 escalated 줄 수로 센다.
    assert sum(row.escalated for row in rows) == 1


def test_재시도가_실패해도_그_호출은_남는다(
    client: TestClient, db: Session, default_categories
) -> None:
    first = _Model("luna", _extraction(amount=999_999_999_999))
    second = _Model("terra", LlmError("응답 없음"))
    _use(client, first, second)

    response = client.post("/api/v1/imports/text", json={"text": "점심 12000"}, headers=AUTH)

    # 1차 결과로 지금처럼 검토 화면이 뜬다.
    assert response.status_code == 201, response.text
    rows = _rows(db)
    assert len(rows) == 2
    assert [row.failed for row in sorted(rows, key=lambda row: row.escalated)] == [False, True]


def test_재시도_줄은_1분_상한을_먹지_않는다(
    client: TestClient, db: Session, default_categories, monkeypatch: pytest.MonkeyPatch
) -> None:
    """사람에게는 한 번의 읽기다. 재시도 줄은 비용 집계에만 남는다."""
    monkeypatch.setenv("NL_PARSE_BURST_LIMIT", "2")
    get_settings.cache_clear()
    try:
        _use(
            client,
            _Model("luna", _extraction(amount=999_999_999_999)),
            _Model("terra", _extraction()),
        )
        for _ in range(2):
            assert (
                client.post("/api/v1/imports/text", json={"text": "점심"}, headers=AUTH).status_code
                == 201
            )
        # 두 번 읽었고 재시도까지 줄은 넷이다. 상한은 읽은 횟수(2)로 찬다.
        assert len(_rows(db)) == 4
        blocked = client.post("/api/v1/imports/text", json={"text": "점심"}, headers=AUTH)
        assert blocked.status_code == 429
        # 문구는 지금과 같다.
        assert blocked.json()["error"] == {
            "code": "USAGE_LIMIT",
            "message": "조금 빠르게 이어서 부르고 있어요. 잠시 뒤에 다시 해 주세요.",
        }
    finally:
        get_settings.cache_clear()


def test_자산_캡처도_부르기_전에_세고_답을_받으면_고친다(
    app_client: tuple[TestClient, list[Session]], db: Session
) -> None:
    client, sessions = app_client
    seen: list[tuple[bool, list[bool]]] = []

    class _AssetModel(_Model):
        async def extract(self, **_: object) -> Any:
            from app.integrations.llm import AssetExtraction

            seen.append((sessions[-1].in_transaction(), [row.failed for row in _rows(db)]))
            return AssetExtraction(rows=[])

    _use(client, _AssetModel("luna"))

    response = client.post("/api/v1/assets/capture", json={"image": PNG}, headers=AUTH)

    assert response.status_code == 200, response.text
    assert seen == [(False, [True])]
    [row] = _rows(db)
    assert (row.failed, row.model, row.source.value) == (False, "luna", "asset_screenshot")
