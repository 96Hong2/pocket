"""자산 캡처: 은행·증권 앱의 잔액 화면 한 장을 읽어 후보 목록을 돌려준다.

검토 단위(ImportBatch)를 만들지 않는다. 저장은 화면이 PUT /assets(source=screenshot)로 한다.
이미지와 모델 원문은 어디에도 남기지 않는다. 하루 상한과 사용량 표는 줄글·캡처와 나눠 쓴다.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from decimal import Decimal
from functools import partial

import anyio.from_thread
from sqlalchemy.orm import Session

from app.api.amounts import MAX_AMOUNT
from app.api.errors import ApiError, ErrorCode
from app.domain.aggregation import TransactionSource
from app.domain.asset_names import NamedItem, match_item
from app.domain.assets import AssetGroup
from app.domain.money import Money
from app.domain.redaction import redact
from app.integrations.imaging import prepare_image
from app.integrations.llm import (
    AssetExtraction,
    LlmError,
    LlmImage,
    LlmStructuredClient,
    asset_capture_prompt,
)
from app.models import AssetItem, User
from app.modules import ledger
from app.modules.assets import names as asset_names
from app.modules.imports import service as imports

logger = logging.getLogger(__name__)

__all__ = ["CaptureRow", "read_capture"]

_SOURCE = TransactionSource.ASSET_SCREENSHOT


@dataclass(frozen=True, slots=True)
class CaptureRow:
    """후보 한 줄. 기존 항목에 맞으면 그 키와 지금 금액이 붙는다."""

    name: str
    amount: Money
    group: AssetGroup
    item_key: uuid.UUID | None = None
    current_amount: Money | None = None


def read_capture(
    session: Session, user: User, *, image: LlmImage, client: LlmStructuredClient
) -> list[CaptureRow]:
    """잔액 화면 한 장을 읽는다. 잔액이 없는 그림이면 빈 목록이다."""
    day = ledger.today_for(user)
    imports.require_quota(session, user, day, label="자산 캡처 분석")
    sent = prepare_image(image)
    rows = asset_names.current_rows(session, user)
    call = partial(
        client.extract,
        prompt=asset_capture_prompt(asset_names.hints(rows)),
        schema=AssetExtraction,
        image=sent,
        today=day,
    )
    try:
        extraction = anyio.from_thread.run(call)
    except LlmError as exc:
        _record(session, user, client, len(sent.data), found=0, failed=True)
        raise ApiError(
            ErrorCode.PARSE_UNAVAILABLE,
            "지금은 캡처를 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.",
            status_code=503,
        ) from exc
    found = _candidates(extraction, rows)
    _record(session, user, client, len(sent.data), found=len(found), failed=False)
    if not found:
        logger.info("자산 캡처에서 잔액을 찾지 못했다")
    return found


def _record(
    session: Session,
    user: User,
    client: LlmStructuredClient,
    size: int,
    *,
    found: int,
    failed: bool,
) -> None:
    imports.record_usage(
        session,
        user,
        client=client,
        source=_SOURCE,
        input_length=size,
        redacted_count=0,
        candidate_count=found,
        model=None if failed else client.model,
        escalated=False,
        failed=failed,
    )


def _candidates(extraction: AssetExtraction, rows: list[AssetItem]) -> list[CaptureRow]:
    """읽은 줄을 기존 항목에 맞춘다. 수량 종목에 맞은 줄은 덮지 않으려고 뺀다."""
    items = asset_names.named(rows)
    by_key = {row.item_key: row for row in rows}
    quantity = asset_names.quantity_keys(rows)
    used: set[uuid.UUID] = set()
    out: list[CaptureRow] = []
    for read in extraction.rows:
        name = " ".join(redact(read.name).text.split())[:80]
        if not name or read.amount > MAX_AMOUNT:
            continue
        key = _match(name, read.group, items, by_key)
        if key is not None and (key in quantity or key in used):
            continue
        current = by_key.get(key) if key is not None else None
        if key is not None:
            used.add(key)
        out.append(
            CaptureRow(
                name=name,
                amount=Money(Decimal(read.amount)),
                # 모르면 현금·예적금. 검토 화면에서 바꿀 수 있다.
                group=current.group if current is not None else read.group or AssetGroup.CASH,
                item_key=key,
                current_amount=Money(current.amount) if current is not None else None,
            )
        )
    return out


def _match(
    name: str,
    group: AssetGroup | None,
    items: list[NamedItem],
    by_key: dict[uuid.UUID | None, AssetItem],
) -> uuid.UUID | None:
    """같은 이름이 여러 그룹에 있으면(통장과 대출) 읽은 그룹 쪽을 먼저 본다."""
    if group is not None:
        same = [item for item in items if by_key[item.key].group is group]
        key = match_item(name, same)
        if key is not None:
            return key
    return match_item(name, items)
