"""월 리포트 응답.

한 응답에 그 화면이 그리는 것을 전부 담는다. 화면이 더할 재료가 응답 안에 없으면
화면이 더할 수가 없다. 두 곳에서 세면 도넛과 헤드라인이 서로 다른 말을 한다.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.api.amounts import ratio_out
from app.domain.money import Money
from app.domain.report import BreakdownRow
from app.modules.budgets.schemas import BudgetStateOut

__all__ = [
    "BreakdownRowOut",
    "MonthlyReportOut",
    "PeriodComparisonOut",
    "TrendPointOut",
    "to_breakdown",
    "to_comparison",
]


class BreakdownRowOut(BaseModel):
    """도넛 조각 하나이자 목록 한 줄. 둘이 같은 목록을 써야 순서가 안 어긋난다."""

    # 'uncategorized' · 'rolled_up' · 카테고리 uuid. 화면의 목록 키이자 라벨 분기다.
    key: str
    category_id: uuid.UUID | None
    amount: Decimal
    # 조각 합에서 차지하는 비중. 화면이 amount/total 을 다시 하지 않게 서버가 준다.
    share: Decimal | None
    # 접은 줄이 몇 개를 대신하는지. 접은 줄이 아니면 0.
    rolled_count: int


class TrendPointOut(BaseModel):
    """추이 막대 하나. 기록이 없는 달도 0 으로 들어온다."""

    period_start: date
    period_end: date
    expense: Decimal
    income: Decimal


class PeriodComparisonOut(BaseModel):
    """지난 기간과의 비교.

    **날짜 네 개를 함께 싣는다.** 숫자만 주면 서버가 달 전체를 세고 있어도 화면은
    그럴듯해 보인다. 화면이 "8월 1~5일" 을 글자로 찍으면 창이 틀린 것이 눈에 보인다.
    """

    current_start: date
    current_end: date
    previous_start: date
    previous_end: date
    current_expense: Decimal
    previous_expense: Decimal
    # 이번 - 지난. 음수면 덜 썼다는 뜻이다.
    delta: Decimal
    # 지난 기간 대비 증감률. 지난 기간이 0 이면 None(나눌 수 없다).
    delta_ratio: Decimal | None


class MonthlyReportOut(BaseModel):
    period_start: date
    period_end: date
    # 이 달에 거래가 한 건이라도 있나. **이체도 센다.** 합계가 0 인 것과 기록이 없는 것은
    # 다르다는 뜻이라, 집계에서 빠지는 이체만 있어도 빈 달 안내를 띄우지 않는다.
    has_any_transaction: bool

    month_expense: Decimal
    month_income: Decimal
    monthly_delta: Decimal
    budget: BudgetStateOut

    # 도넛과 목록이 함께 쓰는 조각. 소비 모드와 수입 모드가 각자 있다.
    expense_breakdown: list[BreakdownRowOut]
    income_breakdown: list[BreakdownRowOut]
    # 조각 합. 환불이 지출보다 큰 분류를 뺀 값이라 month_expense 와 다를 수 있다.
    expense_breakdown_total: Decimal
    income_breakdown_total: Decimal

    # 항상 여섯 개. 오래된 것부터. 기록이 없는 달도 0 으로 넣는다.
    # 빈 달을 빼면 막대가 밀려 다른 달로 읽힌다.
    trend: list[TrendPointOut]

    # 지난달 같은 날짜까지. 아직 오지 않은 달이거나 양쪽 창이 다 0 원이면 null.
    comparison: PeriodComparisonOut | None
    # 이번 주 대 지난주 같은 요일까지. 조회한 달이 오늘이 속한 달이 아니거나
    # 양쪽 창이 다 0 원이면 null.
    weeks: PeriodComparisonOut | None


def to_breakdown(rows: list[BreakdownRow]) -> list[BreakdownRowOut]:
    return [
        BreakdownRowOut(
            key=row.key,
            category_id=uuid.UUID(row.category_id) if row.category_id else None,
            amount=row.amount.amount,
            share=ratio_out(row.share),
            rolled_count=row.rolled_count,
        )
        for row in rows
    ]


def to_comparison(
    *,
    current: tuple[date, date],
    previous: tuple[date, date],
    current_expense: Money,
    previous_expense: Money,
) -> PeriodComparisonOut:
    delta = current_expense - previous_expense
    return PeriodComparisonOut(
        current_start=current[0],
        current_end=current[1],
        previous_start=previous[0],
        previous_end=previous[1],
        current_expense=current_expense.amount,
        previous_expense=previous_expense.amount,
        delta=delta.amount,
        # 지난 기간이 0 이면 "몇 % 늘었다" 를 말할 수 없다. 0 으로 붙이면 거짓말이 된다.
        delta_ratio=ratio_out(
            delta.amount / previous_expense.amount if previous_expense.is_positive else None
        ),
    )
