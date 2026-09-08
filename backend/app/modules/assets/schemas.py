"""자산 API 스키마.

조회와 저장이 같은 모양으로 답한다. 저장 응답을 그대로 캐시에 넣어 화면을 다시 그릴 수
있어야 하고, 그러지 않으면 저장 직후 순자산과 소계가 한 번 더 왕복할 때까지 옛 값이다.

`AssetItem` 은 도메인 값 객체와 ORM 모델에도 같은 이름이 있다. 여기서는 요청·응답
스키마이므로 `AssetItemIn`·`AssetItemOut` 으로 갈라 이름이 겹치지 않게 둔다.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.api.amounts import MAX_AMOUNT, integral_won
from app.domain.assets import AssetGroup, AssetSummary
from app.domain.money import Money
from app.models.asset import AssetSource

__all__ = [
    "MAX_ITEMS",
    "AssetGroupTotalOut",
    "AssetItemIn",
    "AssetItemOut",
    "AssetSnapshotOut",
    "AssetSnapshotPut",
    "AssetSummaryOut",
    "AssetsOut",
    "to_assets_out",
]

# 한 스냅샷에 담을 수 있는 항목 수. 화면이 목록을 통째로 보내므로 상한을 여기서 못 박는다.
# 그룹 넷에 열 줄씩 적어도 남는 수이고, 넘치면 한 화면에서 훑을 수 없다.
MAX_ITEMS = 40

# 이름 길이. 금융사와 항목 이름이 들어갈 만큼이고 모델 컬럼(String(80))과 같다.
MAX_LABEL = 80


class AssetItemIn(BaseModel):
    """자산 항목 하나. 부채도 양수로 보내고 순자산에서 뺄지는 group 이 정한다."""

    group: AssetGroup
    # 이름은 선택이다. 첫 기록 전 필수 질문을 만들지 않는 것과 같은 이유로 강제하지 않는다.
    label: str | None = Field(default=None, max_length=MAX_LABEL)
    # 컬럼은 16자리지만 상한은 거래·예산과 같은 14자리로 둔다. 그보다 크면 화면이 못 그린다.
    # JS 의 안전 정수 범위가 약 9e15 라, 16자리 값은 숫자로 바꾸는 순간 자릿수가 어긋난다.
    amount: Decimal = Field(ge=0, le=MAX_AMOUNT, description="원 단위 정수. 0 이상")

    _check_amount = field_validator("amount")(integral_won)

    @field_validator("label")
    @classmethod
    def _blank_is_none(cls, value: str | None) -> str | None:
        """빈칸만 적은 이름은 없는 것으로 본다. 목록에 공백 한 칸짜리 줄이 남지 않게 한다."""
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None


class AssetSnapshotPut(BaseModel):
    """자산 목록을 통째로 바꾼다. 항목 단위 추가·삭제 경로는 두지 않는다.

    화면이 목록을 들고 있다가 그대로 보내므로, 빈 배열은 '전부 지웠다' 는 뜻이다.
    """

    items: list[AssetItemIn] = Field(default_factory=list, max_length=MAX_ITEMS)


class AssetItemOut(BaseModel):
    group: AssetGroup
    label: str | None
    amount: Decimal
    # 화면에 놓이는 순서. 서버가 받은 순서대로 0 부터 붙인다.
    sort_order: int


class AssetGroupTotalOut(BaseModel):
    """그룹 소계. 항목이 없는 그룹도 0 으로 실린다.

    네 그룹이 늘 같은 순서로 오므로 화면이 구획 순서를 다시 정하지 않는다.
    """

    group: AssetGroup
    total: Decimal


class AssetSummaryOut(BaseModel):
    """자산·부채 합과 순자산.

    순자산은 남은 예산·이번 달 차액과 다른 개념이라 한 카드에 섞지 않는다.
    """

    total_assets: Decimal
    total_liabilities: Decimal
    # 자산 합 − 부채 합. 부채가 더 크면 음수 그대로 둔다.
    net_worth: Decimal


class AssetSnapshotOut(BaseModel):
    """언제 적은 것인지. 화면이 `N월 N일 기준` 을 이 날짜로 적는다."""

    id: uuid.UUID
    effective_on: date
    source: AssetSource


class AssetsOut(BaseModel):
    """자산 화면이 그리는 것 전부. 조회 하나로 끝낸다."""

    # 한 번도 적지 않았으면 null 이고 그때 items 도 비어 있다. 오류가 아니다.
    snapshot: AssetSnapshotOut | None
    summary: AssetSummaryOut
    groups: list[AssetGroupTotalOut]
    items: list[AssetItemOut]


def to_assets_out(
    snapshot_id: uuid.UUID | None,
    effective_on: date | None,
    source: AssetSource | None,
    items: list[tuple[AssetGroup, str | None, Money]],
    summary: AssetSummary,
    group_totals: dict[AssetGroup, Money],
) -> AssetsOut:
    """도메인 판정 결과를 응답 형태로 옮긴다. 여기서 숫자를 새로 만들지 않는다."""
    return AssetsOut(
        snapshot=(
            None
            if snapshot_id is None or effective_on is None or source is None
            else AssetSnapshotOut(id=snapshot_id, effective_on=effective_on, source=source)
        ),
        summary=AssetSummaryOut(
            total_assets=summary.total_assets.amount,
            total_liabilities=summary.total_liabilities.amount,
            net_worth=summary.net_worth.amount,
        ),
        # enum 선언 순서가 화면 구획 순서다. 값 목록 한 곳에서 순서까지 정해진다.
        groups=[
            AssetGroupTotalOut(group=group, total=group_totals[group].amount)
            for group in AssetGroup
        ],
        items=[
            AssetItemOut(group=group, label=label, amount=amount.amount, sort_order=index)
            for index, (group, label, amount) in enumerate(items)
        ],
    )
