"""자산 캡처: 은행·증권 앱의 잔액 화면 한 장이나 적은 보유 내역을 읽어 후보 목록을 돌려준다.

검토 단위(ImportBatch)를 만들지 않는다. 저장은 화면이 PUT /assets 로 한다.
이미지, 글, 모델 원문은 어디에도 남기지 않는다. 하루 상한과 사용량 표는 줄글·캡처와 나눠 쓴다.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from decimal import Decimal
from functools import partial

import anyio.from_thread
from sqlalchemy.orm import Session

from app.api.amounts import MAX_AMOUNT, MAX_QUANTITY
from app.api.errors import ApiError, ErrorCode
from app.domain.aggregation import TransactionSource
from app.domain.asset_capture import (
    AMOUNT_ONLY,
    CapturedHolding,
    captured_cost,
    captured_holding,
    fair_unit_price,
)
from app.domain.asset_ledger import (
    AMOUNT_KINDS,
    QUANTITY_KINDS,
    QUANTITY_PLACES,
    Holding,
    InvestKind,
    holding_of,
)
from app.domain.asset_names import NamedItem, match_item
from app.domain.assets import AssetGroup
from app.domain.money import Money
from app.domain.redaction import redact
from app.integrations.imaging import prepare_image
from app.integrations.llm import (
    AssetExtraction,
    ExtractedAsset,
    LlmError,
    LlmImage,
    LlmStructuredClient,
    asset_capture_prompt,
    asset_text_prompt,
)
from app.models import AssetItem, User
from app.modules import ledger
from app.modules.assets import entries, names as asset_names
from app.modules.imports import service as imports

logger = logging.getLogger(__name__)

__all__ = ["CaptureRow", "read_capture", "read_text"]

_SOURCE = TransactionSource.ASSET_SCREENSHOT
# 적은 보유 내역은 줄글 상한과 사용량에 함께 센다. 출처 값을 새로 늘리지 않는다.
_TEXT_SOURCE = TransactionSource.NL


@dataclass(frozen=True, slots=True)
class CaptureRow:
    """후보 한 줄. 기존 항목에 맞으면 그 키와 지금 금액이 붙는다.

    held 는 저장하면 그 항목이 갖게 될 종류, 수량, 넣은 돈, 지금 1주 가격이다.
    """

    name: str
    amount: Money
    group: AssetGroup
    item_key: uuid.UUID | None = None
    current_amount: Money | None = None
    held: CapturedHolding = AMOUNT_ONLY

    @property
    def rate(self) -> Decimal | None:
        return self.held.rate(self.amount)


def read_capture(
    session: Session, user: User, *, image: LlmImage, client: LlmStructuredClient
) -> list[CaptureRow]:
    """잔액 화면 한 장을 읽는다. 잔액이 없는 그림이면 빈 목록이다."""
    day = ledger.today_for(user)
    rows = asset_names.current_rows(session, user)
    prompt = asset_capture_prompt(asset_names.hints(rows))
    # 다듬기 전에 센다. 커밋이 DB 연결을 돌려줘서 모델을 기다리는 동안 풀을 쥐지 않는다.
    usage = imports.reserve_usage(
        session,
        user,
        day,
        label="자산 캡처 분석",
        count=1,
        client=client,
        source=_SOURCE,
        input_length=len(image.data),
        redacted_count=0,
    )
    sent = prepare_image(image)
    call = partial(
        client.extract,
        prompt=prompt,
        schema=AssetExtraction,
        image=sent,
        today=day,
    )
    try:
        extraction = anyio.from_thread.run(call)
    except LlmError as exc:
        # 사용량 줄은 이미 「실패」 로 적혀 있다.
        raise ApiError(
            ErrorCode.PARSE_UNAVAILABLE,
            "지금은 캡처를 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.",
            status_code=503,
        ) from exc
    keys = [row.item_key for row in rows if row.item_key is not None]
    found = _candidates(extraction, rows, entries.ledger_keys(session, user, keys))
    usage.settle(
        answered=1,
        model=client.model,
        input_length=len(sent.data),
        redacted_count=0,
        candidate_count=len(found),
    )
    session.commit()
    if not found:
        logger.info("자산 캡처에서 잔액을 찾지 못했다")
    return found


def read_text(
    session: Session, user: User, *, text: str, client: LlmStructuredClient
) -> list[CaptureRow]:
    """적은 보유 내역을 캡처와 같은 후보 목록으로 읽는다. 금액이 없는 글이면 빈 목록이다."""
    day = ledger.today_for(user)
    # 저장하지 않는 것만으로는 부족하다. 보내기 전에 계좌번호를 가린다.
    cleaned = redact(text)
    rows = asset_names.current_rows(session, user)
    prompt = asset_text_prompt(asset_names.hints(rows))
    usage = imports.reserve_usage(
        session,
        user,
        day,
        label="줄글 분석",
        count=1,
        client=client,
        source=_TEXT_SOURCE,
        input_length=len(text),
        redacted_count=cleaned.count,
    )
    call = partial(
        client.extract,
        prompt=prompt,
        schema=AssetExtraction,
        text=cleaned.text,
        today=day,
    )
    try:
        extraction = anyio.from_thread.run(call)
    except LlmError as exc:
        raise ApiError(
            ErrorCode.PARSE_UNAVAILABLE,
            "지금은 글을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.",
            status_code=503,
        ) from exc
    keys = [row.item_key for row in rows if row.item_key is not None]
    found = _candidates(extraction, rows, entries.ledger_keys(session, user, keys), typed=True)
    usage.settle(
        answered=1,
        model=client.model,
        input_length=len(text),
        redacted_count=cleaned.count,
        candidate_count=len(found),
    )
    session.commit()
    return found


def _candidates(
    extraction: AssetExtraction,
    rows: list[AssetItem],
    ledgered: set[uuid.UUID],
    *,
    typed: bool = False,
) -> list[CaptureRow]:
    """읽은 줄을 기존 항목에 맞춘다. 맞은 항목도 새로 읽은 수량과 넣은 돈으로 채운다.

    수량 종목에 맞은 줄은 수량이 같게 읽히면 지금 1주 가격만, 다르면 읽은 수량과 넣은 돈으로
    맞춘다. 둘 다 못 하면 덮지 않으려고 뺀다. 장부가 있는 항목은 갈래(수량, 금액)를 바꾸지 않는다.

    typed 는 사람이 적은 글이다. 새 종목에 넣은 돈이 따로 안 적혔으면 적은 금액을 넣은 돈으로 본다.
    안 그러면 「삼성전자 3주 21만원」 의 수량이 사라진다. 기존 항목에는 이 규칙을 쓰지 않는다.
    """
    items = asset_names.named(rows)
    by_key = {row.item_key: row for row in rows}
    used: set[uuid.UUID] = set()
    out: list[CaptureRow] = []
    for read in extraction.rows:
        name = " ".join(redact(read.name).text.split())[:80]
        if not name or read.amount > MAX_AMOUNT:
            continue
        key = _match(name, read.group, items, by_key)
        if key is not None and key in used:
            continue
        current = by_key.get(key) if key is not None else None
        # 모르면 현금·예적금. 검토 화면에서 바꿀 수 있다.
        group = current.group if current is not None else read.group or AssetGroup.CASH
        value = Money(Decimal(read.amount))
        quantity = _read_quantity(read.quantity)
        held = AMOUNT_ONLY
        if group is AssetGroup.INVESTMENT:
            read = _typed_cost(read, quantity) if typed and current is None else read
            held = _read_holding(read, value, quantity)
        if current is not None:
            fitted = _fit(current, held, value, quantity, ledgered=key in ledgered)
            if fitted is None:
                continue
            held = fitted
        if key is not None:
            used.add(key)
        out.append(
            CaptureRow(
                name=name,
                amount=value,
                group=group,
                item_key=key,
                current_amount=Money(current.amount) if current is not None else None,
                held=held,
            )
        )
    return out


def _typed_cost(read: ExtractedAsset, quantity: Decimal | None) -> ExtractedAsset:
    """넣은 돈이 안 적힌 새 수량 종목은 적은 금액을 넣은 돈으로 둔다.

    기록하기의 「넣었어요」 와 같은 뜻이다.

    수량이 없는 줄(펀드, 계좌 합계)은 그대로 둔다. 짐작한 넣은 돈으로 수익률을 내지 않는다.
    """
    if read.purchase is not None or read.profit is not None:
        return read
    if quantity is None or read.kind not in QUANTITY_KINDS:
        return read
    return read.model_copy(update={"purchase": read.amount})


def _read_holding(read: ExtractedAsset, value: Money, quantity: Decimal | None) -> CapturedHolding:
    """모델이 옮긴 숫자에서 넣은 돈과 수량을 정한다. 이상한 값은 못 읽은 것으로 본다."""
    cost = captured_cost(value, read.purchase, read.profit)
    if cost is not None and cost.amount > MAX_AMOUNT:
        cost = None
    return captured_holding(value, read.kind, quantity, cost)


def _read_quantity(value: float | None) -> Decimal | None:
    if value is None:
        return None
    quantity = Decimal(str(value))
    if not quantity.is_finite() or quantity <= 0 or quantity > MAX_QUANTITY:
        return None
    if quantity != quantity.quantize(QUANTITY_PLACES):
        return None
    return quantity.quantize(QUANTITY_PLACES)


def _fit(
    current: AssetItem,
    held: CapturedHolding,
    value: Money,
    read_quantity: Decimal | None,
    *,
    ledgered: bool,
) -> CapturedHolding | None:
    """기존 항목에 맞춘 읽은 값. None 이면 그 줄을 뺀다."""
    holding = holding_of(current.group, current.kind)
    if holding is Holding.QUANTITY:
        quantity = current.quantity
        if read_quantity is None or quantity is None or quantity <= 0:
            return None
        # 1주 가격을 원 단위로 못 적는 종목(아주 싼 코인)은 덮으면 값이 틀어진다. 뺀다.
        price = fair_unit_price(value, read_quantity)
        if price is None:
            return None
        if read_quantity == quantity:
            # 장부의 넣은 돈은 건드리지 않는다. 1주 가격만 새로 적는다.
            cost = Money(current.cost_basis) if current.cost_basis is not None else None
            return CapturedHolding(
                kind=current.kind, quantity=quantity, cost_basis=cost, unit_price=price
            )
        if held.cost_basis is None:
            # 수량이 달라졌는데 넣은 돈을 못 읽었다. 옛 넣은 돈으로 기준을 지어내지 않는다.
            return None
        # 종류는 이미 아는 항목의 것. 모델이 종류를 못 읽어도 수량과 넣은 돈이면 맞춘다.
        return CapturedHolding(
            kind=current.kind,
            quantity=read_quantity,
            cost_basis=held.cost_basis,
            unit_price=price,
        )
    if holding is not Holding.AMOUNT:
        return AMOUNT_ONLY
    if held.quantity is not None and not ledgered:
        return held
    if held.cost_basis is None:
        return AMOUNT_ONLY
    kind: InvestKind | None = current.kind
    if kind is None and held.kind in AMOUNT_KINDS:
        kind = held.kind
    return CapturedHolding(kind=kind, quantity=None, cost_basis=held.cost_basis, unit_price=None)


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
