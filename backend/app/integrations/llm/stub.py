"""결정적 스텁 LLM.

API 키 없이 개발·테스트가 돌아가게 한다. 같은 입력이면 항상 같은 결과다.

`점심 12000 스벅 4500 어제 택시 9000` 정도의 한국어 가계부 문장을 읽는다.
끊는 자리와 날짜 환산은 `app.domain.nl_text` 가 정하고, 여기서는 종류·분류·상호만 본다.
못 읽으면 후보를 만들지 않거나 confidence 를 낮게 준다.
스텁이 쓰였다는 사실은 ParseMeta.is_stub 으로 드러난다.

계산은 하지 않는다. 금액을 읽어 옮길 뿐 더하거나 빼지 않는다.
"""

from __future__ import annotations

import logging
import re
from datetime import date

from app.domain.nl_text import find_amounts, read_date, split_entries
from app.integrations.llm.contracts import (
    ExtractedTransaction,
    TransactionExtraction,
    TransactionType,
)
from app.integrations.llm.port import (
    LlmImage,
    LlmSchemaError,
    SchemaT,
    require_single_input,
)

logger = logging.getLogger(__name__)

PROVIDER_NAME = "stub"

# 한 번에 읽어 들이는 건수 상한. PRD 가 정한 1~20 건이다.
MAX_CANDIDATES = 20

_TYPE_KEYWORDS: tuple[tuple[TransactionType, tuple[str, ...]], ...] = (
    (TransactionType.REFUND, ("환불", "취소", "반품")),
    (TransactionType.TRANSFER, ("이체", "송금", "출금", "충전")),
    (TransactionType.INCOME, ("월급", "급여", "수입", "입금", "용돈", "정산받")),
)

_CATEGORY_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("식비", ("점심", "저녁", "아침", "밥", "식당", "김밥", "국밥", "배달", "치킨", "분식")),
    ("카페·간식", ("커피", "카페", "라떼", "아메리카노", "디저트", "빵", "스벅", "스타벅스")),
    ("교통", ("택시", "버스", "지하철", "기차", "주유", "톨비", "주차")),
    ("쇼핑", ("옷", "쇼핑", "신발", "가방")),
    ("생활", ("마트", "편의점", "생필품", "세제", "다이소")),
    ("주거·고정비", ("월세", "관리비", "전기세", "통신비", "보험")),
    ("여가·취미", ("영화", "게임", "공연", "책", "여행")),
    ("건강·미용", ("병원", "약국", "미용실", "헬스", "화장품", "올리브영")),
)

_BASE_CONFIDENCE = 0.35
_MERCHANT_BONUS = 0.20
_CATEGORY_BONUS = 0.10
_DATE_BONUS = 0.05


class StubLlmStructuredClient:
    """규칙 기반 스텁. TransactionExtraction 스키마만 다룬다."""

    def __init__(self) -> None:
        logger.warning(
            "LLM 스텁을 쓴다. 실제 모델이 아니라 규칙 파서다. 응답 메타의 is_stub 을 확인할 것."
        )

    @property
    def provider(self) -> str:
        return PROVIDER_NAME

    @property
    def is_stub(self) -> bool:
        return True

    async def extract(
        self,
        *,
        prompt: str,
        schema: type[SchemaT],
        text: str | None = None,
        image: LlmImage | None = None,
        today: date | None = None,
    ) -> SchemaT:
        del prompt  # 스텁은 프롬프트를 보지 않는다.
        require_single_input(text, image)
        if schema is not TransactionExtraction:
            raise LlmSchemaError(f"스텁은 {TransactionExtraction.__name__} 만 만들 수 있다")
        if image is not None:
            # 스텁은 이미지 인식을 하지 않는다. 캡처 경로는 실제 provider 가 필요하다.
            return schema.model_validate(TransactionExtraction().model_dump())
        assert text is not None
        extraction = parse_text(text, today=today)
        return schema.model_validate(extraction.model_dump())


def parse_text(text: str, *, today: date | None = None) -> TransactionExtraction:
    """줄글에서 거래 후보를 뽑는다. 하나도 못 뽑으면 빈 목록."""
    if not text.strip():
        return TransactionExtraction()

    entries = split_entries(text)
    # 맨 앞에 적은 날짜는 뒤따르는 조각에도 이어진다. "어제 점심 12000 커피 4500" 이 둘 다 어제다.
    # 첫 조각에 금액이 없어 후보가 안 나와도 그 날짜는 살려서 물려준다.
    leading = _leading_date(entries, today=today)

    candidates: list[ExtractedTransaction] = []
    for entry in entries[:MAX_CANDIDATES]:
        parsed = _parse_entry(entry, today=today, inherited=leading)
        if parsed is None:
            continue
        if leading is None:
            leading = parsed.occurred_at
        candidates.append(parsed)
    return TransactionExtraction(candidates=candidates)


def _leading_date(entries: list[str], *, today: date | None) -> date | None:
    """맨 앞 조각에 적힌 날짜. 그 조각이 금액 없는 날짜 말뿐이어도 읽는다."""
    if not entries:
        return None
    found, rest = read_date(entries[0], today=today)
    if found is None:
        return None
    # 첫 조각에 금액이 있으면 그 건의 날짜다. 아래 반복이 다시 읽으므로 여기서는 넘긴다.
    return found if not find_amounts(rest) else None


def _parse_entry(
    entry: str, *, today: date | None, inherited: date | None
) -> ExtractedTransaction | None:
    occurred_at, rest = read_date(entry, today=today)
    amounts = find_amounts(rest)
    if not amounts:
        return None
    amount = amounts[0]

    remainder = f"{rest[: amount.start]} {rest[amount.end :]}".strip()
    transaction_type = _guess_type(rest)
    merchant = _clean_merchant(remainder)
    category = _guess_category(rest) if transaction_type == TransactionType.EXPENSE else None

    confidence = _BASE_CONFIDENCE
    if merchant:
        confidence += _MERCHANT_BONUS
    if category:
        confidence += _CATEGORY_BONUS
    if occurred_at is not None:
        confidence += _DATE_BONUS

    return ExtractedTransaction(
        occurred_at=occurred_at or inherited,
        amount=amount.value,
        type=transaction_type,
        merchant=merchant,
        category=category,
        confidence=round(confidence, 2),
    )


def _guess_type(text: str) -> TransactionType:
    for transaction_type, keywords in _TYPE_KEYWORDS:
        if any(keyword in text for keyword in keywords):
            return transaction_type
    return TransactionType.EXPENSE


def _guess_category(text: str) -> str | None:
    for category, keywords in _CATEGORY_KEYWORDS:
        if any(keyword in text for keyword in keywords):
            return category
    return None


def _clean_merchant(text: str) -> str | None:
    merchant = re.sub(r"\s+", " ", text).strip(" .,-·")
    return merchant[:120] or None
