"""모델에게 보여 줄 자산 항목 이름과, 읽어 온 이름을 맞출 목록.

줄글·캡처·영수증의 저축·투자 줄과 자산 캡처가 같은 목록을 쓴다.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.domain.asset_ledger import Holding, holding_of
from app.domain.asset_names import NamedItem
from app.domain.redaction import redact
from app.integrations.llm import AssetHint
from app.models import User
from app.models.asset import AssetItem as AssetItemRow
from app.modules.assets import entries

__all__ = ["current_rows", "hints", "named", "quantity_keys"]


def current_rows(session: Session, user: User) -> list[AssetItemRow]:
    """최신 스냅샷의 살아 있는 항목. 키가 없는 옛 행은 맞출 수 없어 뺀다."""
    rows = entries.live_rows(entries.latest_snapshot(session, user))
    return [row for row in rows if row.item_key is not None]


def _monthly(row: AssetItemRow) -> bool:
    return row.monthly_amount is not None and row.monthly_amount > 0


def hints(rows: list[AssetItemRow]) -> list[AssetHint]:
    """이름이 있는 항목만. 사람이 이름에 계좌번호를 적었어도 모델에게는 가려서 보낸다."""
    return [AssetHint(redact(row.label).text, _monthly(row)) for row in rows if row.label]


def named(rows: list[AssetItemRow]) -> list[NamedItem]:
    return [
        NamedItem(key=row.item_key, label=row.label, monthly=_monthly(row))
        for row in rows
        if row.item_key is not None
    ]


def quantity_keys(rows: list[AssetItemRow]) -> set[uuid.UUID]:
    """수량으로 적는 종목(주식, ETF, 코인)의 키."""
    return {
        row.item_key
        for row in rows
        if row.item_key is not None and holding_of(row.group, row.kind) is Holding.QUANTITY
    }
