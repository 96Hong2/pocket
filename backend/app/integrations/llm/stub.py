"""결정적 스텁 LLM.

API 키 없이 개발·테스트가 돌아가게 한다. 같은 입력이면 항상 같은 결과다.

"12000 점심" 정도의 아주 단순한 규칙만 본다. 못 읽으면 후보를 만들지 않거나
confidence 를 낮게 준다. 스텁이 쓰였다는 사실은 ParseMeta.is_stub 으로 드러난다.

계산은 하지 않는다. 금액을 읽어 옮길 뿐 더하거나 빼지 않는다.
"""

from __future__ import annotations

import logging
import re
from datetime import date

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

_ISO_DATE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
_AMOUNT = re.compile(r"(\d[\d,]*)\s*(만원|천원|원)?")

_TYPE_KEYWORDS: tuple[tuple[TransactionType, tuple[str, ...]], ...] = (
    ("refund", ("환불", "취소", "반품")),
    ("transfer", ("이체", "송금", "출금", "충전")),
    ("income", ("월급", "급여", "수입", "입금", "용돈", "정산받")),
)

_CATEGORY_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("식비", ("점심", "저녁", "아침", "밥", "식당", "김밥", "국밥", "배달")),
    ("카페·간식", ("커피", "카페", "라떼", "아메리카노", "디저트", "빵")),
    ("교통", ("택시", "버스", "지하철", "기차", "주유", "톨비")),
    ("쇼핑", ("옷", "쇼핑", "신발", "가방")),
    ("생활", ("마트", "편의점", "생필품", "세제")),
    ("주거·고정비", ("월세", "관리비", "전기세", "통신비", "보험")),
    ("여가·취미", ("영화", "게임", "공연", "책", "여행")),
    ("건강·미용", ("병원", "약국", "미용실", "헬스", "화장품")),
)

_CURRENCY_MULTIPLIER = {"만원": 10_000, "천원": 1_000, "원": 1, None: 1}

_BASE_CONFIDENCE = 0.35
_MERCHANT_BONUS = 0.20
_CATEGORY_BONUS = 0.10


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
    ) -> SchemaT:
        del prompt  # 스텁은 프롬프트를 보지 않는다.
        require_single_input(text, image)
        if schema is not TransactionExtraction:
            raise LlmSchemaError(f"스텁은 {TransactionExtraction.__name__} 만 만들 수 있다")
        if image is not None:
            # 스텁은 이미지 인식을 하지 않는다. 캡처 경로는 실제 provider 가 필요하다.
            return schema.model_validate(TransactionExtraction().model_dump())
        assert text is not None
        extraction = parse_text(text)
        return schema.model_validate(extraction.model_dump())


def parse_text(text: str) -> TransactionExtraction:
    """줄글 한 줄에서 거래 후보 하나를 뽑는다. 못 뽑으면 빈 목록."""
    cleaned = text.strip()
    if not cleaned:
        return TransactionExtraction()

    # 날짜를 먼저 떼어낸다. 그러지 않으면 "2026-01-02" 의 2026 이 금액으로 잡힌다.
    occurred_at, rest = _take_iso_date(cleaned)
    amount, amount_span = _find_amount(rest)
    if amount is None or amount_span is None:
        return TransactionExtraction()

    remainder = (rest[: amount_span[0]] + " " + rest[amount_span[1] :]).strip()
    transaction_type = _guess_type(rest)
    merchant = _clean_merchant(remainder)
    category = _guess_category(rest) if transaction_type == "expense" else None

    confidence = _BASE_CONFIDENCE
    if merchant:
        confidence += _MERCHANT_BONUS
    if category:
        confidence += _CATEGORY_BONUS

    return TransactionExtraction(
        candidates=[
            ExtractedTransaction(
                occurred_at=occurred_at,
                amount=amount,
                type=transaction_type,
                merchant=merchant,
                category=category,
                confidence=round(confidence, 2),
            )
        ]
    )


def _find_amount(text: str) -> tuple[int | None, tuple[int, int] | None]:
    for match in _AMOUNT.finditer(text):
        digits = match.group(1).replace(",", "")
        if not digits:
            continue
        unit = match.group(2)
        value = int(digits) * _CURRENCY_MULTIPLIER[unit]
        if value <= 0:
            continue
        return value, match.span()
    return None, None


def _take_iso_date(text: str) -> tuple[date | None, str]:
    match = _ISO_DATE.search(text)
    if match is None:
        # 상대 날짜("어제")는 추측하지 않는다. 비워 두면 호출자가 정한다.
        return None, text
    try:
        parsed = date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    except ValueError:
        return None, text
    stripped = (text[: match.start()] + " " + text[match.end() :]).strip()
    return parsed, stripped


def _guess_type(text: str) -> TransactionType:
    for transaction_type, keywords in _TYPE_KEYWORDS:
        if any(keyword in text for keyword in keywords):
            return transaction_type
    return "expense"


def _guess_category(text: str) -> str | None:
    for category, keywords in _CATEGORY_KEYWORDS:
        if any(keyword in text for keyword in keywords):
            return category
    return None


def _clean_merchant(text: str) -> str | None:
    merchant = re.sub(r"\s+", " ", text).strip(" .,-·")
    return merchant[:120] or None
