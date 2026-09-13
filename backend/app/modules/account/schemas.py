"""데이터 초기화 요청 본문."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

__all__ = ["ResetIn"]


class ResetIn(BaseModel):
    """되돌릴 수 없는 요청이라 본문으로 한 번 더 못을 박는다.

    화면에서 이미 동의 체크를 받지만, 그 확인은 화면에만 있다. 잘못 만든 요청 하나가
    남의 몇 달치를 지우는 자리라, 서버도 뜻이 분명한 값을 요구한다.
    """

    confirm: Literal[True]
