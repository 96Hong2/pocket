"""LLM 파싱 결과 계약.

줄글 입력이든 캡처 입력이든 같은 후보 형태로 나온다.
여기서 나오는 값은 아직 '후보'다. 확정·중복판정·집계는 domain 이 한다.

LLM 은 구조화·분류만 한다. 금액 합계·잔액·증감 같은 계산을 시키지 않는다.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field

# 종류·입력경로는 domain 이 정본이다. 여기서 값 목록을 다시 적지 않는다.
from app.domain.aggregation import PaymentMethod, TransactionSource, TransactionType
from app.domain.asset_ledger import InvestKind
from app.domain.assets import AssetGroup
from app.domain.categories import expense_category_names, income_category_names

# 프롬프트와 스텁이 참고하는 분류 이름. 정본은 app/domain/categories.py 다.
# 수입도 분류를 고를 수 있어야 한다. 후보에서 빼면 모델이 영영 못 고른다.
DEFAULT_CATEGORY_HINTS: tuple[str, ...] = expense_category_names() + income_category_names()

# 이 값 아래는 사용자 확인 없이 확정하지 않는다.
LOW_CONFIDENCE_THRESHOLD = 0.5


class ExtractedTransaction(BaseModel):
    """LLM 이 채우는 부분. 여기에 계산 결과를 담지 않는다."""

    model_config = ConfigDict(extra="forbid")

    occurred_at: date | None = Field(
        default=None,
        description="거래 날짜. 입력에서 알 수 없으면 null 로 둔다. 추측하지 않는다.",
    )
    amount: int = Field(
        gt=0,
        description="금액. 부호 없는 정수(원). 의미는 type 이 구분한다.",
    )
    type: TransactionType = Field(
        description="expense 지출 / income 수입 / transfer 이체 / refund 환불",
    )
    merchant: str | None = Field(
        default=None,
        max_length=120,
        description="가맹점 또는 메모. 없으면 null.",
    )
    category: str | None = Field(
        default=None,
        max_length=40,
        description="분류 이름 후보. 확실하지 않으면 null.",
    )
    payment_method: PaymentMethod | None = Field(
        default=None,
        description=(
            "무엇으로 냈는지. credit 신용카드 / debit 체크카드 / cash 현금."
            " 입력에 적혀 있을 때만 고르고, 없으면 null."
        ),
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="이 후보를 얼마나 믿을 수 있는지. 0~1.",
    )
    # 저축·투자 줄만 채운다. 지시에 자산 항목 목록이 없으면 null 이다.
    asset_name: str | None = Field(
        default=None,
        max_length=80,
        description="저축·투자면 어디에 넣었는지. 자산 항목 목록에 맞는 이름이 있으면 그 이름.",
    )
    asset_quantity: float | None = Field(
        default=None,
        description="주식·ETF·코인을 몇 주(개) 샀는지 적혀 있을 때만. 없으면 null.",
    )

    @property
    def is_low_confidence(self) -> bool:
        return self.confidence < LOW_CONFIDENCE_THRESHOLD


class TransactionExtraction(BaseModel):
    """LLM Structured Output 최상위 스키마."""

    model_config = ConfigDict(extra="forbid")

    candidates: list[ExtractedTransaction] = Field(default_factory=list)


class ExtractedAsset(BaseModel):
    """잔액 화면 한 줄. 계좌번호는 담지 않는다."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(
        max_length=80,
        description="통장·상품·종목 이름. 기존 항목과 같은 것이면 그 이름 그대로. 계좌번호는 빼고.",
    )
    amount: int = Field(ge=0, description="화면에 적힌 잔액(평가금액). 부호 없는 정수(원).")
    group: AssetGroup | None = Field(
        default=None,
        description=(
            "cash 현금·예적금 / investment 투자 / pension 연금 / deposit 보증금·기타"
            " / debt 대출. 모르겠으면 null."
        ),
    )
    # 아래는 증권 앱 보유 화면에 보일 때만. 넣은 돈은 서버가 정한다(모델은 빼기를 하지 않는다).
    kind: InvestKind | None = Field(
        default=None,
        description="stock 주식 / etf / fund 펀드 / coin 코인 / bond 채권. 모르면 null.",
    )
    quantity: float | None = Field(
        default=None, description="보유 수량. 화면에 적혀 있을 때만. 없으면 null."
    )
    purchase: int | None = Field(
        default=None, ge=0, description="매입금액(투자원금). 부호 없는 정수(원). 없으면 null."
    )
    profit: int | None = Field(
        default=None,
        description="매입금액이 안 보일 때만 평가손익(수익금). 손해면 음수 정수(원). 없으면 null.",
    )


class AssetExtraction(BaseModel):
    """자산 캡처 Structured Output 최상위 스키마. 잔액이 없는 그림이면 빈 목록이다."""

    model_config = ConfigDict(extra="forbid")

    rows: list[ExtractedAsset] = Field(default_factory=list)


class TransactionCandidate(ExtractedTransaction):
    """입력 경로(source)까지 붙인 후보. domain 이 이걸 받아 확정 여부를 정한다."""

    source: TransactionSource


class ParseMeta(BaseModel):
    """이 결과가 어디서 나왔는지. 스텁 결과를 진짜 성공으로 오해하지 않게 한다."""

    model_config = ConfigDict(extra="forbid")

    provider: str
    is_stub: bool = False
    model: str | None = None
    notes: list[str] = Field(default_factory=list)


class ParseResult(BaseModel):
    """줄글 파싱과 캡처 파싱이 공통으로 돌려주는 형태."""

    model_config = ConfigDict(extra="forbid")

    candidates: list[TransactionCandidate] = Field(default_factory=list)
    meta: ParseMeta

    @property
    def has_candidate(self) -> bool:
        return bool(self.candidates)


def attach_source(
    extraction: TransactionExtraction, source: TransactionSource
) -> list[TransactionCandidate]:
    """LLM 결과에 입력 경로를 붙인다. source 는 LLM 이 아니라 호출자가 안다."""
    return [
        TransactionCandidate(**item.model_dump(), source=source) for item in extraction.candidates
    ]
