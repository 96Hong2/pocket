"""공유 가계부 정산.

기대값은 PRD 예시에서 손으로 셈한 것이다. 출력에서 옮겨 적지 않는다.
여기가 틀리면 「준호가 은홍에게 12,500원 보내면 반반이에요」 가 틀린 돈을 말한다.
"""

from datetime import UTC, datetime

from app.domain.books import SettleRule
from app.domain.money import won
from app.domain.settlement import (
    MemberBalance,
    SettleEntry,
    SettleMember,
    Settlement,
    Transfer,
    changed_since,
    settle,
    snapshot_of,
)

# 2026년 9월을 한국 시간으로 끊은 [시작, 끝).
SEPT_START = datetime(2026, 8, 31, 15, 0, tzinfo=UTC)
SEPT_END = datetime(2026, 9, 30, 15, 0, tzinfo=UTC)


def at(month: int, day: int) -> datetime:
    return datetime(2026, month, day, 3, 0, tzinfo=UTC)


EUNHONG = SettleMember("eunhong", joined_at=at(8, 1), is_creator=True)
JUNHO = SettleMember("junho", joined_at=at(8, 2))
SEOYEON = SettleMember("seoyeon", joined_at=at(8, 3))
JIHOON = SettleMember("jihoon", joined_at=at(8, 4))


def paid(member: SettleMember | None, amount: int) -> SettleEntry:
    return SettleEntry(amount=won(amount), paid_by=member.member_id if member else None)


def even(members: list[SettleMember], entries: list[SettleEntry]) -> Settlement:
    return settle(members, entries, SettleRule.EVEN, start=SEPT_START, end=SEPT_END)


def test_둘이_반반이면_덜_낸_사람이_차이의_절반을_보낸다():
    """PRD: 합계 584,800 → 한 사람 몫 292,400 → 은홍 +12,500, 준호 -12,500.

    은홍 304,900 = 200,000 + 104,900, 준호 279,900. 304,900 - 292,400 = 12,500.
    """
    result = settle(
        [EUNHONG, JUNHO],
        [paid(EUNHONG, 200_000), paid(EUNHONG, 104_900), paid(JUNHO, 279_900)],
        SettleRule.EVEN,
        start=SEPT_START,
        end=SEPT_END,
    )

    assert result.total == won(584_800)
    assert result.members == [
        MemberBalance("eunhong", won(304_900), won(292_400), won(12_500)),
        MemberBalance("junho", won(279_900), won(292_400), won(-12_500)),
    ]
    assert result.transfers == [Transfer("junho", "eunhong", won(12_500))]


def test_넷이_여행_정산이면_PRD_의_세_건이_나온다():
    """PRD 의 보낼 돈 세 건에서 거꾸로 셈한 낸 돈이다.

    합계 1,000,000 → 몫 250,000.
    은홍 504,000 → +254,000, 준호 280,000 → +30,000,
    서연 68,000 → -182,000, 지훈 148,000 → -102,000.
    가장 모자란 서연이 가장 많이 받을 은홍에게 182,000(은홍 72,000 남음),
    지훈이 은홍에게 72,000(지훈 30,000 남음), 지훈이 준호에게 30,000.
    """
    result = settle(
        [EUNHONG, JUNHO, SEOYEON, JIHOON],
        [
            paid(EUNHONG, 504_000),
            paid(JUNHO, 280_000),
            paid(SEOYEON, 68_000),
            paid(JIHOON, 148_000),
        ],
        SettleRule.EVEN,
    )

    assert result.total == won(1_000_000)
    assert [m.share for m in result.members] == [won(250_000)] * 4
    assert [m.balance for m in result.members] == [
        won(254_000),
        won(30_000),
        won(-182_000),
        won(-102_000),
    ]
    assert result.transfers == [
        Transfer("seoyeon", "eunhong", won(182_000)),
        Transfer("jihoon", "eunhong", won(72_000)),
        Transfer("jihoon", "junho", won(30_000)),
    ]


def test_나누어_떨어지지_않는_원은_만든_사람이_진다():
    """100,000 ÷ 3 = 33,333 이고 1원이 남는다. 만든 사람 몫이 33,334 라 합이 100,000 이다."""
    result = settle(
        [JUNHO, EUNHONG, SEOYEON],
        [paid(EUNHONG, 100_000)],
        SettleRule.EVEN,
        start=SEPT_START,
        end=SEPT_END,
    )

    shares = {m.member_id: m.share for m in result.members}
    assert shares == {"eunhong": won(33_334), "junho": won(33_333), "seoyeon": won(33_333)}
    assert sum(int(s) for s in shares.values()) == 100_000
    assert result.transfers == [
        Transfer("junho", "eunhong", won(33_333)),
        Transfer("seoyeon", "eunhong", won(33_333)),
    ]


def test_만든_사람이_그_달_멤버가_아니면_남는_원은_가장_먼저_들어온_사람이_진다():
    """만든 사람은 8월에 나갔다. 9월은 준호와 서연 둘이 100,001 을 나눠 50,001 / 50,000."""
    gone_creator = SettleMember("creator", joined_at=at(8, 1), left_at=at(8, 20), is_creator=True)
    result = even([gone_creator, SEOYEON, JUNHO], [paid(SEOYEON, 100_001)])

    assert [(m.member_id, m.share) for m in result.members] == [
        ("junho", won(50_001)),
        ("seoyeon", won(50_000)),
    ]


