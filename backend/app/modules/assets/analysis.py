"""「내 자산 분석」 재료 모으기. 셈은 `app.domain.asset_analysis` 가 한다.

서버는 아무것도 저장하지 않는다. 광고 뒤 본 지문은 화면이 기기에 둔다.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, replace
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.domain.asset_analysis import (
    Analysis,
    AnalysisItem,
    AnalysisScope,
    SavedSlice,
    build_analysis,
    saved_slices,
)
from app.domain.money import Money
from app.domain.period import BudgetPeriod
from app.models import Transaction, User
from app.models.asset import AssetItem as AssetItemRow
from app.modules import ledger
from app.modules.assets import entries, service
from app.modules.goals import service as goals

__all__ = ["SAVED_TREND_MONTHS", "TOP_SAVES", "AnalysisView", "SavedItem", "build"]

# 「달마다 모은 돈」 막대 수. 리포트 「6개월 흐름」 과 같다.
SAVED_TREND_MONTHS = 6
# 「큰 저축·투자」 줄 수. 화면이 자를 수 없게 서버가 정한다.
TOP_SAVES = 5


@dataclass(frozen=True)
class SavedItem:
    """이번 달 모은 돈의 「어디에」 한 항목. row 는 그 키의 가장 최근 항목 줄이다.

    같은 날 목록에서 지운 항목은 줄이 남지 않아 None 이다. 그 돈도 모은 돈이라 빼지 않는다.
    """

    slice: SavedSlice
    row: AssetItemRow | None


@dataclass(frozen=True)
class AnalysisView:
    analysis: Analysis
    # 진행 중 목표 한 줄. 전체 분석에서만, 없으면 None.
    goal: goals.GoalView | None
    # 지난달 대비가 견준 점. 전체 분석에서만.
    previous_month: str | None
    previous_effective_on: date | None
    # 아래 셋도 전체 분석에서만. 판 기록은 모은 돈이 아니라 빠진다.
    saved_items: tuple[SavedItem, ...] = ()
    # 오래된 달부터 (기간, 모은 돈).
    saved_trend: tuple[tuple[BudgetPeriod, Money], ...] = ()
    large_saves: tuple[Transaction, ...] = ()


def _money(value: Decimal | None) -> Money | None:
    return Money(value) if value is not None else None


def _item(row: AssetItemRow, figure: entries.ItemFigures | None) -> AnalysisItem:
    """항목 줄과 장부 셈을 분석 재료로. 장부가 있으면 수량, 넣은 돈, 판 기록은 접은 값이다."""
    item = AnalysisItem(
        key=str(row.item_key or ""),
        group=row.group,
        kind=row.kind,
        label=row.label,
        value=Money(row.amount),
        quantity=row.quantity,
        cost_basis=_money(row.cost_basis),
        unit_price=_money(row.unit_price),
        monthly_amount=_money(row.monthly_amount),
        price_noted=row.price_noted_on is not None,
    )
    if figure is None:
        return item
    state = figure.state
    return replace(
        item,
        quantity=state.quantity,
        cost_basis=state.cost_basis,
        realized=state.realized,
        sold_cost=state.sold_cost,
        received=Money.total(outcome.received for outcome in figure.sells.values()),
        sell_count=state.sell_count,
    )


def build(session: Session, user: User, scope: AnalysisScope) -> AnalysisView:
    rows = entries.live_rows(entries.latest_snapshot(session, user))
    figures = entries.item_figures(session, user, rows)
    items = [
        _item(row, figures.get(row.item_key) if row.item_key is not None else None) for row in rows
    ]
    if scope is not AnalysisScope.ALL:
        return AnalysisView(
            analysis=build_analysis(scope, items),
            goal=None,
            previous_month=None,
            previous_effective_on=None,
        )

    today = ledger.today_for(user)
    period = ledger.period_for(user, today)
    # 두 달 점을 받으면 앞이 지난달이다. 첫 스냅샷이 이번 달이면 점이 하나뿐이다.
    points = service.month_end_points(session, user, today, 2)
    previous = points[0] if len(points) == 2 else None
    goal = goals.active_goal(session, user)
    months = [period]
    for _ in range(SAVED_TREND_MONTHS - 1):
        months.append(months[-1].previous_period())
    months.reverse()
    by_item = entries.saved_by_item(session, user, period)
    heads = entries.item_heads(session, user, (key for key, _ in by_item), rows)
    return AnalysisView(
        analysis=build_analysis(
            scope,
            items,
            previous_groups=previous.groups if previous is not None else None,
            saved=entries.month_saved(session, user, period),
            income=ledger.load_period_totals(session, user, period).month_income,
        ),
        goal=goals.evaluate(goal, today) if goal is not None else None,
        previous_month=previous.month.start.strftime("%Y-%m") if previous is not None else None,
        previous_effective_on=previous.effective_on if previous is not None else None,
        saved_items=tuple(
            SavedItem(slice=row, row=heads.get(uuid.UUID(row.key)))
            for row in saved_slices([(str(key), amount) for key, amount in by_item])
        ),
        saved_trend=tuple(zip(months, entries.saved_by_period(session, user, months), strict=True)),
        large_saves=tuple(entries.largest_saves(session, user, period, TOP_SAVES)),
    )
