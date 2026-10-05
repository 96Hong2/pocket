"""자산 엔드포인트.

한 번도 적지 않은 것은 정상 상태다. 조회는 404 가 아니라 200 에 `snapshot: null` 로 답한다.
저장은 PUT 하나뿐이고 목록을 통째로 받는다. 항목 단위 경로를 두지 않는 이유는 화면이
목록을 들고 있기 때문이다. 줄마다 PATCH·DELETE 를 열면 화면의 목록과 서버의 목록이
서로 다른 순서로 달라져, 무엇이 정본인지 알 수 없게 된다.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, Query
from sqlalchemy.orm import Session

from app.api.amounts import ratio_out
from app.api.deps import CurrentUser, DbSession, LlmClient
from app.api.errors import ERROR_RESPONSES, ApiError, ErrorCode
from app.api.images import decode_data_url
from app.domain.asset_analysis import AnalysisScope
from app.domain.money import Money
from app.models import User
from app.models.asset import AssetSnapshot
from app.modules import ledger
from app.modules.assets import (
    analysis as analysis_service,
    capture as capture_service,
    entries,
    service,
)
from app.modules.assets.schemas import (
    AnalysisBundleOut,
    AnalysisGoalOut,
    AnalysisGroupChangeOut,
    AnalysisGroupSliceOut,
    AnalysisItemSliceOut,
    AnalysisMonthChangeOut,
    AnalysisReturnRowOut,
    AnalysisReturnsOut,
    AnalysisSavingOut,
    AnalysisSummaryOut,
    AssetAnalysisOut,
    AssetCaptureIn,
    AssetCaptureItemOut,
    AssetCaptureMetaOut,
    AssetCaptureOut,
    AssetCheckinIn,
    AssetHistoryOut,
    AssetHistoryPointOut,
    AssetSnapshotPut,
    AssetsOut,
    to_assets_out,
)

router = APIRouter(prefix="/assets", tags=["assets"], responses=ERROR_RESPONSES)

# 추이를 그릴 수 있는 가장 긴 기간. 한 해 하고 반이면 상세 그래프에 넉넉하다.
MAX_HISTORY_MONTHS = 24


def _view(session: Session, user: User, snapshot: AssetSnapshot | None) -> AssetsOut:
    """조회와 저장이 같은 자리에서 응답을 만든다. 따로 조립하면 필드가 늘 때 한쪽만 빠진다."""
    summary, group_totals = service.summarize(service.live_items(snapshot))
    today = ledger.today_for(user)
    return to_assets_out(
        snapshot_id=snapshot.id if snapshot is not None else None,
        effective_on=snapshot.effective_on if snapshot is not None else None,
        source=snapshot.source if snapshot is not None else None,
        items=service.item_values(session, user, snapshot),
        summary=summary,
        group_totals=group_totals,
        month_saved=entries.month_saved(session, user, ledger.period_for(user, today)),
    )


@router.get("", response_model=AssetsOut)
def show(session: DbSession, user: CurrentUser) -> AssetsOut:
    return _view(session, user, service.latest_snapshot(session, user))


@router.put("", response_model=AssetsOut)
def replace(body: AssetSnapshotPut, session: DbSession, user: CurrentUser) -> AssetsOut:
    """보낸 목록이 오늘 스냅샷이 된다. 같은 목록을 두 번 보내도 결과가 같다."""
    today = ledger.today_for(user)
    snapshot = service.replace_items(session, user, today, body.items, source=body.source)
    return _view(session, user, snapshot)


@router.get("/history", response_model=AssetHistoryOut)
def history(
    session: DbSession,
    user: CurrentUser,
    months: int = Query(default=6, ge=1, le=MAX_HISTORY_MONTHS),
) -> AssetHistoryOut:
    """달마다 월말 순자산 점. 이번 달 점은 오늘까지의 가장 늦은 스냅샷이다.

    달은 한 달 시작일로 자른 기간이고 `month` 는 그 이름 달이다. 시작일 1 이면 달력 월이다.
    """
    points = service.month_end_points(session, user, ledger.today_for(user), months)
    return AssetHistoryOut(
        points=[
            AssetHistoryPointOut(
                month=point.month.key,
                effective_on=point.effective_on,
                total_assets=point.summary.total_assets.amount,
                total_liabilities=point.summary.total_liabilities.amount,
                net_worth=point.summary.net_worth.amount,
            )
            for point in points
        ]
    )


@router.post("/checkin", response_model=AssetsOut)
def checkin(body: AssetCheckinIn, session: DbSession, user: CurrentUser) -> AssetsOut:
    """「그대로예요」. 최신 목록을 오늘로 복사한다. 오늘 것이 이미 있으면 그대로 200."""
    today = ledger.today_for(user)
    if body.month != today.strftime("%Y-%m"):
        raise ApiError(ErrorCode.INVALID_REQUEST, "이번 달 자산만 적을 수 있어요.", 422)
    snapshot = service.checkin(session, user, today)
    return _view(session, user, snapshot)


@router.get("/analysis", response_model=AssetAnalysisOut)
def analysis(
    session: DbSession,
    user: CurrentUser,
    scope: AnalysisScope = AnalysisScope.ALL,
) -> AssetAnalysisOut:
    """「내 자산 분석」. 아무것도 저장하지 않는다. 광고 잠금은 화면이 지문으로 건다."""
    return _analysis_out(analysis_service.build(session, user, scope))


def _uuid(key: str) -> uuid.UUID | None:
    return uuid.UUID(key) if key else None


def _won(value: Money | None) -> Decimal | None:
    return value.amount if value is not None else None


def _analysis_out(view: analysis_service.AnalysisView) -> AssetAnalysisOut:
    """셈은 도메인이 끝냈다. 응답 모양으로 옮기기만 한다."""
    result = view.analysis
    returns = result.returns
    change = result.month_change
    saving = result.saving
    goal = view.goal
    return AssetAnalysisOut(
        scope=result.scope,
        fingerprint=result.fingerprint,
        total=result.total.amount,
        summary=(
            None
            if result.summary is None or result.total_without_pension is None
            else AnalysisSummaryOut(
                total_assets=result.summary.total_assets.amount,
                total_assets_without_pension=result.total_without_pension.amount,
                total_liabilities=result.summary.total_liabilities.amount,
                net_worth=result.summary.net_worth.amount,
            )
        ),
        groups=[
            AnalysisGroupSliceOut(
                group=row.group,
                amount=row.amount.amount,
                ratio=row.ratio,
                ratio_without_pension=row.ratio_without_pension,
            )
            for row in result.groups
        ],
        items=[
            AnalysisItemSliceOut(
                item_key=_uuid(row.key),
                group=row.group,
                kind=row.kind,
                label=row.label,
                amount=row.amount.amount,
                ratio=row.ratio,
                monthly_amount=_won(row.monthly_amount),
            )
            for row in result.items
        ],
        returns=(
            None
            if returns is None
            else AnalysisReturnsOut(
                rows=[
                    AnalysisReturnRowOut(
                        item_key=_uuid(row.key),
                        kind=row.kind,
                        label=row.label,
                        value=row.value.amount,
                        cost_basis=_won(row.cost_basis),
                        gain=_won(row.gain),
                        rate=row.rate,
                        realized=_won(row.realized),
                        realized_rate=row.realized_rate,
                    )
                    for row in returns.rows
                ],
                cost=returns.cost.amount,
                value=returns.value.amount,
                gain=returns.gain.amount,
                rate=returns.rate,
                realized=returns.realized.amount,
                realized_rate=returns.realized_rate,
            )
        ),
        month_change=(
            None
            if change is None or view.previous_month is None or view.previous_effective_on is None
            else AnalysisMonthChangeOut(
                previous_month=view.previous_month,
                previous_effective_on=view.previous_effective_on,
                net_worth=change.net_worth.amount,
                previous_net_worth=change.previous_net_worth.amount,
                delta=change.delta.amount,
                groups=[
                    AnalysisGroupChangeOut(
                        group=row.group,
                        current=row.current.amount,
                        previous=row.previous.amount,
                        delta=row.delta.amount,
                    )
                    for row in change.groups
                ],
            )
        ),
        saving=(
            None
            if saving is None
            else AnalysisSavingOut(
                saved=saving.saved.amount,
                income=saving.income.amount,
                rate=saving.rate,
                goal=(
                    None
                    if goal is None
                    else AnalysisGoalOut(
                        id=goal.goal.id,
                        title=goal.goal.title,
                        target_amount=goal.goal.target_amount,
                        current_amount=goal.current_amount.amount,
                        remaining=goal.evaluation.remaining.amount,
                        progress=ratio_out(goal.evaluation.progress) or Decimal(0),
                    )
                ),
            )
        ),
        bundles=[
            AnalysisBundleOut(scope=row.scope, item_count=row.count, fingerprint=row.fingerprint)
            for row in result.bundles
        ],
        monthly_total=_won(result.monthly_total),
    )


# ── 자산 캡처 ────────────────────────────────────────────


@router.post("/capture", response_model=AssetCaptureOut)
def capture(
    body: AssetCaptureIn, session: DbSession, user: CurrentUser, client: LlmClient
) -> AssetCaptureOut:
    """잔액 화면 한 장을 읽어 후보 목록을 준다. 아무것도 저장하지 않는다."""
    # async 로 바꾸지 않는다. anyio.from_thread.run 이 워커 스레드를 전제한다.
    rows = capture_service.read_capture(
        session, user, image=decode_data_url(body.image), client=client
    )
    return AssetCaptureOut(
        items=[
            AssetCaptureItemOut(
                name=row.name,
                amount=row.amount.amount,
                group=row.group,
                item_key=row.item_key,
                current_amount=(
                    row.current_amount.amount if row.current_amount is not None else None
                ),
            )
            for row in rows
        ],
        meta=AssetCaptureMetaOut(
            provider=client.provider,
            is_stub=client.is_stub,
            # 스텁은 그림을 안 읽고 예시를 낸다. 실제 인식으로 보이지 않게 표시한다.
            notes=["stub_image"] if client.is_stub else [],
        ),
    )
