"""계정 합치기의 자산 몫.

스냅샷과 장부는 user_id 만 옮긴다. item_key 는 uuid 라 두 계정 사이에 안 겹치고, 장부와 거래가
같은 키로 이어진다. 두 쪽 다 자산을 적었으면 최신 목록 둘을 target 의 오늘 스냅샷 하나로 묶는다.
안 묶으면 더 늦은 한쪽만 최신으로 보여 다른 쪽 항목이 사라진 것처럼 된다.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import User
from app.models.asset import AssetEntry, AssetSnapshot, AssetSource
from app.modules import ledger
from app.modules.assets.entries import copy_row, latest_snapshot, live_rows, snapshot_on

__all__ = ["absorb_assets"]


def absorb_assets(session: Session, *, source: User, target: User) -> None:
    """source 의 자산을 target 으로 옮긴다. commit 은 부르는 쪽이 한다.

    오늘 스냅샷이 양쪽에 있으면 target 것을 남기고 source 것은 접는다(하루 하나).
    항목 순서는 target 목록 뒤에 source 목록이다.
    """
    target_latest = latest_snapshot(session, target)
    source_latest = latest_snapshot(session, source)
    today = ledger.today_for(target)
    target_today = snapshot_on(session, target, today)
    source_today = snapshot_on(session, source, today)
    rows = [*live_rows(target_latest), *live_rows(source_latest)]

    for model in (AssetSnapshot, AssetEntry):
        session.execute(update(model).where(model.user_id == source.id).values(user_id=target.id))
    if target_latest is None or source_latest is None:
        session.flush()
        return

    keep = target_today or source_today
    if keep is None:
        keep = AssetSnapshot(user_id=target.id, effective_on=today, source=AssetSource.MANUAL)
        session.add(keep)
    # 남기는 스냅샷의 행은 그대로 쓴다. 같은 키 사본을 넣으면 (snapshot_id, item_key) 가 겹친다.
    merged = []
    for index, row in enumerate(rows):
        if keep.id is not None and row.snapshot_id == keep.id:
            row.sort_order = index
            merged.append(row)
        else:
            merged.append(copy_row(row, index))
    if source_today is not None and source_today is not keep:
        now = datetime.now(UTC)
        source_today.deleted_at = now
        for row in source_today.items:
            row.deleted_at = now
    keep.items = merged
    session.flush()
