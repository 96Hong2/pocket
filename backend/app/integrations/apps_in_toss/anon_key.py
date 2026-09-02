"""익명 식별키 검증.

로그인 화면이 없으므로 사용자는 토스 익명키 하나로만 식별된다.
클라이언트가 보낸 키를 그대로 믿지 않고 토스 서버에 확인한다.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
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


class AnonKeyVerificationUnavailable(Exception):
    """지금은 확인할 수 없다. 한도 초과·네트워크 오류 등, 다시 시도할 수 있다."""


class AnonKeyVerifierMisconfigured(RuntimeError):
    """검증기를 고를 수 없는 설정. 기동을 멈춘다."""


@dataclass(frozen=True, slots=True)
class VerifiedIdentity:
    """검증을 통과한 사용자 식별 정보."""

    anon_key: str
    verified_by: VerifierKind
    # 토스 응답 success payload. 형태가 공개 문서에 없어 그대로 담아 둔다.
    claims: dict[str, Any] | None = None

    @property
    def is_trusted_source(self) -> bool:
        return self.verified_by == "toss"


@runtime_checkable
class AnonKeyVerifier(Protocol):
    async def verify(self, anon_key: str) -> VerifiedIdentity: ...


class TossAnonKeyVerifier:
    """토스 서버에 mTLS 로 물어보는 실제 검증기."""

    def __init__(self, client: TossApiClient) -> None:
        self._client = client

    async def verify(self, anon_key: str) -> VerifiedIdentity:
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
                raise AnonKeyAuthError("익명키 인증 정보 없음") from error
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

    운영에서는 절대 선택되지 않는다. create_anon_key_verifier 가 막는다.
    """

    def __init__(self) -> None:
        logger.warning("익명키를 검증하지 않는 개발용 검증기를 쓴다. 운영에서 쓰면 안 된다.")

    async def verify(self, anon_key: str) -> VerifiedIdentity:
        if not anon_key:
            raise AnonKeyAuthError("익명키가 비어 있다")
        logger.warning("익명키를 검증 없이 통과시킨다 (개발용)")
        return VerifiedIdentity(anon_key=anon_key, verified_by="trusting")


@dataclass(frozen=True, slots=True)
class AnonKeyVerifierSettings:
    """검증기 선택에 필요한 값. app 기동부에서 채워 넣는다."""

    environment: str = "local"
    allow_unverified_anon_key: bool = False
    base_url: str = DEFAULT_BASE_URL
    client_cert_path: str | None = None
    client_key_path: str | None = None
    timeout_seconds: float = 5.0

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in {"prod", "production"}

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

    if settings.is_production and settings.allow_unverified_anon_key:
        raise AnonKeyVerifierMisconfigured(
            "운영에서는 익명키 검증을 끌 수 없다. ALLOW_UNVERIFIED_ANON_KEY 를 false 로 둔다."
        )

    if api_settings.has_client_certificate:
        try:
            client = TossApiClient(api_settings)
        except MisconfiguredTossApi as error:
            raise AnonKeyVerifierMisconfigured(str(error)) from error
        return TossAnonKeyVerifier(client)

    if settings.is_production:
        raise AnonKeyVerifierMisconfigured(
            "운영에는 mTLS 클라이언트 인증서가 있어야 한다. docs/SECRETS.md 참고."
        )

    if not settings.allow_unverified_anon_key:
        raise AnonKeyVerifierMisconfigured(
            "인증서가 없다. 로컬에서 계속하려면 ALLOW_UNVERIFIED_ANON_KEY=true 로 둔다."
        )

    return TrustingAnonKeyVerifier()
