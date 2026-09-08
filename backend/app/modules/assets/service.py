"""자산 스냅샷 조회·저장.

**하루에 스냅샷 하나다.** 같은 날 다시 저장하면 그 날 스냅샷의 항목을 통째로 갈아 끼우고,
날이 바뀌면 새 스냅샷을 만든다. 저장할 때마다 새로 쌓으면 하루에 세 번 고친 사람의
순자산 추이가 같은 날에 세 점이 되어, 나중에 추이를 그릴 때 날짜별 값이 정해지지 않는다.

합계는 `app.domain.assets` 가 낸다. 여기서 자산에서 부채를 빼는 산식을 다시 쓰지 않는다.

`AssetItem` 이 도메인 값 객체와 ORM 모델 둘 다에 있어, 이 파일에서는 ORM 쪽을
`AssetItemRow` 로 별칭해 둔다. 같은 이름 두 개를 한 파일에서 쓰면 어느 쪽인지 읽히지 않는다.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.domain import assets as domain
from app.domain.money import Money
from app.models import User
from app.models.asset import AssetItem as AssetItemRow, AssetSnapshot, AssetSource
from app.modules.assets.schemas import AssetItemIn

__all__ = ["ItemView", "latest_snapshot", "live_items", "replace_items", "summarize"]

# 화면이 쓰는 항목 한 줄. (그룹, 이름, 금액) 세 값이고 ORM 행을 화면까지 끌고 가지 않는다.
ItemView = tuple[domain.AssetGroup, str | None, Money]


def latest_snapshot(session: Session, user: User) -> AssetSnapshot | None:
    """가장 최근 스냅샷 한 건. 없으면 None 이고 그것이 정상 상태다.

    기준일이 같은 것이 둘 있으면 나중에 만든 것을 쓴다. 하루 하나 규칙을 서비스가 지키지만,
    동시에 두 요청이 들어와 둘 다 만들었을 때 조회가 늘 같은 답을 주게 순서를 못 박는다.
    """
    return session.scalar(
        select(AssetSnapshot)
        .where(AssetSnapshot.user_id == user.id, AssetSnapshot.deleted_at.is_(None))
        .order_by(AssetSnapshot.effective_on.desc(), AssetSnapshot.created_at.desc())
        .options(selectinload(AssetSnapshot.items))
        .limit(1)
    )


def live_items(snapshot: AssetSnapshot | None) -> list[ItemView]:
    """그 스냅샷의 살아 있는 항목. 놓인 순서 그대로다."""
    if snapshot is None:
        return []
    rows = [row for row in snapshot.items if row.deleted_at is None]
    rows.sort(key=lambda row: row.sort_order)
    return [(row.group, row.label, Money(row.amount)) for row in rows]


def summarize(
    items: Sequence[ItemView],
) -> tuple[domain.AssetSummary, dict[domain.AssetGroup, Money]]:
    """순자산과 그룹 소계. 둘 다 같은 목록에서 나온다."""
    values = [domain.AssetItem(group=group, amount=amount) for group, _, amount in items]
    return domain.summarize_assets(values), domain.total_by_group(values)


def replace_items(
    session: Session, user: User, today: date, items: Sequence[AssetItemIn]
) -> AssetSnapshot:
    """오늘 스냅샷의 항목을 보낸 목록으로 갈아 끼운다. 없으면 오늘 스냅샷을 만든다.

    항목은 지운 표시를 남기지 않고 통째로 비운다. 스냅샷의 항목은 '그때 적어 둔 목록'
    자체라서, 고칠 때마다 옛 줄을 남기면 한 스냅샷이 여러 목록을 들고 있게 된다.
    무엇을 적었는지는 날짜별 스냅샷이 남기고, 그 안의 중간 편집 이력은 남기지 않는다.
    """
    snapshot = _today_snapshot(session, user, today)
    if snapshot is None:
        snapshot = AssetSnapshot(user_id=user.id, effective_on=today, source=AssetSource.MANUAL)
        session.add(snapshot)

    # delete-orphan 이 걸려 있어 목록에서 빠진 행은 그대로 사라진다.
    snapshot.items = [
        AssetItemRow(
            group=item.group,
            label=item.label,
            amount=item.amount,
            # 직접 입력이라 신뢰도는 1.0 이다. 캡처 인식값이 들어올 자리가 따로 있다.
            confidence=1.0,
            sort_order=index,
        )
        for index, item in enumerate(items)
    ]
    session.commit()
    session.refresh(snapshot)
    return snapshot


def _today_snapshot(session: Session, user: User, today: date) -> AssetSnapshot | None:
    return session.scalar(
        select(AssetSnapshot)
        .where(
            AssetSnapshot.user_id == user.id,
            AssetSnapshot.effective_on == today,
            AssetSnapshot.deleted_at.is_(None),
        )
        .order_by(AssetSnapshot.created_at.desc())
        .options(selectinload(AssetSnapshot.items))
        .limit(1)
    )
