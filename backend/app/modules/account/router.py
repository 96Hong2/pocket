"""내 계정. 데이터 초기화, 이메일 연결, 연령대·성별."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import AppSettings, CurrentIdentity, CurrentUser, DbSession, anon_key_hash
from app.api.errors import ERROR_RESPONSES, ApiError, ErrorCode
from app.integrations.email.factory import get_email_sender
from app.integrations.email.port import EmailSender
from app.modules.account import login, service
from app.modules.account.schemas import (
    EmailStartIn,
    EmailVerifyIn,
    EmailVerifyOut,
    LoginCodePeekOut,
    MeOut,
    ProfilePatch,
    ResetIn,
)

router = APIRouter(prefix="/account", tags=["account"], responses=ERROR_RESPONSES)

EmailSenderDep = Annotated[EmailSender, Depends(get_email_sender)]


@router.get("/me", response_model=MeOut)
def me(user: CurrentUser, settings: AppSettings) -> MeOut:
    """내 계정. 연결 전에는 email 이 null 이고 그것이 정상이다."""
    return login.me_view(user, settings)


@router.post("/email/start", status_code=status.HTTP_204_NO_CONTENT)
def email_start(
    body: EmailStartIn,
    session: DbSession,
    settings: AppSettings,
    sender: EmailSenderDep,
    user: CurrentUser,
) -> Response:
    """여섯 자리 코드를 메일로 보낸다. 보낼 수단이 없으면 503.

    익명키 검증을 지난 사람만 부를 수 있다. 안 그러면 주소를 아는 누구나 아무 메일함에나
    코드를 쏠 수 있다. 한 이메일 상한(10분 3통)은 메일함 하나를 지키지 여러 메일함은 못 지킨다.
    """
    del user  # 검증을 지났다는 사실만 쓴다.
    login.start_email_login(session, settings, sender, body.email)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/email/verify", response_model=EmailVerifyOut)
def email_verify(
    body: EmailVerifyIn,
    session: DbSession,
    settings: AppSettings,
    user: CurrentUser,
    identity: CurrentIdentity,
) -> EmailVerifyOut:
    """코드를 확인하고 이 기기를 그 이메일의 사람에게 붙인다."""
    return login.verify_email_login(
        session, settings, user, anon_key_hash(identity.anon_key), body.email, body.code
    )


@router.get("/email/peek", response_model=LoginCodePeekOut)
def email_peek(
    email: Annotated[str, Query()], settings: AppSettings, sender: EmailSenderDep
) -> LoginCodePeekOut:
    """로컬 전용. 스텁이 보낸 코드를 읽는다. 그 밖에서는 404 라 있는지도 모른다."""
    if settings.environment != "local" or settings.smtp_host:
        raise ApiError(ErrorCode.NOT_FOUND, "찾을 수 없어요.", status_code=404)
    code = login.peek_code(sender, email)
    if code is None:
        raise ApiError(ErrorCode.NOT_FOUND, "보낸 코드가 없어요.", status_code=404)
    return LoginCodePeekOut(code=code)


@router.patch("/profile", response_model=MeOut)
def profile(
    body: ProfilePatch, session: DbSession, settings: AppSettings, user: CurrentUser
) -> MeOut:
    """연령대·성별. 빈 본문을 보내면 건너뛴 것으로 남는다."""
    return login.update_profile(
        session,
        settings,
        user,
        age_band=body.age_band,
        gender=body.gender,
        fields_set=set(body.model_fields_set),
    )


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset(body: ResetIn, session: DbSession, user: CurrentUser) -> Response:
    """넣어 둔 것을 전부 지운다. 되돌릴 수 없다. 이메일 연결은 남는다."""
    del body  # 값은 Literal[True] 하나뿐이라 검증이 곧 뜻이다.
    service.reset_data(session, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
