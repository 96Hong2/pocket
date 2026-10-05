"""자산 API 스키마.

조회와 저장이 같은 모양으로 답한다. 저장 응답을 그대로 캐시에 넣어 화면을 다시 그릴 수
있어야 하고, 그러지 않으면 저장 직후 순자산과 소계가 한 번 더 왕복할 때까지 옛 값이다.

`AssetItem` 은 도메인 값 객체와 ORM 모델에도 같은 이름이 있다. 여기서는 요청·응답
스키마이므로 `AssetItemIn`·`AssetItemOut` 으로 갈라 이름이 겹치지 않게 둔다.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.api.amounts import MAX_AMOUNT, QuantityOut, integral_won, quantity_in, quantity_out
from app.domain.asset_analysis import AnalysisScope
from app.domain.asset_ledger import InvestKind, RateKind
from app.domain.assets import LEGACY_GROUPS, AssetGroup, AssetSummary
from app.domain.money import Money
from app.models.asset import AssetSource
from app.modules.transactions.schemas import TransactionOut

__all__ = [
    "MAX_ITEMS",
    "MAX_PUT_ITEMS",
    "AnalysisBundleOut",
    "AnalysisGoalOut",
    "AnalysisGroupChangeOut",
    "AnalysisGroupSliceOut",
    "AnalysisItemSliceOut",
    "AnalysisMonthChangeOut",
    "AnalysisReturnRowOut",
    "AnalysisReturnsOut",
    "AnalysisSavedItemOut",
    "AnalysisSavedPointOut",
    "AnalysisSavingOut",
    "AnalysisSummaryOut",
    "AssetAnalysisOut",
    "AssetCheckinIn",
    "AssetGroupTotalOut",
    "AssetHistoryOut",
    "AssetHistoryPointOut",
    "AssetItemIn",
    "AssetItemOut",
    "AssetSnapshotOut",
    "AssetSnapshotPut",
    "AssetSummaryOut",
    "AssetsOut",
    "ItemOutValues",
    "to_assets_out",
]

# 한 스냅샷에 담을 수 있는 항목 수. 화면이 목록을 통째로 보내므로 상한을 여기서 못 박는다.
# 그룹 넷에 열 줄씩 적어도 남는 수이고, 넘치면 한 화면에서 훑을 수 없다.
MAX_ITEMS = 40
# PUT 본문이 받는 항목 수. 계정을 합치면 40 을 넘을 수 있어 줄이는 저장까지 막지 않게 넉넉히 둔다.
# 늘리는 저장은 서비스가 MAX_ITEMS 로 막는다.
MAX_PUT_ITEMS = MAX_ITEMS * 5

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
    # 아래는 새 번들만 보낸다. 안 보낸 칸은 같은 항목의 기존 값을 지킨다(옛 번들 PUT 대비).
    item_key: uuid.UUID | None = Field(
        default=None, description="GET 이 준 항목 키. 없으면 같은 (group, label) 에 맞춘다"
    )
    kind: InvestKind | None = Field(default=None, description="투자 그룹의 종류만")
    monthly_amount: Decimal | None = Field(default=None, ge=0, le=MAX_AMOUNT)
    quantity: Decimal | None = Field(default=None, description="수량 종목의 보유 수량")
    cost_basis: Decimal | None = Field(
        default=None, ge=0, le=MAX_AMOUNT, description="종목의 넣은 돈"
    )
    unit_price: Decimal | None = Field(
        default=None, ge=0, le=MAX_AMOUNT, description="수량 종목의 지금 1주 가격"
    )
    price_noted_on: date | None = Field(
        default=None, description="지금 가격(금액 종목은 지금 금액)을 적은 날"
    )

    _check_amount = field_validator("amount", "monthly_amount", "cost_basis", "unit_price")(
        integral_won
    )
    _check_quantity = field_validator("quantity")(quantity_in)

    @model_validator(mode="after")
    def _kind_only_for_investment(self) -> AssetItemIn:
        if self.kind is not None and self.group is not AssetGroup.INVESTMENT:
            raise ValueError("종류는 투자 항목에만 고를 수 있어요.")
        return self

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

    items: list[AssetItemIn] = Field(default_factory=list, max_length=MAX_PUT_ITEMS)
    # 캡처로 읽은 것을 저장하면 screenshot. 안 보내면 지금처럼 오늘 스냅샷의 출처를 그대로 둔다.
    source: AssetSource | None = Field(default=None, description="manual 또는 screenshot")


class AssetItemOut(BaseModel):
    group: AssetGroup
    label: str | None
    # 순자산에 드는 값. 수량 종목은 수량 × 지금 1주 가격, 없으면 넣은 돈이다.
    amount: Decimal
    # 화면에 놓이는 순서. 서버가 받은 순서대로 0 부터 붙인다.
    sort_order: int
    # 아래는 새 번들이 읽는 칸이다. 옛 번들은 모르는 칸이라 무시한다.
    item_key: uuid.UUID | None = None
    kind: InvestKind | None = None
    monthly_amount: Decimal | None = None
    quantity: QuantityOut | None = None
    cost_basis: Decimal | None = None
    unit_price: Decimal | None = None
    price_noted_on: date | None = None
    # 판 기록에서 쌓인 실현 수익. 판 적이 없으면 null.
    realized: Decimal | None = None
    # 수익률(%), 소수 첫째 자리. 지금 가격(금액)이 있으면 평가, 없고 판 기록이 있으면 실현.
    rate: Decimal | None = None
    rate_kind: RateKind | None = None
    # amount 와 같은 값. 「지금 가치」 를 그리는 칸.
    value: Decimal | None = None


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
    # 이번 달 모은 돈: 이체 중 「어디에」 가 있고 판 것이 아닌 합(사용자 시간대의 달).
    month_saved: Decimal = Decimal(0)


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
    # 공개 번들(56, 57)이 아는 넷만. 모르는 그룹이 오면 옛 화면이 죽는다.
    groups: list[AssetGroupTotalOut]
    # 다섯 그룹(연금 포함). 새 번들은 이 칸으로 구획을 그린다.
    all_groups: list[AssetGroupTotalOut] = Field(default_factory=list)
    items: list[AssetItemOut]


class AssetHistoryPointOut(BaseModel):
    """달마다 월말 점. 그 달 마지막 날 이하에서 가장 늦은 스냅샷이다(이번 달은 오늘까지)."""

    month: str = Field(description="YYYY-MM")
    effective_on: date
    total_assets: Decimal
    total_liabilities: Decimal
    net_worth: Decimal


class AssetHistoryOut(BaseModel):
    # 오래된 달부터. 첫 스냅샷보다 앞 달은 점이 없다.
    points: list[AssetHistoryPointOut]


class AssetCheckinIn(BaseModel):
    """「그대로예요」. 이번 달만 받는다."""

    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM")


@dataclass(frozen=True)
class ItemOutValues:
    """서비스가 셈을 끝내 넘기는 항목 한 줄. 응답으로 옮기기만 한다."""

    group: AssetGroup
    label: str | None
    amount: Money
    item_key: uuid.UUID | None = None
    kind: InvestKind | None = None
    monthly_amount: Decimal | None = None
    quantity: Decimal | None = None
    cost_basis: Decimal | None = None
    unit_price: Decimal | None = None
    price_noted_on: date | None = None
    realized: Money | None = None
    rate: Decimal | None = None
    rate_kind: RateKind | None = None


def to_assets_out(
    snapshot_id: uuid.UUID | None,
    effective_on: date | None,
    source: AssetSource | None,
    items: list[ItemOutValues],
    summary: AssetSummary,
    group_totals: dict[AssetGroup, Money],
    month_saved: Money | None = None,
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
            month_saved=(month_saved or Money.zero()).amount,
        ),
        groups=[
            AssetGroupTotalOut(group=group, total=group_totals[group].amount)
            for group in LEGACY_GROUPS
        ],
        # enum 선언 순서가 화면 구획 순서다. 값 목록 한 곳에서 순서까지 정해진다.
        all_groups=[
            AssetGroupTotalOut(group=group, total=group_totals[group].amount)
            for group in AssetGroup
        ],
        items=[_item_out(item, index) for index, item in enumerate(items)],
    )


def _item_out(item: ItemOutValues, index: int) -> AssetItemOut:
    return AssetItemOut(
        group=item.group,
        label=item.label,
        amount=item.amount.amount,
        sort_order=index,
        item_key=item.item_key,
        kind=item.kind,
        monthly_amount=item.monthly_amount,
        quantity=quantity_out(item.quantity),
        cost_basis=item.cost_basis,
        unit_price=item.unit_price,
        price_noted_on=item.price_noted_on,
        realized=item.realized.amount if item.realized is not None else None,
        rate=item.rate,
        rate_kind=item.rate_kind,
        value=item.amount.amount,
    )


# ── 내 자산 분석 ─────────────────────────────────────────


class AnalysisGroupSliceOut(BaseModel):
    """도넛 조각 하나(부채 제외). 비율은 % 소수 첫째 자리."""

    group: AssetGroup
    amount: Decimal
    ratio: Decimal | None
    # 「연금 빼고 보기」 의 비율. 연금 조각은 null.
    ratio_without_pension: Decimal | None


class AnalysisItemSliceOut(BaseModel):
    """종류별 화면의 항목 조각. 큰 것부터."""

    item_key: uuid.UUID | None
    group: AssetGroup
    kind: InvestKind | None
    label: str | None
    amount: Decimal
    ratio: Decimal | None
    monthly_amount: Decimal | None


class AnalysisReturnRowOut(BaseModel):
    """종목 한 줄. 평가 칸은 지금 가격을 적은 종목만, 실현 칸은 판 기록이 있는 종목만 찬다."""

    item_key: uuid.UUID | None
    kind: InvestKind | None
    label: str | None
    value: Decimal
    cost_basis: Decimal | None
    gain: Decimal | None
    rate: Decimal | None
    realized: Decimal | None
    realized_rate: Decimal | None


class AnalysisReturnsOut(BaseModel):
    """투자 수익률. 현재가나 판 기록을 적은 종목이 없으면 rows 가 비어 있다."""

    rows: list[AnalysisReturnRowOut]
    # 평가 중인 종목의 합산.
    cost: Decimal
    value: Decimal
    gain: Decimal
    rate: Decimal | None
    # 판 기록의 합산.
    realized: Decimal
    realized_rate: Decimal | None


class AnalysisGroupChangeOut(BaseModel):
    group: AssetGroup
    current: Decimal
    previous: Decimal
    delta: Decimal


class AnalysisMonthChangeOut(BaseModel):
    """지난달 월말 점과 지금 목록을 견준다."""

    previous_month: str = Field(description="YYYY-MM")
    previous_effective_on: date
    net_worth: Decimal
    previous_net_worth: Decimal
    delta: Decimal
    groups: list[AnalysisGroupChangeOut]


class AnalysisGoalOut(BaseModel):
    """진행 중 목표 한 줄. progress 는 0~1."""

    id: uuid.UUID
    title: str
    target_amount: Decimal
    current_amount: Decimal
    remaining: Decimal
    progress: Decimal


class AnalysisSavingOut(BaseModel):
    """이번 달 저축률. 번 돈이 0 이면 rate 가 null 이다."""

    saved: Decimal
    income: Decimal
    rate: Decimal | None
    goal: AnalysisGoalOut | None


class AnalysisBundleOut(BaseModel):
    """종류별 입구. 항목이 있는 묶음만 실린다."""

    scope: AnalysisScope
    item_count: int
    fingerprint: str


class AnalysisSavedItemOut(BaseModel):
    """이번 달 모은 돈의 「어디에」 한 항목. 큰 것부터. 이름과 그룹은 그 항목의 가장 최근 줄이다."""

    item_key: uuid.UUID
    # 같은 날 목록에서 지운 항목은 남은 줄이 없어 null 이다. 화면이 「지운 항목」 으로 부른다.
    group: AssetGroup | None
    kind: InvestKind | None
    label: str | None
    amount: Decimal
    # 이번 달 모은 돈 합 대비 %.
    ratio: Decimal | None


class AnalysisSavedPointOut(BaseModel):
    """달마다 모은 돈 막대 하나. 모은 것이 없는 달도 0 으로 들어온다."""

    month: str = Field(description="YYYY-MM, 기간이 시작하는 달")
    period_start: date
    period_end: date
    amount: Decimal


class AnalysisSummaryOut(BaseModel):
    total_assets: Decimal
    total_assets_without_pension: Decimal
    total_liabilities: Decimal
    net_worth: Decimal


class AssetAnalysisOut(BaseModel):
    """분석 한 벌. 서버는 잠금을 모른다. 화면이 본 지문과 fingerprint 를 견준다.

    all: summary, groups, returns, month_change, saving, bundles, saved_items, saved_trend,
    large_saves.
    stock: items, returns. cash: items, monthly_total. 안 쓰는 칸은 null 이나 빈 배열.
    """

    scope: AnalysisScope
    fingerprint: str
    # 범위 안 항목 값의 합. all 은 자산 합.
    total: Decimal
    summary: AnalysisSummaryOut | None = None
    groups: list[AnalysisGroupSliceOut] = Field(default_factory=list)
    items: list[AnalysisItemSliceOut] = Field(default_factory=list)
    returns: AnalysisReturnsOut | None = None
    month_change: AnalysisMonthChangeOut | None = None
    saving: AnalysisSavingOut | None = None
    bundles: list[AnalysisBundleOut] = Field(default_factory=list)
    monthly_total: Decimal | None = None
    # 아래 셋은 all 만 채운다. 판 기록은 모은 돈이 아니라 빠진다(saving.saved 와 같은 조건).
    saved_items: list[AnalysisSavedItemOut] = Field(default_factory=list)
    # 이번 기간으로 끝나는 여섯 기간, 오래된 것부터.
    saved_trend: list[AnalysisSavedPointOut] = Field(default_factory=list)
    # 이번 기간 모은 기록 중 큰 것 다섯. 고치기 시트가 바로 연다.
    large_saves: list[TransactionOut] = Field(default_factory=list)


# ── 자산 캡처 ────────────────────────────────────────────

# 받는 data URL 길이. 줄글·캡처 입력(imports)과 같은 값이다. 진짜 바이트 상한은 디코드한 뒤에 본다.
MAX_CAPTURE_DATA_URL_LENGTH = 6_000_000


class AssetCaptureIn(BaseModel):
    """잔액 화면 캡처 한 장. `data:image/png;base64,...`."""

    image: str = Field(min_length=32, json_schema_extra={"maxLength": MAX_CAPTURE_DATA_URL_LENGTH})

    @field_validator("image")
    @classmethod
    def _within_limit(cls, value: str) -> str:
        if len(value) > MAX_CAPTURE_DATA_URL_LENGTH:
            raise ValueError("사진이 너무 커요. 조금 작게 찍거나 다른 사진으로 골라 주세요.")
        return value


class AssetCaptureItemOut(BaseModel):
    """읽은 한 줄. item_key 가 있으면 기존 항목이고 current_amount 가 그 지금 금액이다."""

    name: str
    amount: Decimal
    # 기존 항목이면 그 그룹, 새 이름이면 읽은 그룹 추정(모르면 cash).
    group: AssetGroup
    item_key: uuid.UUID | None = None
    current_amount: Decimal | None = None
    # 증권 앱 보유 화면에서 읽은 것. 저장하면 이 값으로 채운다. 넣은 돈을 못 읽었으면 다 null.
    kind: InvestKind | None = None
    quantity: QuantityOut | None = None
    cost_basis: Decimal | None = None
    # 수량 종목의 지금 1주 가격 = 평가금액 ÷ 수량(원 단위 반올림).
    unit_price: Decimal | None = None
    # 평가 수익률(%). 자산 화면 줄 칩과 같은 식이다. 넣은 돈을 모르면 null.
    rate: Decimal | None = None


class AssetCaptureMetaOut(BaseModel):
    provider: str
    is_stub: bool
    # 화면이 읽는 코드값. 스텁이면 stub_image.
    notes: list[str] = Field(default_factory=list)


class AssetCaptureOut(BaseModel):
    """잔액을 못 찾았으면 items 가 빈 목록이다. 저장은 PUT /assets(source=screenshot)."""

    items: list[AssetCaptureItemOut]
    meta: AssetCaptureMetaOut
