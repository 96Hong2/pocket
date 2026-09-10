"""모델이 낸 결과를 사람에게 보이기 전에 서버가 한 번 본다.

모델은 그럴듯한 값을 잘 만든다. 날짜를 내년으로 적거나, 영수증 한 장에서 같은 결제를 두 번
읽거나, 자릿수를 하나 더 붙인다. **그 셋은 모델을 다시 불러 보면 대개 갈린다.**

여기는 순수 함수다. DB 도 세션도 모른다. 무엇이 이상한지만 말하고, 다시 부를지 말지는
부르는 쪽(`modules/imports`)이 정한다.

**의심스러우면 이상으로 본다.** 잘못 통과시키면 틀린 금액이 가계부에 조용히 남는다.
잘못 막으면 사람이 한 번 더 볼 뿐이다.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from app.integrations.llm.contracts import (
    LOW_CONFIDENCE_THRESHOLD,
    ExtractedTransaction,
    TransactionExtraction,
)

__all__ = [
    "MAX_AMOUNT",
    "MAX_PAST_DAYS",
    "ExtractionProblem",
    "ReviewVerdict",
    "review_extraction",
]

# 개인 가계부에 한 건으로 들어올 수 있는 상한. 이보다 크면 자릿수를 잘못 읽은 쪽을 먼저 의심한다.
MAX_AMOUNT = 100_000_000

# 이보다 오래된 날짜는 사진에서 잘못 읽은 것으로 본다(영수증에 찍힌 사업자번호·전화번호를
# 날짜로 읽는 일이 있다).
MAX_PAST_DAYS = 730

# 오늘 이후. 시간대 차이로 하루가 앞설 수 있어 하루는 봐준다.
_FUTURE_GRACE_DAYS = 1


class ExtractionProblem(str):
    """무엇이 이상한지. 로그와 재시도 프롬프트에 그대로 실린다."""

    __slots__ = ()


@dataclass(frozen=True, slots=True)
class ReviewVerdict:
    """판정 하나. 이상한 후보의 자리와 이유를 함께 들고 다닌다."""

    problems: tuple[str, ...]
    #: 이상이 잡힌 후보의 순번. 비어 있고 problems 만 있으면 결과 전체의 문제다.
    flagged: frozenset[int]

    @property
    def is_clean(self) -> bool:
        return not self.problems

    def flags(self, index: int) -> bool:
        return index in self.flagged

    def summary(self) -> str:
        return " · ".join(self.problems)


def review_extraction(extraction: TransactionExtraction, *, today: date) -> ReviewVerdict:
    """이상한 곳을 찾는다. 아무것도 없으면 그대로 자동 등록해도 되는 결과다."""
    problems: list[str] = []
    flagged: set[int] = set()

    if not extraction.candidates:
        # 사진을 받았는데 한 건도 못 읽었다. 다른 모델은 읽을 수 있다.
        return ReviewVerdict(problems=("읽어 낸 거래가 없다",), flagged=frozenset())

    for index, candidate in enumerate(extraction.candidates):
        found = _problems_of(candidate, today=today)
        if found:
            flagged.add(index)
            problems.extend(f"{index + 1}번: {reason}" for reason in found)

    for index in _repeated(extraction.candidates):
        flagged.add(index)
        problems.append(f"{index + 1}번: 같은 결제가 두 번 읽혔다")

    return ReviewVerdict(problems=tuple(problems), flagged=frozenset(flagged))


def _problems_of(candidate: ExtractedTransaction, *, today: date) -> list[str]:
    problems: list[str] = []

    # 금액. 0 이하는 스키마가 이미 막는다. 여기서는 위쪽만 본다.
    if candidate.amount > MAX_AMOUNT:
        problems.append(f"금액 {candidate.amount}원이 상한을 넘었다")

    # 날짜. 없는 것은 이상이 아니다. 오늘로 두는 규칙이 따로 있다.
    occurred_on = candidate.occurred_at
    if occurred_on is not None:
        if occurred_on > today + timedelta(days=_FUTURE_GRACE_DAYS):
            problems.append(f"날짜 {occurred_on.isoformat()} 가 미래다")
        elif occurred_on < today - timedelta(days=MAX_PAST_DAYS):
            problems.append(f"날짜 {occurred_on.isoformat()} 가 너무 오래됐다")

    if candidate.confidence < LOW_CONFIDENCE_THRESHOLD:
        problems.append(f"확신이 낮다({candidate.confidence:.2f})")

    return problems


def _repeated(candidates: list[ExtractedTransaction]) -> set[int]:
    """한 번의 결과 안에서 같은 결제가 두 번 나온 자리.

    **뒤에 나온 것만 짚는다.** 첫 줄은 제대로 읽은 것일 수 있다.
    상호가 비어 있으면 세지 않는다. 영수증 한 장에 같은 금액 품목이 여럿인 것은 정상이다.
    """
    seen: set[tuple[date | None, int, str, str]] = set()
    repeated: set[int] = set()
    for index, candidate in enumerate(candidates):
        merchant = (candidate.merchant or "").strip()
        if not merchant:
            continue
        key = (candidate.occurred_at, candidate.amount, candidate.type.value, merchant)
        if key in seen:
            repeated.add(index)
        seen.add(key)
    return repeated
