"""공유 가계부 정산. DB 도 HTTP 도 모른다.

누가 얼마를 냈고 한 사람 몫이 얼마인지, 그래서 누가 누구에게 얼마를 보내면 되는지를 낸다.
문장은 화면이 만든다.

- 그 기간에 한 번이라도 멤버였던 사람이 나눈다. 중간에 나간 사람도 그 달 몫을 진다.
  그 기간에 돈을 낸 사람은 멤버 기간이 어긋나도 넣는다. 낸 돈이 허공에 뜨지 않게.
- 낸 사람 줄이 없어진 기록은 합계에는 들고 누구의 낸 돈도 아니다.
- 나갔다 다시 들어온 사람은 멤버였던 기간마다 따로 본다. 비어 있던 달의 몫은 지지 않는다.
- 몫은 내림으로 나누고 남는 원은 가계부를 만든 사람이 진다. 그래야 몫의 합이 합계와 맞는다.
  관리자는 나중에 바뀔 수 있어서, 관리자로 정하면 끝낸 지난 정산이 1원씩 흔들린다.
- 비율이 있고 그 기간 사람과 비율을 정한 사람이 정확히 같으면 비율대로 나눈다. 아니면 똑같이.
  비율 몫도 내림이고, 남는 원은 비율이 0 이 아닌 만든 사람이, 없으면 비율이 가장 큰 사람이 진다.
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
    "split_shares",
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
    # 비율로 나눴으면 그 사람 비율, 똑같이 나눴으면 None.
    percent: int | None = None


@dataclass(frozen=True)
class Transfer:
    from_member_id: str
    to_member_id: str
    amount: Money


@dataclass(frozen=True)
class Settlement:
    rule: SettleRule
    total: Money
    # 들어온 순서. 각자 입금(none)이면 빈 목록이다.
    members: list[MemberBalance]
    transfers: list[Transfer]
    # 비율로 나눴나. 비율이 없거나 사람이 어긋나 똑같이 나눴으면 False.
    ratio: bool = False


def settle(
    members: Sequence[SettleMember],
    entries: Iterable[SettleEntry],
    rule: SettleRule,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    percents: Mapping[str, int] | None = None,
) -> Settlement:
    """[start, end) 기간의 정산. 여행 가계부는 기간 없이(둘 다 None) 전체를 본다.

    `percents` 는 멤버 id 별 비율(합 100)이다. 그 기간 사람과 키가 같을 때만 쓴다.
    """
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

    shares, used = split_shares(total, people, percents)
    balances = [
        MemberBalance(
            member_id=m.member_id,
            paid=paid[m.member_id],
            share=shares[m.member_id],
            balance=paid[m.member_id] - shares[m.member_id],
            percent=used[m.member_id] if used is not None else None,
        )
        for m in people
    ]
    return Settlement(
        rule=rule,
        total=total,
        members=balances,
        transfers=_transfers(balances),
        ratio=used is not None,
    )


def split_shares(
    total: Money, people: Sequence[SettleMember], percents: Mapping[str, int] | None
) -> tuple[dict[str, Money], Mapping[str, int] | None]:
    """합계를 사람마다 나눈 몫과, 실제로 쓴 비율(똑같이 나눴으면 None).

    정산과 회비가 같이 쓴다. 비율 키가 사람과 정확히 같지 않으면 똑같이 나눈다.
    남은 비율을 짐작해 나누면 누구도 정하지 않은 몫이 생긴다. `people` 은 들어온 순서다.
    """
    if not people:
        return {}, None
    ids = {m.member_id for m in people}
    if percents is not None and set(percents) == ids and sum(percents.values()) == 100:
        return _ratio_shares(people, total, percents), percents
    return _even_shares(people, total), None


def _even_shares(people: Sequence[SettleMember], total: Money) -> dict[str, Money]:
    """똑같이 나눈 몫. 남는 원은 만든 사람이, 그 기간에 없으면 가장 먼저 들어온 사람이 진다."""
    base = total.divide_floor(len(people))
    remainder = total - base.scale(len(people))
    bearer = next((m for m in people if m.is_creator), people[0]).member_id
    return {m.member_id: base + remainder if m.member_id == bearer else base for m in people}


def _ratio_shares(
    people: Sequence[SettleMember], total: Money, percents: Mapping[str, int]
) -> dict[str, Money]:
    """비율 몫. 0% 인 사람에게 남는 원을 지우지 않는다. 안 내기로 한 사람이 1원을 내게 된다."""
    shares = {
        m.member_id: Money(total.amount * percents[m.member_id]).divide_floor(100) for m in people
    }
    remainder = total - Money.total(shares.values())
    paying = [m for m in people if percents[m.member_id] > 0]
    creator = next((m for m in paying if m.is_creator), None)
    # max 는 같으면 앞의 것을 준다. people 이 들어온 순서라 먼저 들어온 사람이다.
    bearer = creator or max(paying, key=lambda m: percents[m.member_id])
    shares[bearer.member_id] = shares[bearer.member_id] + remainder
    return shares


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
