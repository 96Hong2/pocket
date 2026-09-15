"""이메일 코드 로그인과 기기 잇기.

여기서 지키는 것은 넷이다. **코드 없이는 안 붙는 것**, **틀린 코드는 횟수를 세고 죽는 것**,
**새 기기가 그 이메일의 사람으로 옮겨 가는 것**(기록이 있었으면 합쳐지는 것),
그리고 **연령대·성별을 건너뛰어도 두 번 묻지 않는 것**.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.api.deps import get_verified_identity
from app.db.session import get_session
from app.integrations.apps_in_toss.anon_key import VerifiedIdentity
from app.integrations.email.factory import get_email_sender
from app.main import create_app
from app.models import Category, LoginCode, Transaction, User

AUTH = {"X-Anon-Key": "test-anon-key"}
OTHER = {"X-Anon-Key": "second-device-key"}
EMAIL = "Someone@Example.com"


@pytest.fixture(autouse=True)
def fresh_sender() -> Iterator[None]:
    """발송 스텁은 프로세스에 하나라 테스트 사이에 비운다."""
    get_email_sender.cache_clear()
    yield
    get_email_sender.cache_clear()


@pytest.fixture
def two_devices(engine: Engine) -> Iterator[TestClient]:
    """익명키를 헤더에서 읽는 앱. 기본 client 는 키 하나로 고정돼 두 기기를 못 만든다."""
    maker = sessionmaker(bind=engine, expire_on_commit=False)

    def override_session() -> Iterator[Session]:
        with maker() as session:
            yield session

    from fastapi import Header

    async def override_identity(x_anon_key: str = Header(alias="X-Anon-Key")) -> VerifiedIdentity:
        return VerifiedIdentity(anon_key=x_anon_key, verified_by="trusting")

    app = create_app()
    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_verified_identity] = override_identity
    with TestClient(app) as c:
        yield c


def _start(client: TestClient, email: str = EMAIL) -> None:
    res = client.post("/api/v1/account/email/start", json={"email": email}, headers=AUTH)
    assert res.status_code == 204, res.text


def _peek(client: TestClient, email: str = EMAIL) -> str:
    res = client.get(f"/api/v1/account/email/peek?email={email}", headers=AUTH)
    assert res.status_code == 200, res.text
    return str(res.json()["code"])


def _verify(client: TestClient, code: str, headers: dict[str, str] = AUTH) -> dict:
    return client.post(
        "/api/v1/account/email/verify", json={"email": EMAIL, "code": code}, headers=headers
    ).json()


def test_처음에는_이메일이_없고_연결을_쓸_수_있다(client: TestClient) -> None:
    res = client.get("/api/v1/account/me", headers=AUTH)

    assert res.status_code == 200, res.text
    assert res.json() == {
        "email": None,
        "age_band": None,
        "gender": None,
        "profile_asked": False,
        "email_login_available": True,
    }


def test_코드를_맞게_적으면_이_계정에_이메일이_붙는다(client: TestClient, db: Session) -> None:
    _start(client)
    code = _peek(client)

    body = _verify(client, code)

    assert body["result"] == "linked"
    # 대소문자·공백은 정리해 둔다. 다음에 다르게 적어도 같은 사람이어야 한다.
    assert body["me"]["email"] == "someone@example.com"
    # 코드 원문은 어디에도 없다. 해시만 남는다.
    row = db.scalar(select(LoginCode))
    assert row is not None and row.code_hash != code and row.consumed_at is not None


def test_틀린_코드는_횟수를_세고_상한을_넘으면_그_코드가_죽는다(client: TestClient) -> None:
    _start(client)
    code = _peek(client)
    wrong = "000000" if code != "000000" else "111111"

    for _ in range(5):
        res = client.post(
            "/api/v1/account/email/verify", json={"email": EMAIL, "code": wrong}, headers=AUTH
        )
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "LOGIN_CODE_INVALID"

    # 다섯 번 틀린 뒤에는 맞는 코드도 안 통한다. 새로 받아야 한다.
    res = client.post(
        "/api/v1/account/email/verify", json={"email": EMAIL, "code": code}, headers=AUTH
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "LOGIN_CODE_INVALID"


def test_새_코드를_받으면_앞선_코드는_죽는다(client: TestClient) -> None:
    _start(client)
    first = _peek(client)
    _start(client)
    second = _peek(client)

    assert (
        client.post(
            "/api/v1/account/email/verify", json={"email": EMAIL, "code": first}, headers=AUTH
        ).status_code
        == 422
    )
    assert _verify(client, second)["result"] == "linked"


def test_한_이메일에_짧은_시간에_너무_많이_보내면_막는다(client: TestClient) -> None:
    for _ in range(3):
        _start(client)

    res = client.post("/api/v1/account/email/start", json={"email": EMAIL}, headers=AUTH)

    assert res.status_code == 429, res.text
    assert res.json()["error"]["code"] == "USAGE_LIMIT"


def test_새_기기에서_확인하면_그_이메일의_사람으로_옮겨_간다(
    two_devices: TestClient, default_categories: list[Category]
) -> None:
    """기록이 없는 새 기기다. 옮겨 간 뒤에는 첫 기기의 기록이 그대로 보인다."""
    _start(two_devices)
    _verify(two_devices, _peek(two_devices))
    _record(two_devices, AUTH, 12_000)

    _start(two_devices)
    body = _verify(two_devices, _peek(two_devices), headers=OTHER)

    assert body["result"] == "switched"
    assert body["me"]["email"] == "someone@example.com"
    items = two_devices.get("/api/v1/transactions", headers=OTHER).json()["items"]
    assert [item["amount"] for item in items] == ["12000"]
    # 두 기기가 같은 사람이다. 어느 쪽에서 적어도 다른 쪽에 보인다.
    _record(two_devices, OTHER, 3_000)
    items = two_devices.get("/api/v1/transactions", headers=AUTH).json()["items"]
    assert sorted(item["amount"] for item in items) == ["12000", "3000"]


def test_기록이_있는_기기에서_확인하면_그_기록이_합쳐진다(
    two_devices: TestClient, db: Session, default_categories: list[Category]
) -> None:
    _start(two_devices)
    _verify(two_devices, _peek(two_devices))
    _record(two_devices, AUTH, 12_000)
    # 두 번째 기기에도 이미 적은 것이 있다.
    _record(two_devices, OTHER, 5_000)

    _start(two_devices)
    body = _verify(two_devices, _peek(two_devices), headers=OTHER)

    assert body["result"] == "merged"
    items = two_devices.get("/api/v1/transactions", headers=OTHER).json()["items"]
    assert sorted(item["amount"] for item in items) == ["12000", "5000"]
    # 접힌 계정은 하나뿐이고 기록은 전부 남은 계정 것이다.
    users = db.scalars(select(User)).all()
    assert sorted(user.deleted_at is not None for user in users) == [False, True]
    owner = next(user for user in users if user.deleted_at is None)
    assert all(row.user_id == owner.id for row in db.scalars(select(Transaction)))


def test_연령대_성별은_건너뛰어도_물었다고_남는다(client: TestClient) -> None:
    skipped = client.patch("/api/v1/account/profile", json={}, headers=AUTH)
    assert skipped.status_code == 200, skipped.text
    assert skipped.json()["profile_asked"] is True
    assert skipped.json()["age_band"] is None

    saved = client.patch(
        "/api/v1/account/profile", json={"age_band": "30s", "gender": "female"}, headers=AUTH
    )
    assert saved.json()["age_band"] == "30s"
    assert saved.json()["gender"] == "female"

    # 한쪽만 보내면 다른 쪽은 그대로다.
    only = client.patch("/api/v1/account/profile", json={"gender": "undisclosed"}, headers=AUTH)
    assert only.json()["age_band"] == "30s"
    assert only.json()["gender"] == "undisclosed"


def test_코드_보내기는_익명키_없이는_안_된다(unauthenticated_client: TestClient) -> None:
    """주소를 아는 누구나 아무 메일함에나 코드를 쏠 수 있으면 안 된다."""
    res = unauthenticated_client.post("/api/v1/account/email/start", json={"email": EMAIL})
    assert res.status_code == 401, res.text


def test_모르는_연령대는_거절한다(client: TestClient) -> None:
    res = client.patch("/api/v1/account/profile", json={"age_band": "90s"}, headers=AUTH)
    assert res.status_code == 422


def _record(client: TestClient, headers: dict[str, str], amount: int) -> None:
    categories = client.get("/api/v1/categories", headers=headers).json()["items"]
    food = next(i for i in categories if i["name"] == "식비")["id"]
    res = client.post(
        "/api/v1/transactions",
        json={
            "occurred_at": "2026-09-13T03:00:00+00:00",
            "amount": str(amount),
            "type": "expense",
            "category_id": food,
            "source": "keypad",
        },
        headers=headers,
    )
    assert res.status_code == 201, res.text


THIRD = {"X-Anon-Key": "third-device-key"}
EMAIL2 = "other@example.com"


def _start_as(client: TestClient, headers: dict[str, str], email: str) -> None:
    res = client.post("/api/v1/account/email/start", json={"email": email}, headers=headers)
    assert res.status_code == 204, res.text


def _peek_as(client: TestClient, headers: dict[str, str], email: str) -> str:
    res = client.get(f"/api/v1/account/email/peek?email={email}", headers=headers)
    assert res.status_code == 200, res.text
    return str(res.json()["code"])


def _verify_as(client: TestClient, headers: dict[str, str], email: str, code: str) -> dict:
    return client.post(
        "/api/v1/account/email/verify", json={"email": email, "code": code}, headers=headers
    ).json()


def test_합치기를_두_번_거쳐도_처음_기기가_빈_가계부를_보지_않는다(
    two_devices: TestClient, default_categories: list[Category]
) -> None:
    """계정을 처음 만든 기기는 UserDevice 줄이 없다. 그 계정이 나중에 접히면 길을 잃는다.

    접힌 행이 익명키 자리를 그대로 쥐고 있어, 새로 만들려던 시도가 unique 위반으로 돌아오고
    그 접힌 행이 그대로 돌아왔다. 화면에는 지금까지 적은 것이 하나도 없는 가계부가 뜬다.
    """
    del default_categories
    client = two_devices

    # 기기 A 가 계정을 만들고 메일 하나를 붙인다.
    _record(client, AUTH, 12_000)
    _start_as(client, AUTH, EMAIL)
    _verify_as(client, AUTH, EMAIL, _peek_as(client, AUTH, EMAIL))

    # 기기 B 가 다른 메일로 자기 계정을 만든다.
    _record(client, OTHER, 7_000)
    _start_as(client, OTHER, EMAIL2)
    _verify_as(client, OTHER, EMAIL2, _peek_as(client, OTHER, EMAIL2))

    # 기기 C 가 A 의 메일로 들어와 A 의 계정에 붙는다.
    _start_as(client, THIRD, EMAIL)
    joined = _verify_as(client, THIRD, EMAIL, _peek_as(client, THIRD, EMAIL))
    assert joined["me"]["email"] == "someone@example.com", joined

    # 기기 C 가 다시 B 의 메일로 옮겨 간다. 이때 A 가 만든 계정이 접힌다.
    _start_as(client, THIRD, EMAIL2)
    moved = _verify_as(client, THIRD, EMAIL2, _peek_as(client, THIRD, EMAIL2))
    assert moved["me"]["email"] == EMAIL2, moved

    # 기기 A 가 돌아온다. 접힌 계정이 아니라 옮겨 간 곳을 봐야 한다.
    items = client.get("/api/v1/transactions", headers=AUTH).json()["items"]
    assert sorted(item["amount"] for item in items) == ["12000", "7000"], items
