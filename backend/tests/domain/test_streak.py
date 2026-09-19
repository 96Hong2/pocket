"""이어서 적은 날.

홈이 이 값으로 7일마다 한 번 축하를 띄운다. 여기가 틀리면 축하가 매일 뜨거나(시작일이
밀릴 때) 아예 안 뜬다(오늘 안 적었다고 어제까지를 버릴 때).
"""

from datetime import date, timedelta

from app.domain.aggregation import TransactionInput, TransactionType
from app.domain.money import won
from app.domain.streak import STREAK_LOOKBACK_DAYS, Streak, current_streak

TODAY = date(2026, 9, 20)


def on(days_ago: int, *, deleted: bool = False, amount: int = 10_000) -> TransactionInput:
    return TransactionInput(
        occurred_on=TODAY - timedelta(days=days_ago),
        amount=won(amount),
        type=TransactionType.EXPENSE,
        is_deleted=deleted,
    )


def run(first_days_ago: int, last_days_ago: int = 0) -> list[TransactionInput]:
    """`first_days_ago` 일 전부터 `last_days_ago` 일 전까지 하루 한 건씩."""
    return [on(n) for n in range(last_days_ago, first_days_ago + 1)]


def test_오늘까지_이레를_이었으면_7일이다():
    assert current_streak(run(6), TODAY) == Streak(started_on=date(2026, 9, 14), days=7)


def test_오늘_아직_안_적었으면_어제까지_이은_것을_버리지_않는다():
    """아침에 연 사람에게 어제까지 이은 이레를 없던 일로 만들지 않는다."""
    assert current_streak(run(7, last_days_ago=1), TODAY) == Streak(
        started_on=date(2026, 9, 13), days=7
    )


def test_어제도_비었으면_이어진_것이_없다():
    assert current_streak(run(9, last_days_ago=2), TODAY) is None


def test_중간에_빈_날이_있으면_그_뒤부터_센다():
    rows = run(2) + run(10, last_days_ago=4)
    assert current_streak(rows, TODAY) == Streak(started_on=date(2026, 9, 18), days=3)


def test_같은_날_여러_건과_무지출_표시도_하루로_센다():
    rows = [on(0), on(0), on(1, amount=0), on(2)]
    assert current_streak(rows, TODAY) == Streak(started_on=date(2026, 9, 18), days=3)


def test_지운_기록은_이어진_날이_아니다():
    rows = [on(0), on(1, deleted=True), on(2)]
    assert current_streak(rows, TODAY) == Streak(started_on=TODAY, days=1)


def test_앞날짜로_미리_적은_기록은_세지_않는다():
    """카드값을 다음 주 날짜로 적어 뒀다고 그 날까지 이은 것이 아니다."""
    rows = [on(-3), on(-1), on(0)]
    assert current_streak(rows, TODAY) == Streak(started_on=TODAY, days=1)


def test_8주를_채운_날까지는_시작일을_안다():
    known = STREAK_LOOKBACK_DAYS - 1
    assert current_streak(run(known - 1), TODAY) == Streak(
        started_on=TODAY - timedelta(days=known - 1), days=known
    )


def test_읽은_창_끝까지_이어졌으면_시작일을_지어내지_않는다():
    """지어내면 창이 하루 밀릴 때마다 시작일도 밀려, 화면이 매일 새 축하를 띄운다."""
    assert current_streak(run(STREAK_LOOKBACK_DAYS + 10), TODAY) is None
