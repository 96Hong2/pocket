"""중복 판정용 지문.

sha256(occurred_on | amount | normalize(merchant) | type) 를 만들고,
정확히 같은 지문만 중복 후보로 본다. 상점명이 비면 지문은 만들되 후보에서는 뺀다.
"""

from __future__ import annotations

import hashlib
import unicodedata
from dataclasses import dataclass
from datetime import date

from app.domain.aggregation import TransactionType
from app.domain.money import Money

__all__ = [
    "Fingerprint",
    "build_fingerprint",
    "is_duplicate_candidate",
    "normalize_merchant",
    "select_duplicate_candidates",
]


def normalize_merchant(merchant: str | None) -> str:
    """전각·대소문자·띄어쓰기 차이를 지운다. 카드 내역마다 표기가 흔들리기 때문."""
    if merchant is None:
        return ""
    normalized = unicodedata.normalize("NFKC", merchant).casefold()
    return "".join(normalized.split())


@dataclass(frozen=True)
class Fingerprint:
    value: str
    merchant_normalized: str
    duplicate_eligible: bool


def build_fingerprint(
    *,
    occurred_on: date,
    amount: Money,
    type: TransactionType,
    merchant: str | None = None,
) -> Fingerprint:
    merchant_normalized = normalize_merchant(merchant)
    raw = "|".join(
        [
            occurred_on.isoformat(),
            str(int(amount)),
            merchant_normalized,
            type.value,
        ]
    )
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return Fingerprint(
        value=digest,
        merchant_normalized=merchant_normalized,
        duplicate_eligible=bool(merchant_normalized),
    )


def is_duplicate_candidate(left: Fingerprint, right: Fingerprint) -> bool:
    if not (left.duplicate_eligible and right.duplicate_eligible):
        return False
    return left.value == right.value


def select_duplicate_candidates(
    target: Fingerprint, existing: dict[str, Fingerprint]
) -> tuple[str, ...]:
    """중복 후보의 키만 돌려준다. 화면에서 기본 미선택으로 보여 주는 것은 표현 계층 몫."""
    return tuple(key for key, other in existing.items() if is_duplicate_candidate(target, other))
