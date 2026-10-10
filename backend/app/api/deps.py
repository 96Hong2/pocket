"""요청마다 쓰는 의존성.

로그인 화면이 없으므로 인증 경로는 X-Anon-Key 헤더 하나뿐이다.
헤더의 익명 식별키를 검증한 뒤 사용자를 찾거나 만든다.
"""

from __future__ import annotations

import hashlib
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.errors import ApiError, ErrorCode
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.integrations.apps_in_toss.anon_key import (
    AnonKeyVerifier,
    AnonKeyVerifierSettings,
    VerifiedIdentity,
    create_anon_key_verifier,
)
from app.integrations.llm import LlmStructuredClient, get_escalation_client, get_llm_client
from app.models import User, UserDevice, UserPreference

__all__ = [
    "AppSettings",
    "CurrentIdentity",
    "CurrentUser",
    "DbSession",
    "EscalationLlmClient",
    "LlmClient",
    "anon_key_hash",
    "client_ip",
    "get_current_user",
    "get_verifier",
]

DbSession = Annotated[Session, Depends(get_session)]
AppSettings = Annotated[Settings, Depends(get_settings)]
# 파싱 클라이언트. 테스트가 갈아끼울 수 있게 의존성으로 받는다.
LlmClient = Annotated[LlmStructuredClient, Depends(get_llm_client)]
# 1차가 서버 검증에 걸렸을 때만 부르는 모델. 안 쓰기로 했으면 None 이다.
EscalationLlmClient = Annotated[LlmStructuredClient | None, Depends(get_escalation_client)]


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


def anon_key_hash(anon_key: str) -> str:
    """식별키 원문을 저장하지 않고 해시만 남긴다."""
    return hashlib.sha256(anon_key.encode("utf-8")).hexdigest()


_hash = anon_key_hash


def client_ip(request: Request) -> str | None:
    """요청을 보낸 곳의 IP. 틀린 익명키를 곳마다 세는 데만 쓴다.

    **X-Forwarded-For 의 마지막 값을 쓴다.** 앞쪽 값은 보내는 쪽이 마음대로 적을 수 있고,
    Cloud Run 앞단(Google Front End)은 실제로 연결해 온 주소를 맨 뒤에 덧붙인다.
    uvicorn `--proxy-headers --forwarded-allow-ips='*'` 는 첫 값을 `request.client` 로 바꿔
    두므로 그 값은 믿지 않는다. 그 값으로 세면 요청마다 다른 IP 를 적어 보내 상한을 피한다.
    앞에 외부 HTTPS 부하분산기를 두면 그 주소가 맨 뒤에 하나 더 붙으므로 끝에서 두 번째를 봐야 한다.
    """
    hops = [
        hop.strip()
        for value in request.headers.getlist("x-forwarded-for")
        for hop in value.split(",")
        if hop.strip()
    ]
    if hops:
        return hops[-1]
    return request.client.host if request.client is not None else None


async def get_verified_identity(
    request: Request,
    verifier: Annotated[AnonKeyVerifier, Depends(get_verifier)],
    x_anon_key: Annotated[str | None, Header(alias="X-Anon-Key")] = None,
) -> VerifiedIdentity:
    """검증은 외부 호출이라 async 로 둔다. DB 는 아래 동기 의존성이 맡는다."""
    if not x_anon_key:
        raise ApiError(ErrorCode.UNAUTHORIZED, "사용자 정보를 확인하지 못했어요.", status_code=401)
    return await verifier.verify(x_anon_key, client=client_ip(request))


def get_current_user(
    session: DbSession,
    identity: Annotated[VerifiedIdentity, Depends(get_verified_identity)],
) -> User:
    key_hash = _hash(identity.anon_key)
    # 이메일로 확인해 다른 사람에게 이어 둔 기기가 먼저다. 그 줄이 있으면 그 사람이다.
    linked = session.scalar(
        select(User)
        .join(UserDevice, UserDevice.user_id == User.id)
        .where(UserDevice.anon_key_hash == key_hash, User.deleted_at.is_(None))
    )
    if linked is not None:
        return linked
    user = session.scalar(
        select(User).where(User.anon_key_hash == key_hash, User.deleted_at.is_(None))
    )
    if user is not None:
        return user

    # 첫 진입이다. 가입 절차 없이 여기서 계정이 생긴다.
    # 홈이 목록·요약을 동시에 부르므로 같은 키로 두 요청이 함께 들어온다.
    # 경쟁에서 진 쪽은 unique 위반이 나므로 되돌리고 이긴 쪽의 행을 쓴다.
    try:
        user = User(anon_key_hash=key_hash)
        session.add(user)
        session.flush()
        session.add(UserPreference(user_id=user.id))
        session.commit()
    except IntegrityError:
        session.rollback()
        # 경쟁에서 진 것이 아니라, 접힌 계정이 그 키를 쥐고 있을 수도 있다(이메일 합치기).
        # 그때 정답은 이어 둔 기기 줄이 가리키는 사람이다. 접힌 행을 그대로 돌려주면
        # 그 기기는 빈 가계부를 본다.
        user = session.scalar(
            select(User)
            .join(UserDevice, UserDevice.user_id == User.id)
            .where(UserDevice.anon_key_hash == key_hash, User.deleted_at.is_(None))
        )
        if user is None:
            user = session.scalar(
                select(User).where(User.anon_key_hash == key_hash, User.deleted_at.is_(None))
            )
        if user is None:
            raise
        return user
    session.refresh(user)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
# 검증을 통과한 익명키 원문. 알림을 켤 때 그 값을 보관해야 해서 라우터까지 내려간다.
CurrentIdentity = Annotated[VerifiedIdentity, Depends(get_verified_identity)]