def test_중간에_나간_멤버는_그_달_몫을_지고_끝난_뒤_들어온_멤버는_빠진다():
    """준호는 9월 10일에 나갔고 서연은 10월 2일에 들어왔다. 9월은 은홍과 준호가 나눈다.

    90,000 ÷ 2 = 45,000. 준호는 낸 돈이 없으니 45,000 을 보낸다.
    """
    left_junho = SettleMember("junho", joined_at=at(8, 2), left_at=at(9, 10))
    late_seoyeon = SettleMember("seoyeon", joined_at=at(10, 2))
    result = even([EUNHONG, left_junho, late_seoyeon], [paid(EUNHONG, 90_000)])

    assert [m.member_id for m in result.members] == ["eunhong", "junho"]
    assert result.transfers == [Transfer("junho", "eunhong", won(45_000))]


def test_나갔다가_다시_들어온_사람은_비어_있던_달의_몫을_지지_않는다():
    """서연은 8월 15일에 나갔다가 10월 2일에 다시 들어왔다. 9월은 은홍과 준호가 나눈다.

    90,000 ÷ 2 = 45,000. 준호는 낸 돈이 없으니 45,000 을 보낸다.
    """
    back = SettleMember(
        "seoyeon",
        joined_at=at(8, 3),
        spans=((at(8, 3), at(8, 15)), (at(10, 2), None)),
    )
    result = even([EUNHONG, JUNHO, back], [paid(EUNHONG, 90_000)])

    assert [m.member_id for m in result.members] == ["eunhong", "junho"]
    assert result.transfers == [Transfer("junho", "eunhong", won(45_000))]


def test_그_달_전에_나간_멤버는_빠진다():
    gone = SettleMember("junho", joined_at=at(8, 2), left_at=at(8, 20))
    result = even([EUNHONG, gone], [paid(EUNHONG, 50_000)])

    assert [m.member_id for m in result.members] == ["eunhong"]
    assert result.transfers == []


def test_그_달에_돈을_낸_사람은_멤버_기간이_어긋나도_넣는다():
    """낸 돈이 허공에 뜨면 합계와 낸 돈의 합이 안 맞는다."""
    gone = SettleMember("junho", joined_at=at(8, 2), left_at=at(8, 20))
    result = even([EUNHONG, gone], [paid(gone, 40_000)])

    assert [(m.member_id, m.balance) for m in result.members] == [
        ("eunhong", won(-20_000)),
        ("junho", won(20_000)),
    ]


def test_같이_모은_돈이면_합계만_있고_나눌_것이_없다():
    result = settle(
        [EUNHONG, JUNHO],
        [paid(EUNHONG, 10_000), paid(JUNHO, 5_000)],
        SettleRule.NONE,
        start=SEPT_START,
        end=SEPT_END,
    )

    assert result.total == won(15_000)
    assert result.members == []
    assert result.transfers == []


def test_낸_사람이_없어진_기록은_합계에만_든다():
    """20,000 을 둘이 나눠 10,000 씩. 은홍이 낸 12,000 만 누군가의 낸 돈이다."""
    result = even([EUNHONG, JUNHO], [paid(EUNHONG, 12_000), paid(None, 8_000)])

    assert result.total == won(20_000)
    assert [(m.member_id, m.paid, m.balance) for m in result.members] == [
        ("eunhong", won(12_000), won(2_000)),
        ("junho", won(0), won(-10_000)),
    ]
    assert result.transfers == [Transfer("junho", "eunhong", won(2_000))]


def test_딱_맞으면_보낼_돈이_없다():
    result = even([EUNHONG, JUNHO], [paid(EUNHONG, 30_000), paid(JUNHO, 30_000)])

    assert result.transfers == []


def test_모자란_금액이_같으면_먼저_들어온_사람이_먼저_보낸다():
    """준호와 서연이 똑같이 10,000 씩 모자라다. 같은 입력이면 늘 같은 순서여야 한다."""
    result = even([SEOYEON, EUNHONG, JUNHO], [paid(EUNHONG, 30_000)])

    assert result.transfers == [
        Transfer("junho", "eunhong", won(10_000)),
        Transfer("seoyeon", "eunhong", won(10_000)),
    ]


def test_끝낸_뒤_보낼_돈이_같으면_순서가_달라도_바뀐_것이_아니다():
    transfers = [
        Transfer("seoyeon", "eunhong", won(182_000)),
        Transfer("jihoon", "eunhong", won(72_000)),
    ]
    saved = snapshot_of(transfers)

    assert saved == [
        {"from": "jihoon", "to": "eunhong", "amount": "72000"},
        {"from": "seoyeon", "to": "eunhong", "amount": "182000"},
    ]
    assert changed_since(list(reversed(transfers)), saved) is False
    assert changed_since([Transfer("seoyeon", "eunhong", won(182_000))], saved) is True
    assert changed_since([], saved) is True
