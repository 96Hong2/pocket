"""익명 식별키 검증.

로그인 화면이 없으므로 사용자는 토스 익명키 하나로만 식별된다.
클라이언트가 보낸 키를 그대로 믿지 않고 토스 서버에 확인한다.
"""

from __future__ import annotations

import hashlib
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol, runtime_checkable

from app.integrations.apps_in_toss.client import (
    DEFAULT_BASE_URL,
    ERROR_CODE_UNAUTHENTICATED,
    MisconfiguredTossApi,
    TossApiClient,
    TossApiError,
    TossApiSettings,
    TossBusinessError,
)

logger = logging.getLogger(__name__)

ANON_KEY_VERIFY_PATH = "/api-partner/v1/apps-in-toss/users/anon-key/verify"
ANON_KEY_HEADER = "x-anon-key"

VerifierKind = Literal["toss", "trusting"]


class AnonKeyAuthError(Exception):
    """키가 유효하지 않다. 다시 불러도 같다."""


class AnonKeyRejected(AnonKeyAuthError):
    """토스가 이 키를 모른다고 답했다(`ERROR_CODE_UNAUTHENTICATED`).

    이것만 틀린 키로 기억하고 곳마다 센다. 그 밖의 실패는 토스 쪽 사정일 수 있어 정상 키를
    가진 사람까지 묶을 수 있다.
    """


class AnonKeyVerificationUnavailable(Exception):
    """지금은 확인할 수 없다. 한도 초과·네트워크 오류 등, 다시 시도할 수 있다."""


class AnonKeyRateLimited(Exception):
    """한 곳에서 틀린 키가 너무 많이 왔다. 토스에 묻지 않고 잠시 막는다."""


class AnonKeyVerifierMisconfigured(RuntimeError):
    """검증기를 고를 수 없는 설정. 기동을 멈춘다."""


@dataclass(frozen=True, slots=True)
class VerifiedIdentity:
    """검증을 통과한 사용자 식별 정보."""

    # repr 에서 뺀다. 로그에 %s 로 찍혀도 익명키 원문이 남지 않게 한다.
    anon_key: str = field(repr=False)
    verified_by: VerifierKind = "toss"
    # 토스 응답 success payload. 형태가 공개 문서에 없어 그대로 담아 둔다.
    claims: dict[str, Any] | None = None

    @property
    def is_trusted_source(self) -> bool:
        return self.verified_by == "toss"


@runtime_checkable
class AnonKeyVerifier(Protocol):
    # client 는 요청을 보낸 곳(IP)이다. 틀린 키를 곳마다 세는 검증기만 쓴다.
    async def verify(self, anon_key: str, *, client: str | None = None) -> VerifiedIdentity: ...


class TossAnonKeyVerifier:
    """토스 서버에 mTLS 로 물어보는 실제 검증기."""

    def __init__(self, client: TossApiClient) -> None:
        self._client = client

    async def verify(self, anon_key: str, *, client: str | None = None) -> VerifiedIdentity:
        del client
        if not anon_key:
            raise AnonKeyAuthError("익명키가 비어 있다")
        try:
            success = await self._client.post(
                ANON_KEY_VERIFY_PATH,
                headers={ANON_KEY_HEADER: anon_key},
                # 같은 키를 다시 물어봐도 결과가 같으므로 재시도해도 된다.
                idempotent=True,
            )
        except TossBusinessError as error:
            if error.error_code == ERROR_CODE_UNAUTHENTICATED:
                raise AnonKeyRejected("익명키 인증 정보 없음") from error
            if error.retryable:
                raise AnonKeyVerificationUnavailable(
                    f"익명키 검증을 지금 할 수 없다 code={error.error_code}"
                ) from error
            raise AnonKeyAuthError(f"익명키 검증 실패 code={error.error_code}") from error
        except TossApiError as error:
            if error.retryable:
                raise AnonKeyVerificationUnavailable("익명키 검증을 지금 할 수 없다") from error
            raise AnonKeyAuthError("익명키 검증 실패") from error

        claims = success if isinstance(success, dict) else None
        return VerifiedIdentity(anon_key=anon_key, verified_by="toss", claims=claims)


