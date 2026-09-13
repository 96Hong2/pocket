"""내 데이터 초기화."""

from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES
from app.modules.account import service
from app.modules.account.schemas import ResetIn

router = APIRouter(prefix="/account", tags=["account"], responses=ERROR_RESPONSES)


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset(body: ResetIn, session: DbSession, user: CurrentUser) -> Response:
    """넣어 둔 것을 전부 지운다. 되돌릴 수 없다."""
    del body  # 값은 Literal[True] 하나뿐이라 검증이 곧 뜻이다.
    service.reset_data(session, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
