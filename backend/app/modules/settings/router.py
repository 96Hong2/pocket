"""설정 엔드포인트."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES
from app.models import UserPreference
from app.modules.settings import service
from app.modules.settings.schemas import PreferencesOut, PreferencesPatch

router = APIRouter(prefix="/preferences", tags=["settings"], responses=ERROR_RESPONSES)


def _out(row: UserPreference) -> PreferencesOut:
    """조회와 수정이 같은 자리에서 응답을 만든다. 따로 조립하면 필드가 늘 때 한쪽만 빠진다."""
    return PreferencesOut(
        budget_auto_carryover=row.budget_auto_carryover,
        home_hero=row.home_hero,
    )


@router.get("", response_model=PreferencesOut)
def show(session: DbSession, user: CurrentUser) -> PreferencesOut:
    return _out(service.get_preferences(session, user))


@router.patch("", response_model=PreferencesOut)
def update(body: PreferencesPatch, session: DbSession, user: CurrentUser) -> PreferencesOut:
    return _out(service.update_preferences(session, user, body.model_dump(exclude_unset=True)))
