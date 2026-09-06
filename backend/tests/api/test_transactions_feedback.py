"""저장 직후 판정에 실제 조회가 붙어 있는지 본다.

순수 함수 테스트는 산식이 맞는지만 본다. 부르는 쪽이 값을 안 넘기면 산식은 통과하면서
운영에서는 영영 안 도는 가지가 된다. 여기서는 진짜 거래를 심고 저장 경로로 왕복시켜
큰 지출의 카테고리 중앙값과 성취 세 근거가 실제 데이터에서 나오는지 확인한다.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.domain.aggregation import TransactionSource, TransactionType
from app.domain.feedback import AchievementKind, FeedbackKind
from app.domain.money import won
from app.domain.period import BudgetPeriod
from app.models import Category, Transaction, User
from app.modules import ledger
from app.modules.budgets import service as budgets
from app.modules.transactions import service as transactions

TZ = ZoneInfo(ledger.DEFAULT_TIMEZONE)
SEPTEMBER = BudgetPeriod.of_month(2026, 9)
# 수요일. 이번 주와 지난주가 각각 사흘씩이라 주 비교의 창 길이가 같다.
WEDNESDAY = date(2026, 9, 16)


def _user(db: Session) -> User:
    user = User(anon_key_hash="feedback-wiring")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _food(categories: list[Category]) -> uuid.UUID:
    return next(row.id for row in categories if row.name == "식비")


def _save(
    db: Session,
    user: User,
    *,
    amount: int,
    on: date,
    today: date,
    category_id: uuid.UUID | None = None,
    source: TransactionSource = TransactionSource.KEYPAD,
    refund_of: uuid.UUID | None = None,
) -> tuple[Transaction, transactions.SaveOutcome]:
    payload: dict = {
        "occurred_at": datetime.combine(on, time(hour=12), tzinfo=TZ),
        "amount": Decimal(amount),
        "type": TransactionType.EXPENSE,
        "source": source,
        "confidence": 1.0,
        "excluded_from_budget": False,
    }
    if category_id is not None:
        payload["category_id"] = category_id
    if refund_of is not None:
        payload["refund_of_transaction_id"] = refund_of
    return transactions.create_transaction(db, user, payload, today=today)


# ── 큰 지출: 카테고리 90일 중앙값 ───────────────────────


def test_카테고리_중앙값의_3배가_큰_지출_기준이_된다(
    db: Session, default_categories: list[Category]
) -> None:
    """식비 중앙값 40,000원이면 기준은 120,000원이다.

    중앙값을 안 넘기면 기준이 예산의 10%(60,000원)로 내려가 이 금액이 큰 지출이 된다.
    """
    user = _user(db)
    food = _food(default_categories)
    budgets.upsert_budget(db, user, SEPTEMBER, Decimal("600000"))
    for day, amount in ((1, 20_000), (2, 40_000), (3, 100_000)):
        _save(db, user, amount=amount, on=date(2026, 9, day), today=WEDNESDAY, category_id=food)

    _, outcome = _save(db, user, amount=119_000, on=WEDNESDAY, today=WEDNESDAY, category_id=food)
    assert outcome.feedback.kind is not FeedbackKind.LARGE_EXPENSE


def test_중앙값의_3배를_넘기면_큰_지출로_잡고_그_기준을_돌려준다(
    db: Session, default_categories: list[Category]
) -> None:
    user = _user(db)
    food = _food(default_categories)
    budgets.upsert_budget(db, user, SEPTEMBER, Decimal("600000"))
    for day, amount in ((1, 20_000), (2, 40_000), (3, 100_000)):
        _save(db, user, amount=amount, on=date(2026, 9, day), today=WEDNESDAY, category_id=food)

    _, outcome = _save(db, user, amount=120_000, on=WEDNESDAY, today=WEDNESDAY, category_id=food)
    assert outcome.feedback.kind is FeedbackKind.LARGE_EXPENSE
    assert outcome.feedback.large_expense_threshold == won(120_000)


def test_방금_저장한_지출은_스스로의_기준이_되지_않는다(
    db: Session, default_categories: list[Category]
) -> None:
    """표본에서 빼지 않으면 그 카테고리 첫 지출은 어떤 금액이어도 큰 지출이 못 된다."""
    user = _user(db)
    _, outcome = _save(
        db,
        user,
        amount=500_000,
        on=WEDNESDAY,
        today=WEDNESDAY,
        category_id=_food(default_categories),
    )
    assert outcome.feedback.kind is FeedbackKind.LARGE_EXPENSE
    assert outcome.feedback.large_expense_threshold == won(30_000)


def test_되돌린_지출은_평소_결제_크기에서_뺀다(
    db: Session, default_categories: list[Category]
) -> None:
    """환불이 카테고리 지출을 깎는다는 집계 규칙을 중앙값도 따른다.

    환불을 빼지 않으면 표본이 60,000/60,000/60,000/20,000/20,000 이라 중앙값이 60,000원,
    기준이 180,000원으로 올라가 이 금액이 큰 지출에서 빠진다.
    """
    user = _user(db)
    food = _food(default_categories)
    refunded = []
    for day, amount in ((1, 60_000), (2, 60_000), (3, 60_000), (4, 20_000), (5, 20_000)):
        tx, _ = _save(
            db, user, amount=amount, on=date(2026, 9, day), today=WEDNESDAY, category_id=food
        )
        if amount == 60_000 and len(refunded) < 2:
            refunded.append(tx.id)
    for offset, target in enumerate(refunded):
        _save(
            db,
            user,
            amount=60_000,
            on=date(2026, 9, 6 + offset),
            today=WEDNESDAY,
            refund_of=target,
        )

    _, outcome = _save(db, user, amount=100_000, on=WEDNESDAY, today=WEDNESDAY, category_id=food)
    assert outcome.feedback.kind is FeedbackKind.LARGE_EXPENSE
    assert outcome.feedback.large_expense_threshold == won(60_000)


# ── 성취: 실제 데이터로 확인되는 것만 ───────────────────


def test_이번_주_카테고리_지출이_지난주보다_줄면_성취다(
    db: Session, default_categories: list[Category]
) -> None:
    user = _user(db)
    food = _food(default_categories)
    _save(
        db,
        user,
        amount=50_000,
        on=WEDNESDAY - timedelta(days=7),
        today=WEDNESDAY,
        category_id=food,
    )
    _save(
        db,
        user,
        amount=10_000,
        on=WEDNESDAY - timedelta(days=1),
        today=WEDNESDAY,
        category_id=food,
    )

    _, outcome = _save(db, user, amount=5_000, on=WEDNESDAY, today=WEDNESDAY, category_id=food)
    assert outcome.feedback.kind is FeedbackKind.ACHIEVEMENT
    evidence = outcome.feedback.achievement
    assert evidence is not None
    assert evidence.kind is AchievementKind.WEEKLY_DECREASE
    assert evidence.decreased_amount == won(35_000)


def test_무지출일이_이틀_이어지면_성취다(db: Session) -> None:
    user = _user(db)
    _save(
        db,
        user,
        amount=0,
        on=WEDNESDAY - timedelta(days=1),
        today=WEDNESDAY,
        source=TransactionSource.NO_SPEND,
    )

    _, outcome = _save(
        db, user, amount=0, on=WEDNESDAY, today=WEDNESDAY, source=TransactionSource.NO_SPEND
    )
    assert outcome.feedback.kind is FeedbackKind.ACHIEVEMENT
    evidence = outcome.feedback.achievement
    assert evidence is not None
    assert evidence.kind is AchievementKind.NO_SPEND_STREAK
    assert evidence.no_spend_days == 2


def test_기록이_없는_날은_무지출일로_세지_않는다(db: Session) -> None:
    """안 쓴 것과 안 적은 것은 다르다. 어제 기록이 없으면 오늘 하루뿐이라 성취가 아니다."""
    user = _user(db)
    _, outcome = _save(
        db, user, amount=0, on=WEDNESDAY, today=WEDNESDAY, source=TransactionSource.NO_SPEND
    )
    assert outcome.feedback.kind is FeedbackKind.MONTH_FACT


def test_월말_예상이_처음으로_예산_아래로_내려오면_성취다(db: Session) -> None:
    """3일에 95,000원을 쓰고 조용히 지나 10일에 예상이 예산 아래로 내려온다.

    3일부터 9일까지의 예상은 316,667원 이상이라 예산 300,000원을 넘고, 10일에야
    297,000원으로 내려온다. 지난 날을 안 보면 이 판정을 '처음'이라고 부를 수 없다.
    """
    user = _user(db)
    today = date(2026, 9, 10)
    budgets.upsert_budget(db, user, SEPTEMBER, Decimal("300000"))
    _save(db, user, amount=95_000, on=date(2026, 9, 3), today=today)

    _, outcome = _save(db, user, amount=4_000, on=today, today=today)
    assert outcome.feedback.kind is FeedbackKind.ACHIEVEMENT
    evidence = outcome.feedback.achievement
    assert evidence is not None
    assert evidence.kind is AchievementKind.PROJECTED_WITHIN_BUDGET


def test_이미_예산_아래였던_날이_있으면_처음이_아니다(db: Session) -> None:
    """3일 예상이 50,000원이라 이미 예산 아래였다. 오늘을 처음이라고 말하지 않는다."""
    user = _user(db)
    today = date(2026, 9, 10)
    budgets.upsert_budget(db, user, SEPTEMBER, Decimal("300000"))
    _save(db, user, amount=5_000, on=date(2026, 9, 3), today=today)

    _, outcome = _save(db, user, amount=4_000, on=today, today=today)
    assert outcome.feedback.kind is FeedbackKind.ON_TRACK
