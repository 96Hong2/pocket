"""조회할 달을 읽는 규칙 한 곳.

받는 질의는 같고 기간을 만드는 길이 둘이다. 달력 화면은 달력 월(`MonthQuery`), 예산·리포트·결산은
그 사용자의 한 달 시작일로 만든 기간(`UserMonthQuery`)이다(ADR-0046). 시작일이 1 이면 둘이 같다.
공유 가계부도 `MonthQuery` 를 받지만 서비스가 이름 달만 읽어 가계부 시작일로 다시 만든다(ADR-0050).

거래 목록·달력·요약·예산 네 곳이 같은 `year`·`month` 질의를 받는다. 각자 파싱하면
어느 한 곳이 반드시 다르게 굴고, 실제로 그랬다. `if year and month` 라고만 쓰면
한쪽만 보낸 요청을 조용히 무시하고 다른 기간을 답한다. 그러면 화면은 2020년을 물었는데
2026년 숫자를 받고도 어긋난 것을 알 방법이 없다.

기간을 만들 수 없는 연도는 여기서 막는다. 도메인이 ValueError 로 죽지 않게 한다.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query

from app.api.deps import CurrentUser
from app.api.errors import ApiError, ErrorCode
from app.domain.period import BudgetPeriod
from app.modules import ledger

__all__ = [
    "MAX_YEAR",
    "MIN_YEAR",
    "MonthQuery",
    "UserMonthQuery",
    "month_period",
    "user_month_period",
]

MIN_YEAR, MAX_YEAR = 2000, 2100


YearQuery = Annotated[int | None, Query(ge=MIN_YEAR, le=MAX_YEAR)]
MonthNumberQuery = Annotated[int | None, Query(ge=1, le=12)]


def _year_month(year: int | None, month: int | None) -> tuple[int, int] | None:
    """한쪽만 오면 422 다. 무시하고 다른 기간을 답하면 어긋난 것을 아무도 모른다."""
    if (year is None) != (month is None):
        raise ApiError(
            ErrorCode.INVALID_REQUEST,
            "조회할 달은 연도와 월을 함께 보내 주세요.",
            status_code=422,
        )
    return (year, month) if year is not None and month is not None else None


def month_period(year: YearQuery = None, month: MonthNumberQuery = None) -> BudgetPeriod | None:
    """둘 다 있으면 그 달력 월, 둘 다 없으면 None(부르는 쪽이 기본값을 정한다)."""
    picked = _year_month(year, month)
    return BudgetPeriod.of_month(*picked) if picked is not None else None


def user_month_period(
    user: CurrentUser, year: YearQuery = None, month: MonthNumberQuery = None
) -> BudgetPeriod | None:
    """둘 다 있으면 이름이 그 달인 사용자의 한 달, 둘 다 없으면 None.

    시작일이 25 면 `year=2026&month=10` 은 9월 25일 ~ 10월 24일이다.
    """
    picked = _year_month(year, month)
    return ledger.period_of_month(user, *picked) if picked is not None else None


MonthQuery = Annotated[BudgetPeriod | None, Depends(month_period)]
"""달력 월. 달을 안 보내면 None. 그때 쓸 기본 기간은 부르는 쪽이 정한다."""

UserMonthQuery = Annotated[BudgetPeriod | None, Depends(user_month_period)]
"""예산·리포트·결산이 받는 사용자의 한 달. 달을 안 보내면 None 이다.

기본값은 `ledger.period_for(user, 오늘)` 로 채운다. 리포트에 엔드포인트를 더할 때도 이걸 받는다.
"""
