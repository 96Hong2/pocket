from datetime import date
from decimal import Decimal

from app.domain.goals import (
    GoalInput,
    evaluate_goal,
    monthly_pace,
    months_left,
    months_spanned,
)
from app.domain.money import Money, won

TODAY = date(2026, 9, 3)


def goal(**overrides) -> GoalInput:
    values = {
        "target_amount": won(5_000_000),
        "current_amount": won(1_200_000),
        "today": TODAY,
        "target_date": date(2026, 12, 31),
        "monthly_contribution": None,
    }
    values.update(overrides)
    return GoalInput(**values)


def test_이번_달을_포함해_남은_달을_센다():
    assert months_left(TODAY, date(2026, 12, 31)) == 4
    assert months_left(TODAY, date(2026, 9, 30)) == 1
    assert months_left(TODAY, date(2027, 3, 1)) == 7
    assert months_left(TODAY, date(2026, 8, 31)) == 0


def test_남은_금액과_필요_월저축액을_낸다():
    result = evaluate_goal(goal())
    assert result.remaining == won(3_800_000)
    assert result.months_left == 4
    assert result.required_monthly_saving == won(950_000)
    assert result.is_achieved is False
    assert result.is_overdue is False


def test_필요_월저축액은_모자라지_않게_올림한다():
    result = evaluate_goal(goal(target_amount=won(1_000_001), current_amount=won(1)))
    assert result.required_monthly_saving == won(250_000)


def test_기여_이력이_없으면_도달_예상을_내지_않는다():
    assert evaluate_goal(goal()).eta_months is None
    assert evaluate_goal(goal(monthly_contribution=Money.zero())).eta_months is None


def test_지금_페이스로_몇_달_걸리는지_올림해서_낸다():
    result = evaluate_goal(goal(monthly_contribution=won(300_000)))
    assert result.eta_months == 13


def test_기한이_없으면_남은_달도_필요_월저축액도_없다():
    result = evaluate_goal(goal(target_date=None))
    assert result.months_left is None
    assert result.required_monthly_saving is None
    assert result.remaining == won(3_800_000)


def test_기한이_지났으면_알려주되_월저축액을_만들어내지_않는다():
    result = evaluate_goal(goal(target_date=date(2026, 8, 31)))
    assert result.months_left == 0
    assert result.required_monthly_saving is None
    assert result.is_overdue is True


def test_이미_모았으면_남은_금액은_0_이다():
    result = evaluate_goal(goal(current_amount=won(5_500_000), monthly_contribution=won(300_000)))
    assert result.remaining == Money.zero()
    assert result.is_achieved is True
    assert result.required_monthly_saving is None
    assert result.eta_months == 0
    assert result.is_overdue is False


def test_진행률은_0_과_1_사이에서_멈춘다():
    """게이지가 그릴 값이다. 1 을 넘겨 주면 막대가 칸을 넘어 그려진다."""
    assert evaluate_goal(goal()).progress == Decimal("0.24")
    assert evaluate_goal(goal(current_amount=won(6_000_000))).progress == Decimal(1)
    assert evaluate_goal(goal(current_amount=Money.zero())).progress == Decimal(0)


def test_기여가_없으면_페이스를_내지_않는다():
    assert monthly_pace([], TODAY) is None


def test_같은_달_기여는_합이_그대로_페이스다():
    pace = monthly_pace(
        [(date(2026, 9, 1), won(200_000)), (date(2026, 9, 20), won(100_000))], TODAY
    )
    assert pace == won(300_000)


def test_페이스는_첫_기여_달부터_이번_달까지의_달_수로_나눈다():
    """7·8·9 세 달에 걸쳐 600,000 을 모았으니 한 달에 200,000 이다."""
    pace = monthly_pace(
        [(date(2026, 7, 10), won(300_000)), (date(2026, 9, 1), won(300_000))], TODAY
    )
    assert pace == won(200_000)


def test_페이스는_내림한다():
    """올리면 실제보다 빠른 속도가 되어 아직 못 닿을 시점을 닿는다고 말한다."""
    assert monthly_pace([(date(2026, 8, 1), won(100_000))], TODAY) == won(50_000)


def test_앞날짜로_적은_기여만_있어도_한_달로_센다():
    """0 이나 음수로 나누는 자리를 만들지 않는다."""
    assert monthly_pace([(date(2026, 12, 1), won(90_000))], TODAY) == won(90_000)
    assert months_spanned(date(2026, 12, 1), TODAY) == 1
