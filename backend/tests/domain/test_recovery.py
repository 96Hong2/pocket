"""최근 7일 정리 진행률.

progress 는 자릿수까지 봐야 해서 str 로 견준다. Decimal 은 0 과 0.0000 을 같다고 본다.
"""

from datetime import date

from app.domain.aggregation import TransactionInput, TransactionType
from app.domain.money import won
from app.domain.recovery import RECOVERY_WINDOW_DAYS, build_progress, recovery_window

TODAY = date(2026, 9, 10)
WINDOW = recovery_window(TODAY)


def tx(
    day: int, type: TransactionType = TransactionType.EXPENSE, *, deleted: bool = False
) -> TransactionInput:
    return TransactionInput(
        occurred_on=date(2026, 9, day),
        amount=won(10_000),
        type=type,
        is_deleted=deleted,
    )


def test_창은_오늘까지_7일이다():
    assert WINDOW.start == date(2026, 9, 4)
    assert WINDOW.end == TODAY
    assert WINDOW.total_days == RECOVERY_WINDOW_DAYS


def test_같은_날_여러_건은_하루로_센다():
    result = build_progress([tx(10), tx(10), tx(10)], WINDOW)
    assert result.recorded_days == 1


def test_이체만_있는_날도_정리한_날이다():
    result = build_progress([tx(9, TransactionType.TRANSFER)], WINDOW)
    assert result.recorded_days == 1


def test_지운_거래는_안_센다():
    result = build_progress([tx(8, deleted=True), tx(9)], WINDOW)
    assert result.recorded_days == 1


def test_창_밖의_날은_안_센다():
    result = build_progress([tx(2), tx(3), tx(4)], WINDOW)
    assert result.recorded_days == 1


def test_기록이_없으면_진행이_0_이다():
    result = build_progress([], WINDOW)
    assert result.window_days == RECOVERY_WINDOW_DAYS
    assert result.recorded_days == 0
    assert str(result.progress) == "0.0000"


def test_이레_모두_기록했으면_진행이_1_이다():
    result = build_progress([tx(day) for day in range(4, 11)], WINDOW)
    assert result.recorded_days == 7
    assert str(result.progress) == "1.0000"


def test_나누어떨어지지_않으면_소수_넷째_자리에서_반올림한다():
    two = build_progress([tx(9), tx(10)], WINDOW)
    assert str(two.progress) == "0.2857"

    three = build_progress([tx(8), tx(9), tx(10)], WINDOW)
    assert str(three.progress) == "0.4286"
