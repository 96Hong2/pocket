"""설정 엔드포인트."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES
from app.modules.settings import service
from app.modules.settings.schemas import PreferencesOut, PreferencesPatch

router = APIRouter(prefix="/preferences", tags=["settings"], responses=ERROR_RESPONSES)


@router.get("", response_model=PreferencesOut)
def show(session: DbSession, user: CurrentUser) -> PreferencesOut:
    row = service.get_preferences(session, user)
    return PreferencesOut(budget_auto_carryover=row.budget_auto_carryover)


@router.patch("", response_model=PreferencesOut)
def update(body: PreferencesPatch, session: DbSession, user: CurrentUser) -> PreferencesOut:
    row = service.update_preferences(session, user, body.model_dump(exclude_unset=True))
    return PreferencesOut(budget_auto_carryover=row.budget_auto_carryover)
