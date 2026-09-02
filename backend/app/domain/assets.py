"""자산 스냅샷 합계. 순자산은 남은 예산·차액과 절대 섞지 않는다."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum

from app.domain.money import Money

__all__ = ["AssetGroup", "AssetItem", "AssetSummary", "summarize_assets"]


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
