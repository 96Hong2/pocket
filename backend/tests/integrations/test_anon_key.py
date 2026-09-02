"""익명키 검증기. 4010 과 4095 를 다르게 다루는지, 운영에서 무엇이 막히는지 본다."""

from __future__ import annotations

import httpx
import pytest

from app.integrations.apps_in_toss.anon_key import (
    ANON_KEY_HEADER,
    ANON_KEY_VERIFY_PATH,
    AnonKeyAuthError,
    AnonKeyVerificationUnavailable,
    AnonKeyVerifierMisconfigured,
    AnonKeyVerifierSettings,
    TossAnonKeyVerifier,
    TrustingAnonKeyVerifier,
    create_anon_key_verifier,
)

pytestmark = pytest.mark.asyncio


def _fail(error_code: str, reason: str) -> httpx.Response:
    # 토스는 비즈니스 오류도 HTTP 200 으로 내려준다.
    return httpx.Response(
        200,
        json={
            "resultType": "FAIL",
            "error": {"errorCode": error_code, "reason": reason},
        },
    )


async def test_verify_sends_anon_key_header(make_client) -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"resultType": "SUCCESS", "success": {"status": "VALID"}})

    async with make_client(handler) as client:
        identity = await TossAnonKeyVerifier(client).verify("hash-1")

    assert seen[0].url.path == ANON_KEY_VERIFY_PATH
    assert seen[0].headers[ANON_KEY_HEADER] == "hash-1"
    assert identity.anon_key == "hash-1"
    assert identity.verified_by == "toss"
    assert identity.is_trusted_source is True
    assert identity.claims == {"status": "VALID"}


async def test_error_4010_is_an_auth_failure_and_is_not_retried(make_client) -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return _fail("4010", "인증 정보 없음")

    async with make_client(handler, max_attempts=3) as client:
        with pytest.raises(AnonKeyAuthError):
            await TossAnonKeyVerifier(client).verify("hash-1")

    assert len(calls) == 1


async def test_error_4095_is_retryable_and_not_an_auth_failure(make_client) -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return _fail("4095", "요청 한도 초과")

    async with make_client(handler, max_attempts=3) as client:
        with pytest.raises(AnonKeyVerificationUnavailable):
            await TossAnonKeyVerifier(client).verify("hash-1")

    # 한도 초과는 잠시 뒤 풀리므로 다시 시도한다. 4010 과 다른 지점이다.
    assert len(calls) == 3


async def test_empty_anon_key_never_reaches_the_network(make_client) -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={"resultType": "SUCCESS", "success": {}})

    async with make_client(handler) as client:
        with pytest.raises(AnonKeyAuthError):
            await TossAnonKeyVerifier(client).verify("")

    assert calls == []


async def test_trusting_verifier_is_used_only_in_local(caplog) -> None:
    settings = AnonKeyVerifierSettings(environment="local", allow_unverified_anon_key=True)
    verifier = create_anon_key_verifier(settings)
    assert isinstance(verifier, TrustingAnonKeyVerifier)

    with caplog.at_level("WARNING"):
        identity = await verifier.verify("hash-1")

    assert identity.verified_by == "trusting"
    assert identity.is_trusted_source is False
    assert caplog.records, "검증 없이 통과시킬 때는 경고 로그가 남아야 한다"


@pytest.mark.parametrize("environment", ["prod", "production", "PROD"])
async def test_trusting_verifier_is_never_selected_in_production(
    environment: str,
) -> None:
    settings = AnonKeyVerifierSettings(environment=environment, allow_unverified_anon_key=True)
    with pytest.raises(AnonKeyVerifierMisconfigured):
        create_anon_key_verifier(settings)


async def test_production_without_certificate_fails_to_start() -> None:
    settings = AnonKeyVerifierSettings(
        environment="prod",
        allow_unverified_anon_key=False,
        client_cert_path=None,
        client_key_path=None,
    )
    with pytest.raises(AnonKeyVerifierMisconfigured):
        create_anon_key_verifier(settings)


async def test_local_without_certificate_and_without_opt_in_fails() -> None:
    settings = AnonKeyVerifierSettings(environment="local", allow_unverified_anon_key=False)
    with pytest.raises(AnonKeyVerifierMisconfigured):
        create_anon_key_verifier(settings)
