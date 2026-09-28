"""공유 가계부 정산. DB 도 HTTP 도 모른다.

누가 얼마를 냈고 한 사람 몫이 얼마인지, 그래서 누가 누구에게 얼마를 보내면 되는지를 낸다.
문장은 화면이 만든다.

- 그 기간에 한 번이라도 멤버였던 사람이 나눈다. 중간에 나간 사람도 그 달 몫을 진다.
  그 기간에 돈을 낸 사람은 멤버 기간이 어긋나도 넣는다. 낸 돈이 허공에 뜨지 않게.
- 낸 사람 줄이 없어진 기록은 합계에는 들고 누구의 낸 돈도 아니다.
- 나갔다 다시 들어온 사람은 멤버였던 기간마다 따로 본다. 비어 있던 달의 몫은 지지 않는다.
- 몫은 내림으로 나누고 남는 원은 가계부를 만든 사람이 진다. 그래야 몫의 합이 합계와 맞는다.
  관리자는 나중에 바뀔 수 있어서, 관리자로 정하면 끝낸 지난 정산이 1원씩 흔들린다.
- 보낼 돈은 가장 많이 모자란 사람과 가장 많이 받을 사람을 차례로 잇는다. 건수는 n-1 을
  넘지 않는다. 같으면 먼저 들어온 사람이 앞이라 같은 입력이면 늘 같은 답이다.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from app.domain.books import SettleRule
from app.domain.money import Money

__all__ = [
    "MemberBalance",
    "SettleEntry",
    "SettleMember",
    "Settlement",
    "Transfer",
    "changed_since",
    "settle",
    "snapshot_of",
]


@dataclass(frozen=True)
class SettleMember:
    member_id: str
    joined_at: datetime
    left_at: datetime | None = None
    # 가계부를 만든 사람. 남는 원을 진다.
    is_creator: bool = False
    # 나갔다 다시 들어온 사람의 멤버였던 기간들 (들어온 때, 나간 때).
    # 비우면 joined_at 부터 left_at 까지 하나다.
    spans: tuple[tuple[datetime, datetime | None], ...] = ()

    def active_between(self, start: datetime | None, end: datetime | None) -> bool:
        """[start, end) 에 한 번이라도 멤버였나. 둘 다 None 이면 기간 없이 늘 참이다."""
        spans = self.spans or ((self.joined_at, self.left_at),)
        return any(_overlaps(joined, left, start, end) for joined, left in spans)


def _overlaps(
    joined: datetime, left: datetime | None, start: datetime | None, end: datetime | None
) -> bool:
    if end is not None and joined >= end:
        return False
    return not (start is not None and left is not None and left < start)


@dataclass(frozen=True)
class SettleEntry:
    amount: Money
    paid_by: str | None


@dataclass(frozen=True)
class MemberBalance:
    member_id: str
    paid: Money
    share: Money
    # 낸 돈 - 몫. 양수면 받을 사람, 음수면 보낼 사람.
    balance: Money


@dataclass(frozen=True)
class Transfer:
    from_member_id: str
    to_member_id: str
    amount: Money


@dataclass(frozen=True)
class Settlement:
    rule: SettleRule
    total: Money
    # 들어온 순서. 같이 모은 돈이면 빈 목록이다.
    members: list[MemberBalance]
    transfers: list[Transfer]


def settle(
    members: Sequence[SettleMember],
    entries: Iterable[SettleEntry],
    rule: SettleRule,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
) -> Settlement:
    """[start, end) 기간의 정산. 여행 가계부는 기간 없이(둘 다 None) 전체를 본다."""
    rows = list(entries)
    total = Money.total(row.amount for row in rows)
    if rule is SettleRule.NONE:
        return Settlement(rule=rule, total=total, members=[], transfers=[])

    payers = {row.paid_by for row in rows if row.paid_by is not None}
    people = sorted(
        (m for m in members if m.member_id in payers or m.active_between(start, end)),
        key=lambda m: (m.joined_at, m.member_id),
    )
    if not people:
        return Settlement(rule=rule, total=total, members=[], transfers=[])

    paid: dict[str, Money] = {m.member_id: Money.zero() for m in people}
    for row in rows:
        if row.paid_by in paid:
            paid[row.paid_by] = paid[row.paid_by] + row.amount

    shares = _even_shares(people, total)
    balances = [
        MemberBalance(
            member_id=m.member_id,
            paid=paid[m.member_id],
            share=shares[m.member_id],
            balance=paid[m.member_id] - shares[m.member_id],
        )
        for m in people
    ]
    return Settlement(rule=rule, total=total, members=balances, transfers=_transfers(balances))


def _even_shares(people: Sequence[SettleMember], total: Money) -> dict[str, Money]:
    """똑같이 나눈 몫. 남는 원은 만든 사람이, 그 기간에 없으면 가장 먼저 들어온 사람이 진다."""
    base = total.divide_floor(len(people))
    remainder = total - base.scale(len(people))
    bearer = next((m for m in people if m.is_creator), people[0]).member_id
    return {m.member_id: base + remainder if m.member_id == bearer else base for m in people}


def _transfers(balances: Sequence[MemberBalance]) -> list[Transfer]:
    order = {row.member_id: index for index, row in enumerate(balances)}
    left = {row.member_id: row.balance for row in balances}
    found: list[Transfer] = []
    while True:
        debtors = [key for key, value in left.items() if value.is_negative]
        creditors = [key for key, value in left.items() if value.is_positive]
        if not debtors or not creditors:
            return found
        debtor = min(debtors, key=lambda key: (left[key].amount, order[key]))
        creditor = min(creditors, key=lambda key: (-left[key].amount, order[key]))
        amount = min(-left[debtor], left[creditor])
        found.append(Transfer(from_member_id=debtor, to_member_id=creditor, amount=amount))
        left[debtor] = left[debtor] + amount
        left[creditor] = left[creditor] - amount


def snapshot_of(transfers: Iterable[Transfer]) -> list[dict[str, str]]:
    """끝낸 때 적어 둘 모양. 순서에 기대지 않게 정렬한다."""
    return sorted(
        (
            {"from": t.from_member_id, "to": t.to_member_id, "amount": str(int(t.amount))}
            for t in transfers
        ),
        key=lambda row: (row["from"], row["to"], row["amount"]),
    )


def changed_since(
    current: Iterable[Transfer],
    snapshot: Sequence[Mapping[str, object]],
    aliases: Mapping[str, str] | None = None,
) -> bool:
    """끝낸 뒤 보낼 돈이 달라졌나. 합계가 같아도 누가 누구에게가 바뀌면 달라진 것이다.

    `aliases` 는 예전 멤버 id 를 지금 그 사람을 대표하는 id 로 바꾼다. 나갔다 다시 들어오면
    대표 id 가 바뀌어서, 안 바꾸면 기록이 그대로여도 달라진 것으로 읽힌다.
    """
    names = aliases or {}

    def now_id(value: object) -> str:
        return names.get(str(value), str(value))

    saved = sorted(
        (
            {
                "from": now_id(row.get("from")),
                "to": now_id(row.get("to")),
                "amount": str(row.get("amount")),
            }
            for row in snapshot
        ),
        key=lambda row: (row["from"], row["to"], row["amount"]),
    )
    return snapshot_of(current) != saved
