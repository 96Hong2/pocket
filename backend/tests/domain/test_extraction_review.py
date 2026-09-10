"""모델이 낸 결과를 서버가 한 번 더 보는 규칙.

여기서 걸러야 하는 것은 "형식은 맞는데 말이 안 되는 값" 이다. 스키마는 통과하지만
가계부에 남으면 안 되는 것들. 하나라도 놓치면 틀린 금액이 조용히 확정된다.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.domain.extraction_review import MAX_AMOUNT, review_extraction
from app.integrations.llm.contracts import ExtractedTransaction, TransactionExtraction

TODAY = date(2026, 9, 11)


def _one(**kwargs: object) -> TransactionExtraction:
    base: dict[str, object] = {
        "occurred_at": TODAY,
        "amount": 12000,
        "type": "expense",
        "merchant": "김밥천국",
        "category": "식비",
        "confidence": 0.9,
    }
    base.update(kwargs)
    return TransactionExtraction(candidates=[ExtractedTransaction(**base)])  # type: ignore[arg-type]


def test_멀쩡한_결과는_그냥_지나간다() -> None:
    verdict = review_extraction(_one(), today=TODAY)

    assert verdict.is_clean
    assert not verdict.flags(0)


def test_한_건도_못_읽으면_이상으로_본다() -> None:
    """사진을 받았는데 빈손인 것이다. 다른 모델은 읽을 수도 있다."""
    verdict = review_extraction(TransactionExtraction(candidates=[]), today=TODAY)

    assert not verdict.is_clean
    assert "읽어 낸 거래가 없다" in verdict.summary()


def test_미래_날짜를_막는다() -> None:
    verdict = review_extraction(_one(occurred_at=TODAY + timedelta(days=30)), today=TODAY)

    assert verdict.flags(0)
    assert "미래" in verdict.summary()


def test_하루_앞선_것은_봐준다() -> None:
    """시간대가 다르면 하루가 앞설 수 있다. 그것까지 막으면 정상 입력이 걸린다."""
    assert review_extraction(_one(occurred_at=TODAY + timedelta(days=1)), today=TODAY).is_clean


def test_너무_오래된_날짜를_막는다() -> None:
    """영수증의 사업자번호·전화번호를 날짜로 읽는 일이 있다."""
    verdict = review_extraction(_one(occurred_at=date(2019, 3, 2)), today=TODAY)

    assert verdict.flags(0)
    assert "오래됐다" in verdict.summary()


def test_날짜를_모르는_것은_이상이_아니다() -> None:
    """모르면 null 로 두라고 프롬프트가 시킨다. 지어내지 않은 것을 벌주지 않는다."""
    assert review_extraction(_one(occurred_at=None), today=TODAY).is_clean


def test_상한을_넘는_금액을_막는다() -> None:
    verdict = review_extraction(_one(amount=MAX_AMOUNT + 1), today=TODAY)

    assert verdict.flags(0)
    assert "상한" in verdict.summary()


def test_확신이_낮으면_이상으로_본다() -> None:
    verdict = review_extraction(_one(confidence=0.2), today=TODAY)

    assert verdict.flags(0)
    assert "확신이 낮다" in verdict.summary()


def test_같은_결제가_두_번_읽히면_뒤엣것을_짚는다() -> None:
    """앞줄은 제대로 읽은 것일 수 있다. 뒤엣것만 사람에게 넘긴다."""
    same = {
        "occurred_at": TODAY,
        "amount": 8000,
        "type": "expense",
        "merchant": "스타벅스",
        "confidence": 0.95,
    }
    extraction = TransactionExtraction(
        candidates=[
            ExtractedTransaction(**same),  # type: ignore[arg-type]
            ExtractedTransaction(**same),  # type: ignore[arg-type]
        ]
    )

    verdict = review_extraction(extraction, today=TODAY)

    assert not verdict.flags(0)
    assert verdict.flags(1)
    assert "두 번" in verdict.summary()


def test_상호가_비면_같은_금액이_여럿이어도_넘어간다() -> None:
    """영수증 한 장에 같은 값 품목이 여럿인 것은 정상이다."""
    item = {"occurred_at": TODAY, "amount": 3000, "type": "expense", "confidence": 0.9}
    extraction = TransactionExtraction(
        candidates=[
            ExtractedTransaction(**item),  # type: ignore[arg-type]
            ExtractedTransaction(**item),  # type: ignore[arg-type]
        ]
    )

    assert review_extraction(extraction, today=TODAY).is_clean


@pytest.mark.parametrize("amount", [1, 12_000, MAX_AMOUNT])
def test_상한_안쪽_금액은_통과한다(amount: int) -> None:
    assert review_extraction(_one(amount=amount), today=TODAY).is_clean
