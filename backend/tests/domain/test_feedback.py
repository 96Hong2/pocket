from datetime import date
from decimal import Decimal

from app.domain.aggregation import TransactionType
from app.domain.budget import BudgetStatus, evaluate_budget
from app.domain.feedback import (
    AchievementEvidence,
    AchievementKind,
    FeedbackInput,
    FeedbackKind,
    SavedTransaction,
    ensure_no_forbidden_words,
    evaluate_feedback,
    find_forbidden_words,
    first_projection_within_budget,
    large_expense_threshold,
    no_spend_streak_evidence,
    weekly_decrease_evidence,
)
from app.domain.money import won
from app.domain.period import BudgetPeriod

PERIOD = BudgetPeriod.of_month(2026, 9)
ACHIEVEMENT = AchievementEvidence(kind=AchievementKind.NO_SPEND_STREAK, no_spend_days=2)


def budget_status(*, budget: int | None, spend: int, day: int = 10) -> BudgetStatus:
    return evaluate_budget(
        budget_amount=None if budget is None else won(budget),
        budgeted_spend=won(spend),
        period=PERIOD,
        today=date(2026, 9, day),
    )


def saved(amount: int, type: TransactionType = TransactionType.EXPENSE):
    return SavedTransaction(amount=won(amount), type=type, category_id="food")


def test_실제로_넘겼을_때만_초과라고_말한다():
    result = evaluate_feedback(
        FeedbackInput(
            saved=saved(50_000),
            month_expense=won(500_000),
            budget_status=budget_status(budget=300_000, spend=500_000),
        )
    )
    assert result.kind is FeedbackKind.OVER_BUDGET
    assert result.over_amount == won(200_000)
    assert result.remaining_budget == won(-200_000)


def test_예측만_넘긴_것은_초과가_아니라_주의다():
    status = budget_status(budget=300_000, spend=200_000)
    assert status.is_over_budget is False
    assert status.projected_month_end == won(600_000)

    result = evaluate_feedback(
        FeedbackInput(saved=saved(50_000), month_expense=won(200_000), budget_status=status)
    )
    assert result.kind is FeedbackKind.PACE_WARNING
    assert result.projected_month_end == won(600_000)


def test_페이스가_1_2배_이상이면_주의다():
    status = budget_status(budget=1_000_000, spend=450_000)
    assert status.pace_ratio == Decimal("1.35")
    result = evaluate_feedback(
        FeedbackInput(saved=saved(5_000), month_expense=won(450_000), budget_status=status)
    )
    assert result.kind is FeedbackKind.PACE_WARNING
    assert result.pace_ratio == Decimal("1.35")


def test_초반_사흘_전에는_주의를_띄우지_않는다():
    result = evaluate_feedback(
        FeedbackInput(
            saved=saved(5_000),
            month_expense=won(500_000),
            budget_status=budget_status(budget=600_000, spend=500_000, day=2),
        )
    )
    assert result.kind is FeedbackKind.ON_TRACK


def test_카테고리_예산을_넘기면_초과다():
    result = evaluate_feedback(
        FeedbackInput(
            saved=saved(20_000),
            month_expense=won(200_000),
            budget_status=budget_status(budget=1_000_000, spend=200_000),
            category_budget_amount=won(150_000),
            category_budgeted_spend=won(180_000),
        )
    )
    assert result.kind is FeedbackKind.OVER_BUDGET
    assert result.over_category_id == "food"
    assert result.over_amount == won(30_000)


def test_우선순위는_초과_주의_큰지출_성취_적정_순이다():
    on_track = budget_status(budget=1_000_000, spend=100_000)
    common = {"month_expense": won(100_000), "budget_status": on_track}

    # 큰 지출이 성취보다 먼저다
    large = evaluate_feedback(
        FeedbackInput(saved=saved(150_000), achievement=ACHIEVEMENT, **common)
    )
    assert large.kind is FeedbackKind.LARGE_EXPENSE
    assert large.large_expense_threshold == won(100_000)

    # 큰 지출이 아니면 성취
    achievement = evaluate_feedback(
        FeedbackInput(saved=saved(5_000), achievement=ACHIEVEMENT, **common)
    )
    assert achievement.kind is FeedbackKind.ACHIEVEMENT
    assert achievement.achievement is ACHIEVEMENT

    # 성취도 없으면 적정
    on_track_result = evaluate_feedback(FeedbackInput(saved=saved(5_000), **common))
    assert on_track_result.kind is FeedbackKind.ON_TRACK
    assert on_track_result.remaining_budget == won(900_000)
    assert on_track_result.remaining_days == 21
    assert on_track_result.daily_allowance == won(42_857)

    # 주의가 큰 지출보다 먼저다
    warning = evaluate_feedback(
        FeedbackInput(
            saved=saved(150_000),
            month_expense=won(450_000),
            budget_status=budget_status(budget=1_000_000, spend=450_000),
            achievement=ACHIEVEMENT,
        )
    )
    assert warning.kind is FeedbackKind.PACE_WARNING


