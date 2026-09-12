"""리포트에 올릴 순위표. DB 도 HTTP 도 모른다.

도넛과 카테고리 목록이 같은 줄 목록을 쓴다. 두 곳에서 따로 정렬하면 링과 목록의
순서가 어긋나 같은 화면 안에서 다른 말을 하게 된다.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.domain.aggregation import PaymentMethod
from app.domain.money import Money, ratio

__all__ = [
    "NO_METHOD",
    "ROLLED_UP",
    "UNCATEGORIZED",
    "BreakdownRow",
    "MethodRow",
    "rank_breakdown",
    "rank_methods",
]

# 분류를 못 정한 줄. 감추지 않는다. 감추면 조각 합이 총액과 안 맞는다.
UNCATEGORIZED = "uncategorized"
# 상위 몇 개 밖으로 밀려난 것들을 한 줄로 접은 것.
ROLLED_UP = "rolled_up"
# 결제 수단을 안 고르고 적은 줄. 이것도 감추지 않는다. 감추면 네 줄의 합이 총액과 안 맞는다.
NO_METHOD = "none"

# 색 램프가 아홉 색이다. 순환시키면 링 안에 같은 색이 두 번 나와 오히려 못 읽는다.
# 여덟 줄 + 접은 한 줄이 정확히 아홉이다.
TOP_LIMIT = 8


@dataclass(frozen=True)
class BreakdownRow:
    """조각 한 줄. 이름은 화면이 붙인다. 서버는 문장을 만들지 않는다."""

    key: str
    category_id: str | None
    amount: Money
    share: Decimal | None
    """조각 합에서 이 줄이 차지하는 비중. 조각 합이 0 이면 None."""
    rolled_count: int = 0
    """접은 줄이 몇 개를 대신하는지. 접은 줄이 아니면 0."""


def rank_breakdown(
    spend: dict[str | None, Money], *, limit: int = TOP_LIMIT
) -> tuple[list[BreakdownRow], Money]:
    """금액 큰 순으로 줄을 세우고 넘치는 것을 한 줄로 접는다.

    조각 합을 함께 돌려준다. **이 합은 그 달 지출과 다를 수 있다.**
    환불이 지출보다 큰 분류는 합계가 음수인데, 음수 호는 그릴 수 없어 조각에서 뺀다.
    두 값을 함께 보내야 화면이 "도넛이 말하는 것" 과 "실제로 쓴 돈" 을 갈라 적을 수 있다.
    """
    positive = {key: value for key, value in spend.items() if value.is_positive}
    ordered = sorted(positive.items(), key=lambda item: (-item[1].amount, _sort_key(item[0])))

    total = Money.zero()
    for _, value in ordered:
        total = total + value

    head, tail = ordered[:limit], ordered[limit:]
    rows = [_row(_key_of(cid), cid, value, total) for cid, value in head]

    if tail:
        folded = Money.zero()
        for _, value in tail:
            folded = folded + value
        rows.append(_row(ROLLED_UP, None, folded, total, rolled_count=len(tail)))

    return rows, total


def _row(
    key: str, category_id: str | None, amount: Money, total: Money, *, rolled_count: int = 0
) -> BreakdownRow:
    return BreakdownRow(
        key=key,
        category_id=category_id,
        amount=amount,
        share=ratio(amount, total),
        rolled_count=rolled_count,
    )


def _key_of(category_id: str | None) -> str:
    return category_id if category_id is not None else UNCATEGORIZED


def _sort_key(category_id: str | None) -> str:
    """금액이 같을 때의 순서. 같은 입력이면 늘 같은 화면이어야 한다."""
    return category_id if category_id is not None else ""


@dataclass(frozen=True)
class MethodRow:
    """결제 수단 한 줄. 카드·현금을 갈라 본다."""

    key: str
    """`credit`·`debit`·`cash`, 그리고 안 고른 줄은 `none`."""
    amount: Money
    share: Decimal | None


def rank_methods(spend: dict[PaymentMethod | None, Money]) -> tuple[list[MethodRow], Money]:
    """결제 수단별 지출을 큰 순으로 세운다.

    분류와 달리 칸이 넷뿐이라 접지 않는다. **안 고른 줄은 언제나 맨 아래**다. 금액으로만
    세우면 그 줄이 맨 위에 오는 사람이 많은데, 그러면 '모르는 것' 이 화면의 결론이 된다.

    음수(그 수단으로 환불이 더 큰 경우)는 뺀다. `rank_breakdown` 과 같은 이유다.
    """
    positive = {key: value for key, value in spend.items() if value.is_positive}

    total = Money.zero()
    for value in positive.values():
        total = total + value

    ordered = sorted(
        positive.items(),
        key=lambda item: (item[0] is None, -item[1].amount),
    )
    rows = [
        MethodRow(
            key=method.value if method is not None else NO_METHOD,
            amount=value,
            share=ratio(value, total),
        )
        for method, value in ordered
    ]
    return rows, total
