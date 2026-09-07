"""자산 엔드포인트.

한 번도 적지 않은 것은 정상 상태다. 조회는 404 가 아니라 200 에 `snapshot: null` 로 답한다.
저장은 PUT 하나뿐이고 목록을 통째로 받는다. 항목 단위 경로를 두지 않는 이유는 화면이
목록을 들고 있기 때문이다. 줄마다 PATCH·DELETE 를 열면 화면의 목록과 서버의 목록이
서로 다른 순서로 달라져, 무엇이 정본인지 알 수 없게 된다.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES
from app.models.asset import AssetSnapshot
from app.modules import ledger
from app.modules.assets import service
from app.modules.assets.schemas import AssetSnapshotPut, AssetsOut, to_assets_out

router = APIRouter(prefix="/assets", tags=["assets"], responses=ERROR_RESPONSES)


def _view(snapshot: AssetSnapshot | None) -> AssetsOut:
    """조회와 저장이 같은 자리에서 응답을 만든다. 따로 조립하면 필드가 늘 때 한쪽만 빠진다."""
    items = service.live_items(snapshot)
    summary, group_totals = service.summarize(items)
    return to_assets_out(
        snapshot_id=snapshot.id if snapshot is not None else None,
        effective_on=snapshot.effective_on if snapshot is not None else None,
        source=snapshot.source if snapshot is not None else None,
        items=items,
        summary=summary,
        group_totals=group_totals,
    )


@router.get("", response_model=AssetsOut)
def show(session: DbSession, user: CurrentUser) -> AssetsOut:
    return _view(service.latest_snapshot(session, user))


@router.put("", response_model=AssetsOut)
def replace(body: AssetSnapshotPut, session: DbSession, user: CurrentUser) -> AssetsOut:
    """보낸 목록이 오늘 스냅샷이 된다. 같은 목록을 두 번 보내도 결과가 같다."""
    today = ledger.today_for(user)
    return _view(service.replace_items(session, user, today, body.items))