def test_큰_지출_기준은_3만원_중앙값_3배_예산_10프로_중_가장_큰_값이다():
    assert large_expense_threshold(budget_amount=None, category_median_90d=None) == won(30_000)
    assert large_expense_threshold(budget_amount=won(600_000), category_median_90d=None) == won(
        60_000
    )
    assert large_expense_threshold(
        budget_amount=won(600_000), category_median_90d=won(40_000)
    ) == won(120_000)

    # 셋 다 있을 때 어느 하나가 가장 크든 그것이 골라진다
    assert large_expense_threshold(
        budget_amount=won(200_000), category_median_90d=won(5_000)
    ) == won(30_000)
    assert large_expense_threshold(
        budget_amount=won(3_000_000), category_median_90d=won(40_000)
    ) == won(300_000)


def test_지난주보다_줄었을_때만_주간_감소_성취다():
    evidence = weekly_decrease_evidence(this_week=won(15_000), last_week=won(50_000))
    assert evidence is not None
    assert evidence.kind is AchievementKind.WEEKLY_DECREASE
    assert evidence.decreased_amount == won(35_000)

    # 늘었거나 그대로면 성취가 아니다
    assert weekly_decrease_evidence(this_week=won(50_000), last_week=won(15_000)) is None
    assert weekly_decrease_evidence(this_week=won(15_000), last_week=won(15_000)) is None
    # 지난주가 0원이면 견줄 것이 없다
    assert weekly_decrease_evidence(this_week=won(0), last_week=won(0)) is None
    # 카테고리가 없는 거래는 주간 비교 자체를 못 한다
    assert weekly_decrease_evidence(this_week=None, last_week=None) is None


def test_무지출일이_이틀_이어져야_성취다():
    assert no_spend_streak_evidence(1) is None
    evidence = no_spend_streak_evidence(2)
    assert evidence is not None
    assert evidence.kind is AchievementKind.NO_SPEND_STREAK
    assert evidence.no_spend_days == 2
    assert no_spend_streak_evidence(5).no_spend_days == 5


def test_월말_예상이_예산_아래인_날이_앞에_있으면_처음이_아니다():
    budget = won(300_000)
    evidence = first_projection_within_budget(
        today_projected=won(297_000),
        budget_amount=budget,
        earlier_projected=[won(950_000), won(316_667)],
    )
    assert evidence is not None
    assert evidence.kind is AchievementKind.PROJECTED_WITHIN_BUDGET

    # 지난 날 중 하나가 이미 예산 이하였으면 오늘이 처음이 아니다
    assert (
        first_projection_within_budget(
            today_projected=won(297_000),
            budget_amount=budget,
            earlier_projected=[won(950_000), won(280_000)],
        )
        is None
    )
    # 오늘이 예산을 넘으면 내려온 것이 아니다
    assert (
        first_projection_within_budget(
            today_projected=won(320_000), budget_amount=budget, earlier_projected=[]
        )
        is None
    )
    # 예산이 없으면 견줄 기준이 없다
    assert (
        first_projection_within_budget(
            today_projected=won(297_000), budget_amount=None, earlier_projected=[]
        )
        is None
    )


def test_지출이_아니면_큰_지출로_보지_않는다():
    for kind in (
        TransactionType.INCOME,
        TransactionType.TRANSFER,
        TransactionType.REFUND,
    ):
        result = evaluate_feedback(
            FeedbackInput(saved=saved(500_000, kind), month_expense=won(10_000))
        )
        assert result.kind is FeedbackKind.MONTH_FACT


def test_예산이_없으면_큰지출과_성취만_보고_없으면_사실_문장만_남긴다():
    large = evaluate_feedback(FeedbackInput(saved=saved(50_000), month_expense=won(50_000)))
    assert large.kind is FeedbackKind.LARGE_EXPENSE

    achievement = evaluate_feedback(
        FeedbackInput(saved=saved(5_000), month_expense=won(50_000), achievement=ACHIEVEMENT)
    )
    assert achievement.kind is FeedbackKind.ACHIEVEMENT

    fact = evaluate_feedback(FeedbackInput(saved=saved(5_000), month_expense=won(50_000)))
    assert fact.kind is FeedbackKind.MONTH_FACT
    assert fact.month_expense == won(50_000)
    assert fact.remaining_budget is None


def test_사용자를_탓하는_말을_걸러낸다():
    assert find_forbidden_words("이번 달 지출 50,000원이에요") == ()
    assert find_forbidden_words("과소비예요") == ("과소비",)
    assert find_forbidden_words("벌써 또 실패했어요") == ("실패", "벌써", "또")
    # 접속사는 걸리지 않는다
    assert find_forbidden_words("식비 또는 카페") == ()
    assert ensure_no_forbidden_words("남은 예산 100,000원") == "남은 예산 100,000원"
    try:
        ensure_no_forbidden_words("낭비가 심해요")
    except ValueError as error:
        assert "낭비" in str(error)
    else:
        raise AssertionError("금지어를 막지 못했다")
