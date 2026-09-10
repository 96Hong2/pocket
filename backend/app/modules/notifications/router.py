"""알림 설정 엔드포인트.

설정 행이 없는 것은 정상이다. 조회가 기본값(꺼짐)으로 만들어 주므로 화면이 404 를 만나지 않는다.
토스 알림 동의는 앱 쪽(브릿지)에서 받는다. 서버는 동의 여부를 저장하지 않는다.
다만 켤 때는 익명키 원문을 함께 보관한다. 발송기가 토스에 누구인지 말할 값이 그것뿐이다.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentIdentity, CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES
from app.models import NotificationSetting
from app.modules.notifications import service
from app.modules.notifications.schemas import (
    NotificationSettingsOut,
    NotificationSettingsPatch,
    format_hhmm,
)

router = APIRouter(prefix="/notifications", tags=["notifications"], responses=ERROR_RESPONSES)


def _out(row: NotificationSetting) -> NotificationSettingsOut:
    """조회와 수정이 같은 자리에서 응답을 만든다. 따로 조립하면 필드가 늘 때 한쪽만 빠진다."""
    return NotificationSettingsOut(
        is_enabled=row.is_enabled,
        remind_at=format_hhmm(row.remind_at),
        frequency=row.frequency,
    )


@router.get("/settings", response_model=NotificationSettingsOut)
def show(
    session: DbSession, user: CurrentUser, identity: CurrentIdentity
) -> NotificationSettingsOut:
    row = service.get_notification_settings(session, user)
    # 이 컬럼이 생기기 전에 켜 둔 사람은 값이 비어 있다. 화면을 여는 것만으로 채워진다.
    service.refresh_push_key(session, row, identity.anon_key)
    return _out(row)


@router.patch("/settings", response_model=NotificationSettingsOut)
def update(
    body: NotificationSettingsPatch,
    session: DbSession,
    user: CurrentUser,
    identity: CurrentIdentity,
) -> NotificationSettingsOut:
    return _out(
        service.update_notification_settings(
            session,
            user,
            body.model_dump(exclude_unset=True),
            anon_key=identity.anon_key,
        )
    )
