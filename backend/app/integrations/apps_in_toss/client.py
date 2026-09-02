"""토스 서버 API 호출 클라이언트.

이 계층 밖에서는 httpx 를 직접 쓰지 않는다.

주의: 토스 서버 API 는 비즈니스 오류도 HTTP 200 으로 내려준다.
성공 여부는 상태코드가 아니라 응답 봉투의 resultType 으로 판정한다.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Self

import httpx
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://apps-in-toss-api.toss.im"

# 앱당 분당 3,000회 한도. 여유를 두고 기본값을 조금 낮게 잡는다.
DEFAULT_RATE_LIMIT_PER_MINUTE = 2_900

ResultType = Literal[
    "SUCCESS",
    "FAIL",
    "HTTP_TIMEOUT",
    "NETWORK_ERROR",
    "EXECUTION_FAIL",
    "INTERRUPTED",
    "INTERNAL_ERROR",
]

# 다시 불러도 같은 결과가 기대되는 인프라성 실패만 재시도 대상으로 본다.
# EXECUTION_FAIL 은 서버가 실제로 실행하고 실패한 것이라 재시도하지 않는다.
TRANSIENT_RESULT_TYPES: frozenset[str] = frozenset(
    {"HTTP_TIMEOUT", "NETWORK_ERROR", "INTERRUPTED", "INTERNAL_ERROR"}
)

# 요청 한도 초과. 잠시 뒤 다시 부르면 풀린다.
ERROR_CODE_RATE_LIMITED = "4095"
# 인증 정보 없음. 다시 불러도 똑같이 실패한다.
ERROR_CODE_UNAUTHENTICATED = "4010"

RETRYABLE_ERROR_CODES: frozenset[str] = frozenset({ERROR_CODE_RATE_LIMITED})


class TossApiError(Exception):
    """토스 서버 API 호출 실패."""

    def __init__(
        self,
        message: str,
        *,
        result_type: str | None = None,
        error_code: str | None = None,
        reason: str | None = None,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.result_type = result_type
        self.error_code = error_code
        self.reason = reason
        self.status_code = status_code

    @property
    def retryable(self) -> bool:
        return False


class TossBusinessError(TossApiError):
    """resultType=FAIL. HTTP 는 200 이어도 실패다."""

    @property
    def retryable(self) -> bool:
        return self.error_code in RETRYABLE_ERROR_CODES


class TossTransientError(TossApiError):
    """타임아웃·네트워크 오류·서버 오류처럼 다시 시도해 볼 수 있는 실패."""

    @property
    def retryable(self) -> bool:
        return True


class TossResponseFormatError(TossApiError):
    """공통 응답 봉투로 읽을 수 없는 응답."""


class MisconfiguredTossApi(RuntimeError):
    """인증서 등 호출에 필요한 설정이 갖춰지지 않음."""


class TossErrorBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    error_code: str | None = Field(default=None, alias="errorCode")
    reason: str | None = None

    def coerced_code(self) -> str | None:
        return None if self.error_code is None else str(self.error_code)


class TossEnvelope(BaseModel):
    """모든 토스 서버 API 가 공유하는 응답 봉투."""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    result_type: ResultType = Field(alias="resultType")
    success: Any = None
    error: TossErrorBody | None = None


@dataclass(slots=True)
class TossApiSettings:
    """호출에 필요한 설정. app 기동부에서 주입한다."""

    base_url: str = DEFAULT_BASE_URL
    client_cert_path: str | None = None
    client_key_path: str | None = None
    timeout_seconds: float = 5.0
    max_attempts: int = 3
    retry_backoff_seconds: float = 0.2
    rate_limit_per_minute: int = DEFAULT_RATE_LIMIT_PER_MINUTE

    @property
    def has_client_certificate(self) -> bool:
        if not self.client_cert_path or not self.client_key_path:
            return False
        return Path(self.client_cert_path).is_file() and Path(self.client_key_path).is_file()

    def cert_tuple(self) -> tuple[str, str]:
        if not self.has_client_certificate:
            raise MisconfiguredTossApi(
                "토스 서버 API 는 mTLS 클라이언트 인증서가 있어야 호출할 수 있다. "
                "docs/SECRETS.md 참고."
            )
        assert self.client_cert_path is not None
        assert self.client_key_path is not None
        return (self.client_cert_path, self.client_key_path)


@dataclass(slots=True)
class MinuteRateLimiter:
    """분당 호출 수를 넘지 않게 잡아 두는 슬라이딩 윈도.

    한 프로세스 안에서만 센다. 인스턴스가 여러 개면 그만큼 여유를 줄여야 한다.
    """

    max_calls: int
    clock: Callable[[], float] = time.monotonic
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep
    _calls: deque[float] = field(default_factory=deque, init=False, repr=False)

    async def acquire(self) -> None:
        if self.max_calls <= 0:
            return
        while True:
            now = self.clock()
            while self._calls and now - self._calls[0] >= 60.0:
                self._calls.popleft()
            if len(self._calls) < self.max_calls:
                self._calls.append(now)
                return
            wait_for = 60.0 - (now - self._calls[0])
            logger.warning(
                "토스 API 분당 한도에 걸려 대기한다 max_calls=%s wait=%.3fs",
                self.max_calls,
                wait_for,
            )
            await self.sleep(max(wait_for, 0.0))


class TossApiClient:
    """토스 서버 API 공통 클라이언트.

    - mTLS 클라이언트 인증서를 붙인다.
    - 응답 봉투를 풀어 성공 payload 만 돌려준다.
    - 멱등 요청에 한해 인프라성 실패를 재시도한다.
    """

    def __init__(
        self,
        settings: TossApiSettings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        rate_limiter: MinuteRateLimiter | None = None,
    ) -> None:
        self._settings = settings
        self._sleep = sleep
        self._rate_limiter = rate_limiter or MinuteRateLimiter(
            max_calls=settings.rate_limit_per_minute, sleep=sleep
        )
        kwargs: dict[str, Any] = {
            "base_url": settings.base_url,
            "timeout": settings.timeout_seconds,
        }
        if transport is not None:
            # 테스트에서 MockTransport 를 넣는 자리. 인증서는 붙이지 않는다.
            kwargs["transport"] = transport
        else:
            kwargs["cert"] = settings.cert_tuple()
        self._client = httpx.AsyncClient(**kwargs)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def post(
        self,
        path: str,
        *,
        headers: Mapping[str, str] | None = None,
        json: Any | None = None,
        idempotent: bool = False,
    ) -> Any:
        return await self.request("POST", path, headers=headers, json=json, idempotent=idempotent)

    async def request(
        self,
        method: str,
        path: str,
        *,
        headers: Mapping[str, str] | None = None,
        json: Any | None = None,
        idempotent: bool = False,
    ) -> Any:
        """성공 payload(success 안쪽)를 돌려준다. 실패는 예외로 올린다."""
        attempts = max(1, self._settings.max_attempts) if idempotent else 1
        last_error: TossApiError | None = None
        for attempt in range(1, attempts + 1):
            await self._rate_limiter.acquire()
            try:
                return await self._request_once(method, path, headers=headers, json=json)
            except TossApiError as error:
                last_error = error
                if not error.retryable or attempt == attempts:
                    raise
                delay = self._settings.retry_backoff_seconds * (2 ** (attempt - 1))
                logger.warning(
                    "토스 API 재시도 path=%s attempt=%s/%s result_type=%s code=%s",
                    path,
                    attempt,
                    attempts,
                    error.result_type,
                    error.error_code,
                )
                await self._sleep(delay)
        assert last_error is not None
        raise last_error

    async def _request_once(
        self,
        method: str,
        path: str,
        *,
        headers: Mapping[str, str] | None,
        json: Any | None,
    ) -> Any:
        try:
            response = await self._client.request(
                method, path, headers=dict(headers or {}), json=json
            )
        except httpx.TimeoutException as exc:
            raise TossTransientError("토스 API 응답 시간 초과", result_type="HTTP_TIMEOUT") from exc
        except httpx.TransportError as exc:
            raise TossTransientError("토스 API 연결 실패", result_type="NETWORK_ERROR") from exc
        return self._unwrap(response)

    def _unwrap(self, response: httpx.Response) -> Any:
        envelope = self._parse_envelope(response)
        if envelope is None:
            # 봉투를 못 읽으면 상태코드로만 판정할 수밖에 없다.
            if response.status_code >= 500 or response.status_code == 429:
                raise TossTransientError(
                    "토스 API 오류 응답",
                    result_type="INTERNAL_ERROR",
                    status_code=response.status_code,
                )
            raise TossResponseFormatError(
                "토스 API 응답을 공통 봉투로 읽지 못했다",
                status_code=response.status_code,
            )

        if envelope.result_type == "SUCCESS":
            # HTTP 상태가 200 이어도 봉투가 SUCCESS 여야 성공이다.
            return envelope.success

        error = envelope.error or TossErrorBody()
        code = error.coerced_code()
        if envelope.result_type == "FAIL":
            raise TossBusinessError(
                f"토스 API 실패 code={code}",
                result_type=envelope.result_type,
                error_code=code,
                reason=error.reason,
                status_code=response.status_code,
            )
        if envelope.result_type in TRANSIENT_RESULT_TYPES:
            raise TossTransientError(
                f"토스 API 일시 실패 resultType={envelope.result_type}",
                result_type=envelope.result_type,
                error_code=code,
                reason=error.reason,
                status_code=response.status_code,
            )
        raise TossApiError(
            f"토스 API 실패 resultType={envelope.result_type}",
            result_type=envelope.result_type,
            error_code=code,
            reason=error.reason,
            status_code=response.status_code,
        )

    @staticmethod
    def _parse_envelope(response: httpx.Response) -> TossEnvelope | None:
        try:
            payload = response.json()
        except ValueError:
            return None
        if not isinstance(payload, dict):
            return None
        try:
            return TossEnvelope.model_validate(payload)
        except ValueError:
            return None
