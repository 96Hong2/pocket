"""틀린 익명키를 곳(IP)마다 세어 토스 검증 API 를 지킨다.

아무 문자열이나 익명키로 보내면 그때마다 토스에 묻는다. 남이 그 한도를 채우면 처음 들어오는
실사용자 검증이 줄을 선다. 지키는 것은 둘이다. 틀린 키를 몰아 보내는 곳은 토스에 닿지 못하고,
실사용자와 이미 확인된 키는 지금처럼 통과한다.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.api.deps import client_ip, get_verifier
from app.integrations.apps_in_toss.anon_key import (
    AnonKeyAuthError,
    AnonKeyRateLimited,
    CachingAnonKeyVerifier,
    FailureLimiter,
    VerifiedIdentity,
)

GOOD = "real-user-key"


class _Toss:
    """GOOD 만 통과시키는 가짜 토스. 몇 번 물었는지 센다."""

    def __init__(self) -> None:
        self.calls = 0

    async def verify(self, anon_key: str, *, client: str | None = None) -> VerifiedIdentity:
        self.calls += 1
        if anon_key != GOOD:
            raise AnonKeyAuthError("틀린 키")
        return VerifiedIdentity(anon_key=anon_key)


class _Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock() -> _Clock:
    return _Clock()


@pytest.fixture
def toss() -> _Toss:
    return _Toss()


@pytest.fixture
def verifier(toss: _Toss, clock: _Clock) -> CachingAnonKeyVerifier:
    return CachingAnonKeyVerifier(
        toss, clock=clock, limiter=FailureLimiter(limit=60, window_seconds=60, clock=clock)
    )


async def _fail_many(verifier: CachingAnonKeyVerifier, count: int, client: str) -> None:
    for index in range(count):
        with pytest.raises(AnonKeyAuthError):
            await verifier.verify(f"junk-{index}", client=client)


async def test_한_곳에서_틀린_키가_넘치면_토스에_묻지_않고_막는다(
    verifier: CachingAnonKeyVerifier, toss: _Toss
) -> None:
    await _fail_many(verifier, 60, "203.0.113.9")
    assert toss.calls == 60

    with pytest.raises(AnonKeyRateLimited):
        await verifier.verify("junk-new", client="203.0.113.9")
    assert toss.calls == 60


async def test_막힌_곳이어도_이미_확인된_키는_그대로_통과한다(
    verifier: CachingAnonKeyVerifier, toss: _Toss
) -> None:
    """같은 통신사 NAT 뒤에서 쓰던 실사용자는 계속 쓴다."""
    await verifier.verify(GOOD, client="203.0.113.9")
    await _fail_many(verifier, 60, "203.0.113.9")

    identity = await verifier.verify(GOOD, client="203.0.113.9")

    assert identity.anon_key == GOOD


async def test_다른_곳의_실사용자는_영향이_없다(verifier: CachingAnonKeyVerifier) -> None:
    await _fail_many(verifier, 60, "203.0.113.9")

    identity = await verifier.verify(GOOD, client="198.51.100.7")

    assert identity.anon_key == GOOD


async def test_상한_아래의_실패는_막지_않는다(
    verifier: CachingAnonKeyVerifier, toss: _Toss
) -> None:
    await _fail_many(verifier, 59, "203.0.113.9")

    assert (await verifier.verify(GOOD, client="203.0.113.9")).anon_key == GOOD
    assert toss.calls == 60


async def test_창이_지나면_다시_묻는다(
    verifier: CachingAnonKeyVerifier, toss: _Toss, clock: _Clock
) -> None:
    await _fail_many(verifier, 60, "203.0.113.9")
    clock.now += 61

    assert (await verifier.verify(GOOD, client="203.0.113.9")).anon_key == GOOD


async def test_같은_틀린_키를_되풀이하면_잠깐은_다시_묻지_않는다(
    verifier: CachingAnonKeyVerifier, toss: _Toss, clock: _Clock
) -> None:
    for _ in range(5):
        with pytest.raises(AnonKeyAuthError):
            await verifier.verify("deploy-smoke", client="198.51.100.7")
    assert toss.calls == 1

    clock.now += 31
    with pytest.raises(AnonKeyAuthError):
        await verifier.verify("deploy-smoke", client="198.51.100.7")
    assert toss.calls == 2


def _request(headers: list[tuple[bytes, bytes]], client: str = "169.254.1.1") -> Request:
    return Request({"type": "http", "headers": headers, "client": (client, 0)})


def test_IP_는_Google_앞단이_덧붙인_마지막_값을_쓴다() -> None:
    """앞쪽 값은 보내는 쪽이 마음대로 적는다. 그 값으로 세면 요청마다 IP 를 바꿔 상한을 피한다."""
    spoofed = _request([(b"x-forwarded-for", b"1.2.3.4, 5.6.7.8, 203.0.113.9")])
    plain = _request([(b"x-forwarded-for", b"203.0.113.9")])
    split = _request([(b"x-forwarded-for", b"1.2.3.4"), (b"x-forwarded-for", b"203.0.113.9")])

    assert client_ip(spoofed) == client_ip(plain) == client_ip(split) == "203.0.113.9"


def test_앞단이_없으면_연결한_주소를_쓴다() -> None:
    assert client_ip(_request([], client="127.0.0.1")) == "127.0.0.1"


@pytest.fixture
def limited_app(unauthenticated_client: TestClient) -> Iterator[TestClient]:
    class _Limited:
        async def verify(self, anon_key: str, *, client: str | None = None) -> VerifiedIdentity:
            raise AnonKeyRateLimited("막힘")

    overrides = unauthenticated_client.app.dependency_overrides  # type: ignore[attr-defined]
    overrides[get_verifier] = lambda: _Limited()
    yield unauthenticated_client
    overrides.pop(get_verifier, None)


def test_막히면_기존_429_문구로_답한다(limited_app: TestClient) -> None:
    response = limited_app.get("/api/v1/categories", headers={"X-Anon-Key": "junk"})

    assert response.status_code == 429
    assert response.json()["error"] == {
        "code": "USAGE_LIMIT",
        "message": "조금 빠르게 이어서 부르고 있어요. 잠시 뒤에 다시 해 주세요.",
    }
