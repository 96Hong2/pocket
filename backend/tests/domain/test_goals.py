from datetime import date

from app.domain.goals import GoalInput, evaluate_goal, months_left
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
