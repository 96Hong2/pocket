"""조회할 달을 읽는 규칙 한 곳.

거래 목록·달력·요약·예산 네 곳이 같은 `year`·`month` 질의를 받는다. 각자 파싱하면
어느 한 곳이 반드시 다르게 굴고, 실제로 그랬다. `if year and month` 라고만 쓰면
한쪽만 보낸 요청을 조용히 무시하고 다른 기간을 답한다. 그러면 화면은 2020년을 물었는데
2026년 숫자를 받고도 어긋난 것을 알 방법이 없다.

기간을 만들 수 없는 연도는 여기서 막는다. 도메인이 ValueError 로 죽지 않게 한다.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query

from app.api.errors import ApiError, ErrorCode
from app.domain.period import BudgetPeriod

__all__ = ["MAX_YEAR", "MIN_YEAR", "MonthQuery", "month_period"]

MIN_YEAR, MAX_YEAR = 2000, 2100


def month_period(
    year: Annotated[int | None, Query(ge=MIN_YEAR, le=MAX_YEAR)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
) -> BudgetPeriod | None:
    """둘 다 있으면 그 달, 둘 다 없으면 None(부르는 쪽이 기본값을 정한다).

    한쪽만 오면 422 다. 무시하고 다른 기간을 답하면 어긋난 것을 아무도 모른다.
    """
    if (year is None) != (month is None):
        raise ApiError(
            ErrorCode.INVALID_REQUEST,
            "조회할 달은 연도와 월을 함께 보내 주세요.",
            status_code=422,
        )
    return BudgetPeriod.of_month(year, month) if year is not None and month is not None else None


MonthQuery = Annotated[BudgetPeriod | None, Depends(month_period)]
"""달을 안 보내면 None. 그때 쓸 기본 기간은 부르는 쪽이 정한다."""