class TrustingAnonKeyVerifier:
    """로컬 개발용. 검증 없이 통과시킨다.

    local 이 아닌 환경에서는 절대 선택되지 않는다. create_anon_key_verifier 가 막는다.
    """

    def __init__(self) -> None:
        logger.warning("익명키를 검증하지 않는 개발용 검증기를 쓴다. 운영에서 쓰면 안 된다.")

    async def verify(self, anon_key: str, *, client: str | None = None) -> VerifiedIdentity:
        del client
        if not anon_key:
            raise AnonKeyAuthError("익명키가 비어 있다")
        logger.warning("익명키를 검증 없이 통과시킨다 (개발용)")
        return VerifiedIdentity(anon_key=anon_key, verified_by="trusting")


@dataclass(slots=True)
class _Window:
    start: float
    failures: int = 0
    warned: bool = False


class FailureLimiter:
    """곳(IP)마다 틀린 키를 센다. 1분에 `limit` 번을 넘기면 그 창이 끝날 때까지 막는다.

    아무 문자열이나 익명키로 보내면 그때마다 토스 검증 API 를 부른다. 그 한도(미니앱당 분당
    3,000회)를 남이 채우면 처음 들어오는 실사용자 검증이 줄을 선다. 실사용자는 검증에 실패할
    일이 없어 상한을 넉넉히 둔다. 통신사 NAT 뒤 여러 사람이 한 IP 를 써도 닿지 않는 값이다.

    **토스에 묻고 있는 수도 함께 센다.** 답이 온 뒤에만 세면 한꺼번에 보낸 틀린 키 수백 개가
    모두 0회 상태로 통과해 토스에 그대로 간다. 그래서 `실패 + 진행 중 >= limit` 이면 막는다.

    `enforce` 가 꺼져 있으면(기본) 막지 않고 창마다 한 번 경고 로그만 남긴다. 운영의 실제
    X-Forwarded-For 모양을 확인하기 전에 막으면 모두가 한 칸에 들어가 함께 막힐 수 있어서다
    (`ANON_KEY_FAILURE_GUARD`, docs/DEPLOY.md).

    인스턴스 메모리에만 센다. 인스턴스가 여럿이면 곳마다 그 수만큼 더 받는다.
    """

    def __init__(
        self,
        *,
        limit: int = 60,
        window_seconds: float = 60.0,
        max_entries: int = 10_000,
        enforce: bool = False,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._limit = limit
        self._window = window_seconds
        self._max_entries = max_entries
        self._enforce = enforce
        self._clock = clock
        self._entries: dict[str, _Window] = {}
        self._inflight: dict[str, int] = {}

    def admit(self, client: str) -> bool:
        """토스에 물어도 되는지. 된다면 진행 중으로 세므로 끝나면 꼭 `finish` 를 부른다."""
        now = self._clock()
        window = self._current(client, now)
        failures = window.failures if window is not None else 0
        inflight = self._inflight.get(client, 0)
        if failures + inflight >= self._limit:
            if self._enforce:
                return False
            self._warn(client, now, failures=failures, inflight=inflight)
        self._inflight[client] = inflight + 1
        return True

    def finish(self, client: str, *, failed: bool) -> None:
        left = self._inflight.get(client, 0) - 1
        if left > 0:
            self._inflight[client] = left
        else:
            self._inflight.pop(client, None)
        if failed:
            self.record(client)

    def record(self, client: str) -> None:
        now = self._clock()
        window = self._current(client, now) or self._open(client, now)
        window.failures += 1

    def _current(self, client: str, now: float) -> _Window | None:
        window = self._entries.get(client)
        if window is None or now - window.start >= self._window:
            return None
        return window

    def _open(self, client: str, now: float) -> _Window:
        if len(self._entries) >= self._max_entries:
            self._evict(now)
        window = _Window(start=now)
        self._entries[client] = window
        return window

    def _warn(self, client: str, now: float, *, failures: int, inflight: int) -> None:
        window = self._current(client, now) or self._open(client, now)
        if window.warned:
            return
        window.warned = True
        # 키 값은 남기지 않는다. 고른 칸 이름과 헤더의 칸 수만 본다.
        logger.warning(
            "틀린 익명키가 한 곳에서 상한을 넘었다. 막지 않고 기록만 한다",
            extra={
                "anon_key_guard": "log",
                "client_key": str(client),
                "forwarded_hops": getattr(client, "forwarded_hops", None),
                "failures": failures,
                "inflight": inflight,
                "limit": self._limit,
            },
        )

    def _evict(self, now: float) -> None:
        for key in [k for k, w in self._entries.items() if now - w.start >= self._window]:
            del self._entries[key]
        if len(self._entries) >= self._max_entries:
            for key in sorted(self._entries, key=lambda k: self._entries[k].start)[
                : self._max_entries // 2
            ]:
                del self._entries[key]


class CachingAnonKeyVerifier:
    """검증 결과를 잠깐 기억한다.

    화면 하나가 목록·요약을 함께 부르므로 검증 호출이 요청 수만큼 늘어난다.
    토스 서버 API 한도는 미니앱당 분당 3,000회라, 캐시가 없으면 사용자가 늘수록
    한도에 먼저 걸린다.

    성공은 10분 기억한다. 토스가 모르는 키라고 답한 것(`AnonKeyRejected`)만 30초 기억해 같은
    키를 되풀이해 보내도 토스에 다시 묻지 않는다. 그 밖의 실패는 기억하지도 세지도 않는다.
    매번 다른 문자열을 보내는 것은 `FailureLimiter` 가 곳마다 세어 막는다.
    **기억해 둔 성공은 막힌 곳에서도 통과한다.** 공격자와 같은 IP 뒤에 있는 실사용자가
    이미 쓰던 중이면 그대로 쓴다.
    """

    def __init__(
        self,
        inner: AnonKeyVerifier,
        *,
        ttl_seconds: float = 600.0,
        rejected_ttl_seconds: float = 30.0,
        max_entries: int = 10_000,
        limiter: FailureLimiter | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._inner = inner
        self._ttl = ttl_seconds
        self._rejected_ttl = rejected_ttl_seconds
        self._max_entries = max_entries
        self._clock = clock
        self._limiter = limiter if limiter is not None else FailureLimiter(clock=clock)
        self._entries: dict[str, tuple[float, VerifiedIdentity]] = {}
        self._rejected: dict[str, float] = {}

    @staticmethod
    def _key(anon_key: str) -> str:
        # 원문을 메모리에 키로 두지 않는다.
        return hashlib.sha256(anon_key.encode("utf-8")).hexdigest()

    async def verify(self, anon_key: str, *, client: str | None = None) -> VerifiedIdentity:
        if not anon_key:
            raise AnonKeyAuthError("익명키가 비어 있다")
        key = self._key(anon_key)
        now = self._clock()
        cached = self._entries.get(key)
        if cached is not None and cached[0] > now:
            # 저장해 둔 것은 검증 사실뿐이다. anon_key 는 이번 요청 값을 그대로 쓴다.
            return VerifiedIdentity(
                anon_key=anon_key,
                verified_by=cached[1].verified_by,
                claims=cached[1].claims,
            )

        rejected = self._rejected.get(key)
        if rejected is not None and rejected > now:
            if client is not None:
                self._limiter.record(client)
            raise AnonKeyRejected("방금 틀린 익명키")
        if client is not None and not self._limiter.admit(client):
            raise AnonKeyRateLimited("틀린 익명키가 한 곳에서 너무 많이 왔다")

        failed = False
        try:
            identity = await self._inner.verify(anon_key)
        except AnonKeyRejected:
            failed = True
            if len(self._rejected) >= self._max_entries:
                self._evict_rejected(now)
            self._rejected[key] = now + self._rejected_ttl
            raise
        finally:
            if client is not None:
                self._limiter.finish(client, failed=failed)
        if len(self._entries) >= self._max_entries:
            self._evict(now)
        self._entries[key] = (now + self._ttl, identity)
        return identity

    def _evict(self, now: float) -> None:
        expired = [k for k, (until, _) in self._entries.items() if until <= now]
        for k in expired:
            del self._entries[k]
        if len(self._entries) >= self._max_entries:
            # 만료로 자리가 안 나면 오래된 것부터 버린다.
            for k in sorted(self._entries, key=lambda k: self._entries[k][0])[
                : self._max_entries // 2
            ]:
                del self._entries[k]

    def _evict_rejected(self, now: float) -> None:
        for k in [k for k, until in self._rejected.items() if until <= now]:
            del self._rejected[k]
        if len(self._rejected) >= self._max_entries:
            self._rejected.clear()


@dataclass(frozen=True, slots=True)
class AnonKeyVerifierSettings:
    """검증기 선택에 필요한 값. app 기동부에서 채워 넣는다."""

    environment: str = "local"
    allow_unverified_anon_key: bool = False
    base_url: str = DEFAULT_BASE_URL
    client_cert_path: str | None = None
    client_key_path: str | None = None
    timeout_seconds: float = 5.0
    verify_cache_ttl_seconds: float = 600.0
    # 틀린 키를 곳마다 셀 때 막을지(enforce), 경고 로그만 남길지(log).
    failure_guard: Literal["log", "enforce"] = "log"

    @property
    def requires_verification(self) -> bool:
        """local 이 아니면 전부 검증이 필요하다. dev·QR 테스트 서버도 공용이다."""
        return self.environment.strip().lower() not in {"local", ""}

    def to_api_settings(self) -> TossApiSettings:
        return TossApiSettings(
            base_url=self.base_url,
            client_cert_path=self.client_cert_path,
            client_key_path=self.client_key_path,
            timeout_seconds=self.timeout_seconds,
        )


def create_anon_key_verifier(
    settings: AnonKeyVerifierSettings,
) -> AnonKeyVerifier:
    """설정을 보고 검증기를 고른다.

    운영인데 인증서가 없으면 기동을 실패시킨다. 가짜 인증서를 만들지 않는다.
    """
    api_settings = settings.to_api_settings()

    if settings.requires_verification and settings.allow_unverified_anon_key:
        raise AnonKeyVerifierMisconfigured(
            "local 이 아닌 환경에서는 익명키 검증을 끌 수 없다. "
            "ALLOW_UNVERIFIED_ANON_KEY 를 false 로 둔다."
        )

    if api_settings.has_client_certificate:
        try:
            client = TossApiClient(api_settings)
        except MisconfiguredTossApi as error:
            raise AnonKeyVerifierMisconfigured(str(error)) from error
        # 같은 키를 매 요청 다시 묻지 않는다. 토스 API 분당 한도를 아끼기 위해서다.
        return CachingAnonKeyVerifier(
            TossAnonKeyVerifier(client),
            ttl_seconds=settings.verify_cache_ttl_seconds,
            limiter=FailureLimiter(enforce=settings.failure_guard == "enforce"),
        )

    if settings.requires_verification:
        raise AnonKeyVerifierMisconfigured(
            "local 이 아닌 환경에는 mTLS 클라이언트 인증서가 있어야 한다. docs/SECRETS.md 참고."
        )

    if not settings.allow_unverified_anon_key:
        raise AnonKeyVerifierMisconfigured(
            "인증서가 없다. 로컬에서 계속하려면 ALLOW_UNVERIFIED_ANON_KEY=true 로 둔다."
        )

    return TrustingAnonKeyVerifier()
