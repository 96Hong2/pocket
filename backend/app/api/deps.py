"""요청마다 쓰는 의존성.

로그인 화면이 없으므로 인증 경로는 X-Anon-Key 헤더 하나뿐이다.
헤더의 익명 식별키를 검증한 뒤 사용자를 찾거나 만든다.
"""

from __future__ import annotations

import hashlib
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.integrations.apps_in_toss.anon_key import (
    AnonKeyVerifier,
    AnonKeyVerifierSettings,
    VerifiedIdentity,
    create_anon_key_verifier,
)
from app.models import User, UserPreference

__all__ = ["CurrentUser", "DbSession", "get_current_user", "get_verifier"]

DbSession = Annotated[Session, Depends(get_session)]
AppSettings = Annotated[Settings, Depends(get_settings)]


@lru_cache(maxsize=1)
def _verifier_for(
    environment: str,
    allow_unverified: bool,
    base_url: str,
    cert_path: str | None,
    key_path: str | None,
) -> AnonKeyVerifier:
    return create_anon_key_verifier(
        AnonKeyVerifierSettings(
            environment=environment,
            allow_unverified_anon_key=allow_unverified,
            base_url=base_url,
            client_cert_path=cert_path,
            client_key_path=key_path,
        )
    )


def get_verifier(settings: AppSettings) -> AnonKeyVerifier:
    return _verifier_for(
        settings.environment,
        settings.allow_unverified_anon_key,
        settings.toss_api_base_url,
        settings.toss_mtls_cert_path,
        settings.toss_mtls_key_path,
    )


def _hash(anon_key: str) -> str:
    """식별키 원문을 저장하지 않고 해시만 남긴다."""
    return hashlib.sha256(anon_key.encode("utf-8")).hexdigest()


async def get_verified_identity(
    verifier: Annotated[AnonKeyVerifier, Depends(get_verifier)],
    x_anon_key: Annotated[str | None, Header(alias="X-Anon-Key")] = None,
) -> VerifiedIdentity:
    """검증은 외부 호출이라 async 로 둔다. DB 는 아래 동기 의존성이 맡는다."""
    if not x_anon_key:
        raise ApiError("UNAUTHORIZED", "사용자 정보를 확인하지 못했어요.", status_code=401)
    return await verifier.verify(x_anon_key)


def get_current_user(
    session: DbSession,
    identity: Annotated[VerifiedIdentity, Depends(get_verified_identity)],
) -> User:
    key_hash = _hash(identity.anon_key)
    user = session.scalar(select(User).where(User.anon_key_hash == key_hash))
    if user is None:
        # 첫 진입이다. 가입 절차 없이 여기서 계정이 생긴다.
        user = User(anon_key_hash=key_hash)
        session.add(user)
        session.flush()
        session.add(UserPreference(user_id=user.id))
        session.commit()
        session.refresh(user)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
