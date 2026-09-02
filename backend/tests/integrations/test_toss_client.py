"""토스 서버 API 클라이언트. 실제 네트워크 없이 MockTransport 로만 검증한다."""

from __future__ import annotations

import httpx
import pytest

from app.integrations.apps_in_toss.client import (
    MinuteRateLimiter,
    MisconfiguredTossApi,
    TossApiSettings,
    TossBusinessError,
    TossResponseFormatError,
    TossTransientError,
)

pytestmark = pytest.mark.asyncio


async def test_success_envelope_returns_payload(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"resultType": "SUCCESS", "success": {"userKey": "abc"}})

    async with make_client(handler) as client:
        assert await client.post("/ping") == {"userKey": "abc"}


async def test_http_200_with_fail_result_type_is_a_failure(make_client) -> None:
    """가장 중요한 규칙. 상태코드 200 이어도 resultType 이 FAIL 이면 실패다."""
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(
            200,
            json={
                "resultType": "FAIL",
                "error": {"errorCode": "4010", "reason": "인증 정보 없음"},
            },
        )

    async with make_client(handler) as client:
        with pytest.raises(TossBusinessError) as caught:
            await client.post("/verify", idempotent=True)

    assert caught.value.status_code == 200
    assert caught.value.result_type == "FAIL"
    assert caught.value.error_code == "4010"
    assert caught.value.reason == "인증 정보 없음"
    # 다시 불러도 같은 결과라 재시도하지 않는다.
    assert len(calls) == 1


async def test_rate_limited_fail_is_retried_then_raised(make_client, sleep_calls) -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(
            200,
            json={
                "resultType": "FAIL",
                "error": {"errorCode": "4095", "reason": "요청 한도 초과"},
            },
        )

    async with make_client(handler, max_attempts=3) as client:
        with pytest.raises(TossBusinessError) as caught:
            await client.post("/verify", idempotent=True)

    assert caught.value.retryable is True
    assert len(calls) == 3
    assert len(sleep_calls) == 2


async def test_non_idempotent_request_is_not_retried(make_client) -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={"resultType": "INTERNAL_ERROR"})

    async with make_client(handler, max_attempts=3) as client:
        with pytest.raises(TossTransientError):
            await client.post("/write", idempotent=False)

    assert len(calls) == 1


async def test_transient_result_type_recovers_on_retry(make_client) -> None:
    responses = [
        httpx.Response(200, json={"resultType": "HTTP_TIMEOUT"}),
        httpx.Response(200, json={"resultType": "SUCCESS", "success": {"ok": True}}),
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        return responses.pop(0)

    async with make_client(handler) as client:
        assert await client.post("/ping", idempotent=True) == {"ok": True}


async def test_execution_fail_is_not_retried(make_client) -> None:
    """서버가 실제로 실행하고 실패한 것이라 다시 부르지 않는다."""
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={"resultType": "EXECUTION_FAIL"})

    async with make_client(handler) as client:
        with pytest.raises(Exception) as caught:
            await client.post("/ping", idempotent=True)

    assert caught.value.result_type == "EXECUTION_FAIL"
    assert caught.value.retryable is False
    assert len(calls) == 1


async def test_timeout_becomes_transient_error(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timeout", request=request)

    async with make_client(handler, max_attempts=2) as client:
        with pytest.raises(TossTransientError) as caught:
            await client.post("/ping", idempotent=True)

    assert caught.value.result_type == "HTTP_TIMEOUT"


async def test_non_envelope_body_is_a_format_error(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>nope</html>")

    async with make_client(handler) as client:
        with pytest.raises(TossResponseFormatError):
            await client.post("/ping")


async def test_server_error_without_envelope_is_transient(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="oops")

    async with make_client(handler, max_attempts=2) as client:
        with pytest.raises(TossTransientError):
            await client.post("/ping", idempotent=True)


async def test_rate_limiter_waits_when_minute_budget_is_spent() -> None:
    now = [0.0]
    waited: list[float] = []

    async def sleep(seconds: float) -> None:
        waited.append(seconds)
        now[0] += seconds

    limiter = MinuteRateLimiter(max_calls=2, clock=lambda: now[0], sleep=sleep)
    await limiter.acquire()
    await limiter.acquire()
    await limiter.acquire()

    assert waited == [60.0]


async def test_missing_certificate_blocks_client_creation() -> None:
    settings = TossApiSettings(client_cert_path=None, client_key_path=None)
    assert settings.has_client_certificate is False
    with pytest.raises(MisconfiguredTossApi):
        settings.cert_tuple()
