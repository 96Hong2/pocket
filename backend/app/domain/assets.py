"""자산 스냅샷 합계. 순자산은 남은 예산·차액과 절대 섞지 않는다."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum

from app.domain.money import Money

__all__ = ["AssetGroup", "AssetItem", "AssetSummary", "summarize_assets", "total_by_group"]


class AssetGroup(StrEnum):
    CASH = "cash"
    INVESTMENT = "investment"
    DEPOSIT = "deposit"
    DEBT = "debt"


@dataclass(frozen=True)
class AssetItem:
    """금액은 부채도 양수로 담고 group 이 의미를 가른다."""

    group: AssetGroup
    amount: Money


@dataclass(frozen=True)
class AssetSummary:
    total_assets: Money
    total_liabilities: Money
    net_worth: Money


def summarize_assets(items: Iterable[AssetItem]) -> AssetSummary:
    assets = Money.zero()
    liabilities = Money.zero()
    for item in items:
        if item.group is AssetGroup.DEBT:
            liabilities = liabilities + item.amount
        else:
            assets = assets + item.amount
    return AssetSummary(
        total_assets=assets,
        total_liabilities=liabilities,
        net_worth=assets - liabilities,
    )


def total_by_group(items: Iterable[AssetItem]) -> dict[AssetGroup, Money]:
    """그룹별 소계. 항목이 없는 그룹도 0 으로 넣는다.

    화면이 줄 금액을 다시 더하지 않게 서버가 센다. 그렇게 두면 화면이 접어 둔 줄이나
    못 그린 줄을 빼고 더해, 소계와 순자산이 서로 다른 목록을 말하게 된다.
    """
    totals = dict.fromkeys(AssetGroup, Money.zero())
    for item in items:
        totals[item.group] = totals[item.group] + item.amount
    return totals
