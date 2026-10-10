"""이메일 로그인 남용 문.

지키는 것은 둘이다. **문이 실제로 닫혀 있나**(하루 틀린 횟수, 사람마다 메일 수와 주소 수,
동시 확인에서 틀린 횟수가 덮이지 않는 것), 그리고 **정상 흐름은 그대로인가**.
막힐 때는 화면이 이미 아는 USAGE_LIMIT 429 와 기존 문구만 쓴다.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, event, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.integrations.email.factory import get_email_sender
from app.models import LoginCode, User
from app.modules.account import login

AUTH = {"X-Anon-Key": "test-anon-key"}
OTHER = {"X-Anon-Key": "second-device-key"}
EMAIL = "someone@example.com"
TOO_MANY = "코드를 너무 자주 보냈어요. 잠시 뒤에 다시 받아 주세요."
UNAVAILABLE = "지금은 이메일 연결을 쓸 수 없어요. 잠시 뒤에 다시 해 주세요."


@pytest.fixture(autouse=True)
def fresh() -> Iterator[None]:
    get_email_sender.cache_clear()
    get_settings.cache_clear()
    yield
    get_email_sender.cache_clear()
    get_settings.cache_clear()


def _start(client: TestClient, email: str = EMAIL, headers: dict[str, str] = AUTH):  # type: ignore[no-untyped-def]
    return client.post("/api/v1/account/email/start", json={"email": email}, headers=headers)


def _peek(client: TestClient, email: str = EMAIL) -> str:
    res = client.get(f"/api/v1/account/email/peek?email={email}", headers=AUTH)
    assert res.status_code == 200, res.text
    return str(res.json()["code"])


def _verify(client: TestClient, code: str, email: str = EMAIL, headers: dict[str, str] = AUTH):  # type: ignore[no-untyped-def]
    return client.post(
        "/api/v1/account/email/verify", json={"email": email, "code": code}, headers=headers
    )


def _wrong(code: str) -> str:
    return "000000" if code != "000000" else "111111"


def _age_codes(db: Session, email: str, minutes: int) -> None:
    """보낸 시각을 뒤로 민다. 주소마다 10분 3통 창을 기다리지 않고 지나가게 한다."""
    for row in db.scalars(select(LoginCode).where(LoginCode.email == email)):
        row.created_at = row.created_at - timedelta(minutes=minutes)
    db.commit()


# ── 하루 틀린 횟수 ───────────────────────────────────────


def test_새_코드를_받아도_하루_틀린_횟수는_이어서_센다(
    client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LOGIN_CODE_DAILY_FAIL_LIMIT", "7")
    get_settings.cache_clear()

    # 첫 코드에서 5번 틀려 코드가 죽는다.
    assert _start(client).status_code == 204
    code = _peek(client)
    for _ in range(5):
        assert _verify(client, _wrong(code)).status_code == 422
    # 새 코드를 받아 2번 더 틀린다. 합이 7 이다.
    assert _start(client).status_code == 204
    code = _peek(client)
    for _ in range(2):
        assert _verify(client, _wrong(code)).status_code == 422

    # 맞는 코드도 안 본다. 기존 USAGE_LIMIT 429 와 기존 문구다.
    blocked = _verify(client, code)
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "USAGE_LIMIT"
    assert blocked.json()["error"]["message"] == UNAVAILABLE
    # 코드를 또 받아 상한을 풀 수도 없다.
    _age_codes(db, EMAIL, 11)
    again = _start(client)
    assert again.status_code == 429
    assert again.json()["error"]["message"] == TOO_MANY


def test_하루가_지난_틀림은_세지_않는다(
    client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LOGIN_CODE_DAILY_FAIL_LIMIT", "5")
    get_settings.cache_clear()

    assert _start(client).status_code == 204
    code = _peek(client)
    for _ in range(5):
        assert _verify(client, _wrong(code)).status_code == 422
    _age_codes(db, EMAIL, 24 * 60 + 1)

    assert _start(client).status_code == 204
    assert _verify(client, _peek(client)).json()["result"] == "linked"


def test_네_번_틀리고_다섯_번째에_맞히면_지금처럼_붙는다(client: TestClient) -> None:
    """정상 흐름은 그대로다. 코드마다 5번 상한도 그대로다."""
    assert _start(client).status_code == 204
    code = _peek(client)
    for _ in range(4):
        assert _verify(client, _wrong(code)).status_code == 422

    res = _verify(client, code)
    assert res.status_code == 200, res.text
    assert res.json()["result"] == "linked"


def test_코드를_읽을_때_행을_잠근다() -> None:
    """운영 DB(PostgreSQL)에서 동시에 온 확인 요청이 줄을 선다."""
    sql = str(login.live_code_query(EMAIL, uuid.uuid4()).compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in sql


def test_틀린_횟수는_읽은_값이_아니라_DB_값에_더한다(
    client: TestClient, db: Session, engine: Engine
) -> None:
    """읽은 뒤 쓰기 전에 다른 요청이 센 횟수를 덮어쓰지 않는다."""
    assert _start(client).status_code == 204
    code = _peek(client)

    # 확인 요청이 코드 행을 읽은 바로 뒤, 다른 요청 셋이 먼저 틀려 3 이 된 상황을 만든다.
    fired: list[bool] = []

    def bump(conn, cursor, statement, params, context, executemany) -> None:  # type: ignore[no-untyped-def]
        del conn, params, context, executemany
        live_code_read = (
            statement.lstrip().startswith("SELECT")
            and "FROM login_codes" in statement
            and "consumed_at IS NULL" in statement
        )
        if live_code_read and not fired:
            fired.append(True)
            cursor.connection.execute("UPDATE login_codes SET attempts = 3")

    event.listen(engine, "after_cursor_execute", bump)
    try:
        assert _verify(client, _wrong(code)).status_code == 422
    finally:
        event.remove(engine, "after_cursor_execute", bump)

    assert fired
    db.expire_all()
    assert db.scalar(select(LoginCode.attempts)) == 4


# ── 남이 틀려도 주인의 코드는 산다 ───────────────────────


def test_남이_받은_코드는_맞혀도_통하지_않고_그_코드도_죽지_않는다(two_devices: TestClient) -> None:
    """피해자가 코드를 받아 둔 사이 남이 그 주소로 마구 틀려 본다."""
    assert _start(two_devices).status_code == 204
    code = _peek(two_devices)

    # 남은 맞는 코드를 알아도 못 쓰고, 틀린 코드를 아무리 넣어도 피해자 코드의 횟수가 안 오른다.
    assert _verify(two_devices, code, headers=OTHER).status_code == 422
    for _ in range(30):
        assert _verify(two_devices, _wrong(code), headers=OTHER).status_code == 422

    res = _verify(two_devices, code)
    assert res.status_code == 200, res.text
    assert res.json()["result"] == "linked"


def test_남이_자기_코드로_하루_상한을_다_써도_주인은_막히지_않는다(
    two_devices: TestClient, db: Session
) -> None:
    """남이 피해자 주소로 코드를 받아 5번씩 네 번 틀린다. 예전에는 이것으로 주인이 하루 막혔다."""
    for _ in range(4):
        assert _start(two_devices, headers=OTHER).status_code == 204
        attacker_code = _peek(two_devices)
        for _ in range(5):
            assert _verify(two_devices, _wrong(attacker_code), headers=OTHER).status_code == 422
        _age_codes(db, EMAIL, 11)

    # 남은 자기 몫 20번을 다 써서 막힌다.
    assert _start(two_devices, headers=OTHER).status_code == 429

    # 주인은 그대로 코드를 받아 붙인다.
    assert _start(two_devices).status_code == 204
    res = _verify(two_devices, _peek(two_devices))
    assert res.status_code == 200, res.text
    assert res.json()["result"] == "linked"


def test_남의_계정_다섯이_함께_틀려도_주인은_막히지_않는다(
    two_devices: TestClient, db: Session
) -> None:
    """계정 다섯이 피해자 주소로 코드 4통씩 받아 5번씩 틀린다. 주소 전체로는 100번이다."""
    attackers = [{"X-Anon-Key": f"attacker-{i}"} for i in range(5)]
    for headers in attackers:
        for _ in range(4):
            assert _start(two_devices, headers=headers).status_code == 204
            attacker_code = _peek(two_devices)
            for _ in range(5):
                wrong = _verify(two_devices, _wrong(attacker_code), headers=headers)
                assert wrong.status_code == 422
            _age_codes(db, EMAIL, 11)
        # 저마다 자기 몫 20번을 다 써서 막힌다.
        assert _start(two_devices, headers=headers).status_code == 429
    total = db.scalars(select(LoginCode.attempts).where(LoginCode.email == EMAIL)).all()
    assert sum(total) == 100

    # 주인은 그대로 코드를 받아 붙인다.
    assert _start(two_devices).status_code == 204
    res = _verify(two_devices, _peek(two_devices))
    assert res.status_code == 200, res.text
    assert res.json()["result"] == "linked"


def test_요청한_사람이_비어_있는_옛_코드는_누구나_쓴다(client: TestClient, db: Session) -> None:
    """요청한 사람 칸이 생기기 전에 보낸 코드다. 배포 직후 10분 동안 그대로 통해야 한다."""
    now = datetime.now(UTC)
    db.add(
        LoginCode(
            email=EMAIL,
            code_hash=login._hash("123456"),
            expires_at=now + timedelta(minutes=10),
            requested_by_user_id=None,
        )
    )
    db.commit()

    res = _verify(client, "123456")
    assert res.status_code == 200, res.text
    assert res.json()["result"] == "linked"


# ── 사람마다 메일 상한 ───────────────────────────────────


def test_한_사람이_하루에_서로_다른_주소는_다섯_개까지만_보낸다(
    two_devices: TestClient, db: Session
) -> None:
    for i in range(5):
        assert _start(two_devices, f"a{i}@example.com").status_code == 204

    blocked = _start(two_devices, "a5@example.com")
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "USAGE_LIMIT"
    assert blocked.json()["error"]["message"] == TOO_MANY
    # 이미 보낸 주소로 다시 받는 것은 그대로 된다.
    assert _start(two_devices, "a0@example.com").status_code == 204
    # 다른 사람은 영향이 없다.
    assert _start(two_devices, "a5@example.com", headers=OTHER).status_code == 204
    # 메일마다 보내 달라고 한 사람이 남는다. 두 기기라 두 사람이다.
    assert db.scalar(select(User).limit(1)) is not None
    requesters = set(db.scalars(select(LoginCode.requested_by_user_id)))
    assert None not in requesters and len(requesters) == 2


def test_한_사람이_하루에_보내는_메일은_열_통까지다(two_devices: TestClient, db: Session) -> None:
    for round_ in range(2):
        for i in range(5):
            assert _start(two_devices, f"b{i}@example.com").status_code == 204, round_

    blocked = _start(two_devices, "b0@example.com")
    assert blocked.status_code == 429
    assert blocked.json()["error"]["message"] == TOO_MANY

    # 하루가 지나면 다시 보낸다.
    for row in db.scalars(select(LoginCode)):
        row.created_at = datetime.now(UTC) - timedelta(hours=25)
    db.commit()
    assert _start(two_devices, "b0@example.com").status_code == 204


def test_주소마다_10분_3통_상한은_그대로다(client: TestClient) -> None:
    for _ in range(3):
        assert _start(client).status_code == 204
    res = _start(client)
    assert res.status_code == 429
    assert res.json()["error"]["message"] == TOO_MANY
