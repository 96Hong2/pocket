"""공유 가계부 API 스키마.

이름이 곧 계약이다. 프론트가 schema.gen.ts 로 이 이름을 그대로 가져다 쓴다.
종류·돈 나누기·역할은 domain.books 의 enum 을 그대로 써서 openapi 에 값 목록이 실린다.
금액 규칙은 거래·예산과 같은 app/api/amounts.py 를 쓴다.

공유 기록은 지출과 회비 입금 두 가지다(`kind`). 입금은 쓴 돈 합계에 안 든다.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.api.amounts import MAX_AMOUNT, integral_won, ratio_out
from app.api.months import MAX_YEAR, MIN_YEAR
from app.domain.books import (
    BOOK_NAME_MAX,
    ENTRY_MEMO_MAX,
    ENTRY_TITLE_MAX,
    MAX_MEMBERS,
    MEMBER_NAME_MAX,
    SHARE_PERCENT_STEP,
    BookEntryKind,
    BookKind,
    BookRole,
    SettleRule,
)
from app.domain.period import MAX_START_DAY, MIN_START_DAY
from app.modules import ledger
from app.modules.reports.schemas import BreakdownRowOut

__all__ = [
    "BOOK_CATEGORY_LIMIT",
    "MEMBER_ENTRIES_LIMIT",
    "MEMBER_ENTRIES_MAX",
    "BookCategoryChangeOut",
    "BookCategoryCreate",
    "BookCategoryOut",
    "BookCreate",
    "BookDueMemberOut",
    "BookDuesOut",
    "BookEntryCreate",
    "BookEntryCreated",
    "BookEntryListOut",
    "BookEntryOut",
    "BookEntryUpdate",
    "BookInsightOut",
    "BookInviteOut",
    "BookListOut",
    "BookMemberEntriesOut",
    "BookMemberOut",
    "BookMonthStateOut",
    "BookOut",
    "BookReportOut",
    "BookUpdate",
    "DuesStatus",
    "InvitePreviewOut",
    "InviteStatus",
    "JoinIn",
    "MoveInIn",
    "MoveOutResult",
    "SettlementDoneIn",
    "SettlementDoneOut",
    "SettlementMemberOut",
    "SettlementOut",
    "SettlementTransferOut",
]


# ── 검증기 ─────────────────────────────────────────────


def _as_utc(value: object) -> object:
    """SQLite 가 잃어버린 시간대를 붙인다. 받는 쪽이 자기 시간대로 읽어 하루가 밀리지 않게."""
    return ledger.as_utc(value) if isinstance(value, datetime) else value


def _strip(value: object) -> object:
    """길이를 재기 전에 앞뒤 공백을 걷는다. 공백만 적은 이름은 빈 이름이다."""
    return value.strip() if isinstance(value, str) else value


def _has_control(value: str) -> bool:
    # PostgreSQL text 는 NUL 을 못 받는다. 테스트가 SQLite 라 여기서 막지 않으면 운영에서만 터진다.
    return any(ord(ch) < 0x20 or ord(ch) == 0x7F for ch in value)


def _clean_name(value: str | None) -> str | None:
    if value is not None and _has_control(value):
        raise ValueError("이름에 넣을 수 없는 문자가 있어요.")
    return value


def _clean_optional_text(value: str | None) -> str | None:
    """내용과 메모. 공백만 남으면 없는 것으로 본다."""
    if value is None:
        return None
    if _has_control(value):
        raise ValueError("넣을 수 없는 문자가 있어요.")
    stripped = value.strip()
    return stripped or None


def _day_in_range(value: date | None) -> date | None:
    """기간을 만들 수 없는 연도를 막는다. 월 경계 계산이 500 으로 터지지 않게."""
    if value is not None and not MIN_YEAR <= value.year <= MAX_YEAR:
        raise ValueError(f"날짜는 {MIN_YEAR}년부터 {MAX_YEAR}년 사이여야 해요.")
    return value


def _check_percents(value: dict[uuid.UUID, int] | None) -> dict[uuid.UUID, int] | None:
    """회비 비율. 0 ~ 100, 10% 단위, 합 100. 누가 멤버인지는 서비스가 본다."""
    if value is None:
        return None
    if len(value) > MAX_MEMBERS:
        raise ValueError(f"비율은 {MAX_MEMBERS}명까지 정할 수 있어요.")
    for percent in value.values():
        if not 0 <= percent <= 100:
            raise ValueError("비율은 0%부터 100%까지예요.")
        if percent % SHARE_PERCENT_STEP:
            raise ValueError(f"비율은 {SHARE_PERCENT_STEP}% 단위로 정해 주세요.")
    total = sum(value.values())
    if total != 100:
        raise ValueError(f"합이 100%가 되게 맞춰 주세요(지금 {total}%).")
    return value


def _reject_nulls(model: BaseModel, fields: tuple[str, ...]) -> None:
    """보낸 필드 중 비울 수 없는 값에 null 이 오면 막는다. 안 보낸 것과 null 은 다르다."""
    for field in fields:
        if field in model.model_fields_set and getattr(model, field) is None:
            raise ValueError(f"{field} 는 비울 수 없어요.")


# ── 가계부 ─────────────────────────────────────────────


class BookMemberOut(BaseModel):
    id: uuid.UUID
    # 나간 멤버는 null 이다. 서버가 나간 사람의 이름을 내보내지 않는다.
    name: str | None
    role: BookRole
    is_me: bool
    joined_at: AwareDatetime
    left: bool

    _stamp = field_validator("joined_at", mode="before")(_as_utc)


class BookCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    icon_key: str
    sort_order: int


# 가계부 하나에 둘 수 있는 분류 수. 기록 시트 격자가 한 화면을 넘지 않는 선이다.
BOOK_CATEGORY_LIMIT = 30


class BookCategoryCreate(BaseModel):
    """공유 분류 만들기. 사진 아이콘은 받지 않는다. 올린 사람 기기에만 있어 상대 화면에 안 뜬다."""

    name: str = Field(min_length=1, max_length=40)
    icon_key: str = Field(min_length=1, max_length=64)

    _trim = field_validator("name", "icon_key", mode="before")(_strip)
    _check_name = field_validator("name", "icon_key")(_clean_name)


class BookInviteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    expires_at: AwareDatetime

    _stamp = field_validator("expires_at", mode="before")(_as_utc)


class BookOut(BaseModel):
    id: uuid.UUID
    kind: BookKind
    name: str
    settle_rule: SettleRule
    # 달마다 같은 예산. null 이면 예산이 없다.
    monthly_budget: Decimal | None
    # 가계부의 한 달이 시작하는 날(1 ~ 28). 기간 이름은 날이 가장 많이 든 달이다.
    month_start_day: int
    # 멤버 id 별 회비 비율(합 100). null 이면 똑같이. 멤버가 바뀌면 null 로 돌아간다.
    share_percents: dict[uuid.UUID, int] | None
    # 각자 입금 가계부의 한 달 회비 합계. null 이면 정하지 않았다.
    dues_amount: Decimal | None
    ended: bool
    ended_at: AwareDatetime | None
    created_at: AwareDatetime
    my_member_id: uuid.UUID
    my_role: BookRole
    # 지금 있는 멤버를 들어온 순서로 먼저, 그 뒤에 나간 멤버.
    members: list[BookMemberOut]
    active_member_count: int
    categories: list[BookCategoryOut]
    # 닫히지도 만료되지도 않은 초대. 멤버 누구나 본다.
    invite: BookInviteOut | None

    _stamp = field_validator("ended_at", "created_at", mode="before")(_as_utc)


class BookListOut(BaseModel):
    """내가 지금 멤버인 가계부. 끝난 것도 담는다. 안 끝난 것이 먼저, 그 안에서는 최근 것이 먼저."""

    items: list[BookOut]


class BookCreate(BaseModel):
    kind: BookKind
    name: str = Field(min_length=1, max_length=BOOK_NAME_MAX)
    settle_rule: SettleRule
    # 다른 멤버 화면에 「은홍이 적었어요」 로 보일 이름.
    my_name: str = Field(min_length=1, max_length=MEMBER_NAME_MAX)

    _trim = field_validator("name", "my_name", mode="before")(_strip)
    _check_names = field_validator("name", "my_name")(_clean_name)


class BookUpdate(BaseModel):
    """보낸 필드만 고친다.

    name 과 ended 는 관리자만 고친다. 나머지(회비 방식, 비율, 회비, 예산, 시작일)는 멤버 누구나.
    monthly_budget 과 dues_amount 의 null 은 지우고, share_percents 의 null 은 똑같이로 돌린다.
    나머지는 null 을 받지 않는다. share_percents 의 키는 지금 멤버 id 전부와 같아야 한다.
    """

    name: str | None = Field(default=None, min_length=1, max_length=BOOK_NAME_MAX)
    settle_rule: SettleRule | None = None
    monthly_budget: Decimal | None = Field(default=None, gt=0, le=MAX_AMOUNT)
    month_start_day: int | None = Field(default=None, ge=MIN_START_DAY, le=MAX_START_DAY)
    share_percents: dict[uuid.UUID, int] | None = None
    dues_amount: Decimal | None = Field(default=None, gt=0, le=MAX_AMOUNT)
    # true 면 지금 끝내고, false 면 다시 연다.
    ended: bool | None = None

    _trim = field_validator("name", mode="before")(_strip)
    _check_name = field_validator("name")(_clean_name)
    _check_budget = field_validator("monthly_budget", "dues_amount")(integral_won)
    _valid_percents = field_validator("share_percents")(_check_percents)

    @model_validator(mode="after")
    def _reject_explicit_nulls(self) -> BookUpdate:
        _reject_nulls(self, ("name", "settle_rule", "month_start_day", "ended"))
        return self


# ── 초대 ───────────────────────────────────────────────

# member 는 이미 멤버인 것. 초대장을 만든 사람이면 is_inviter 가 true 다.
InviteStatus = Literal["ok", "expired", "full", "member", "closed", "ended"]


class InvitePreviewOut(BaseModel):
    """초대 화면이 그리는 것. 지운 가계부와 모르는 코드는 이 모양이 아니라 404 다."""

    status: InviteStatus
    book_kind: BookKind
    # closed, ended, expired 이면 가계부 근황을 싣지 않는다. 이름은 빈 문자열, 인원은 0 이고
    # 초대한 사람 이름은 expired 에만 남는다.
    book_name: str
    inviter_name: str | None
    active_member_count: int
    # status 가 member 일 때만 싣는다. 그 가계부를 바로 열 수 있게.
    book_id: uuid.UUID | None
    is_inviter: bool


class JoinIn(BaseModel):
    name: str = Field(min_length=1, max_length=MEMBER_NAME_MAX)

    _trim = field_validator("name", mode="before")(_strip)
    _check_name = field_validator("name")(_clean_name)


# ── 공유 기록 ───────────────────────────────────────────


class BookEntryOut(BaseModel):
    id: uuid.UUID
    book_id: uuid.UUID
    # 입금이면 분류가 늘 null 이고 paid_by_member_id 가 넣은 사람이다.
    kind: BookEntryKind
    amount: Decimal
    category_id: uuid.UUID | None
    title: str | None
    memo: str | None
    occurred_on: date
    # 적은 사람, 낸 사람, 마지막에 고친 사람(적은 사람이 고쳤으면 null).
    created_by_member_id: uuid.UUID | None
    paid_by_member_id: uuid.UUID | None
    updated_by_member_id: uuid.UUID | None
    created_at: AwareDatetime
    updated_at: AwareDatetime
    # 내가 적었거나 내가 관리자면 지울 수 있다. 옮기기는 적은 사람만, 입금은 못 옮긴다.
    can_delete: bool
    can_move: bool

    _stamp = field_validator("created_at", "updated_at", mode="before")(_as_utc)


class BookEntryListOut(BaseModel):
    """날짜가 늦은 것부터, 같은 날이면 나중에 적은 것부터."""

    items: list[BookEntryOut]


class BookEntryCreate(BaseModel):
    # 안 보내면 지출이다. 옛 화면은 이 칸을 모른다.
    kind: BookEntryKind = BookEntryKind.EXPENSE
    amount: Decimal = Field(gt=0, le=MAX_AMOUNT, description="원 단위 정수. 1원 이상")
    # 같은 가계부의 분류여야 한다. 입금은 받지 않는다.
    category_id: uuid.UUID | None = None
    title: str | None = Field(default=None, max_length=ENTRY_TITLE_MAX)
    memo: str | None = Field(default=None, max_length=ENTRY_MEMO_MAX)
    # 적는 사람 화면의 날짜를 그대로 받는다.
    occurred_on: date
    # 낸 사람(입금이면 넣은 사람). 지금 멤버여야 한다. 비우면 나.
    paid_by_member_id: uuid.UUID | None = None

    _check_amount = field_validator("amount")(integral_won)
    _check_day = field_validator("occurred_on")(_day_in_range)
    _check_text = field_validator("title", "memo")(_clean_optional_text)

    @model_validator(mode="after")
    def _deposit_has_no_category(self) -> BookEntryCreate:
        if self.kind is BookEntryKind.DEPOSIT and self.category_id is not None:
            raise ValueError("입금에는 분류를 달 수 없어요.")
        return self


class BookEntryUpdate(BaseModel):
    """보낸 필드만 고친다. 금액과 날짜는 null 을 받지 않는다.

    분류, 내용, 메모의 null 은 비운다. 낸 사람의 null 은 나로 본다.
    종류는 바꾸지 않는다. 입금에 분류를 달면 422 다.
    """

    amount: Decimal | None = Field(default=None, gt=0, le=MAX_AMOUNT)
    category_id: uuid.UUID | None = None
    title: str | None = Field(default=None, max_length=ENTRY_TITLE_MAX)
    memo: str | None = Field(default=None, max_length=ENTRY_MEMO_MAX)
    occurred_on: date | None = None
    paid_by_member_id: uuid.UUID | None = None

    _check_amount = field_validator("amount")(integral_won)
    _check_day = field_validator("occurred_on")(_day_in_range)
    _check_text = field_validator("title", "memo")(_clean_optional_text)

    @model_validator(mode="after")
    def _reject_explicit_nulls(self) -> BookEntryUpdate:
        _reject_nulls(self, ("amount", "occurred_on"))
        return self


class BookMonthStateOut(BaseModel):
    """저장한 기록이 들어간 달의 상태. 저장 뒤 화면이 이걸로 남은 예산이나 쓴 돈을 말한다."""

    period_start: date
    period_end: date
    # 지출만 더한다. 입금은 deposited 로 따로 센다. 둘을 합친 숫자는 만들지 않는다.
    spent: Decimal
    budget: Decimal | None
    remaining: Decimal | None
    deposited: Decimal


class BookEntryCreated(BaseModel):
    entry: BookEntryOut
    # entry.occurred_on 이 든 달. 여행 가계부는 여행 전체(가장 이른 기록부터 오늘까지)다.
    month: BookMonthStateOut


# 멤버 내역 한 번에 싣는 줄 수. 같은 날 기록은 쪼개지 않아 넘을 수 있다.
MEMBER_ENTRIES_LIMIT = 50
MEMBER_ENTRIES_MAX = 100


class BookMemberEntriesOut(BaseModel):
    """한 사람이 낸 지출과 넣은 입금. 나갔다 다시 들어온 줄의 기록도 함께다.

    최신순이다. next_before 를 before 로 다시 보내면 그 앞 기록이 온다. 더 없으면 null.
    합계 둘은 전 기간이다.
    """

    member_id: uuid.UUID
    # 그 사람이 지금 멤버가 아니면 null. 나간 사람의 이름은 내보내지 않는다.
    name: str | None
    deposited_total: Decimal
    paid_total: Decimal
    items: list[BookEntryOut]
    next_before: date | None


class MoveOutResult(BaseModel):
    """내 가계부 쪽 거래. 옮겨서 새로 생겼거나, 옮기기를 되돌려 다시 살아난 것."""

    transaction_id: uuid.UUID


class MoveInIn(BaseModel):
    """공유 가계부로 옮길 내 거래."""

    transaction_id: uuid.UUID
    # 옮기면서 고른 이 가계부 분류. 안 보내면 같은 이름의 분류, 없으면 「기타」 다.
    category_id: uuid.UUID | None = None


class MoveOutIn(BaseModel):
    """내 가계부로 옮기면서 고른 내 지출 분류. 안 보내면 같은 이름의 분류, 없으면 「기타」 다."""

    category_id: uuid.UUID | None = None


# ── 정산 ───────────────────────────────────────────────


class SettlementMemberOut(BaseModel):
    member_id: uuid.UUID
    paid: Decimal
    share: Decimal
    # 낸 돈에서 몫을 뺀 값. 양수면 받을 사람, 음수면 보낼 사람.
    balance: Decimal
    # 비율로 나눴으면 그 사람 비율, 똑같이 나눴으면 null.
    percent: int | None


class SettlementTransferOut(BaseModel):
    from_member_id: uuid.UUID
    to_member_id: uuid.UUID
    amount: Decimal


class SettlementDoneOut(BaseModel):
    done_by_member_id: uuid.UUID | None
    done_at: AwareDatetime

    _stamp = field_validator("done_at", mode="before")(_as_utc)


class SettlementOut(BaseModel):
    """각자 입금(none)이면 members 와 transfers 가 비고 total 만 있다. total 에 입금은 없다."""

    # 기간의 이름 달 'YYYY-MM', 여행 가계부는 'all'.
    period: str
    # 여행 가계부 전체 정산이면 null.
    period_start: date | None
    period_end: date | None
    rule: SettleRule
    total: Decimal
    members: list[SettlementMemberOut]
    transfers: list[SettlementTransferOut]
    # 비율로 나눴나. 비율이 없거나 그 기간 사람과 어긋나면 똑같이 나눠 false.
    ratio: bool
    done: SettlementDoneOut | None
    # 끝낸 뒤 기록이 바뀌어 지금 계산이 그때와 다르다.
    changed_after_done: bool


# done: 이번 기간 몫을 냈다. pending: 아직. none: 나눌 것이 없다.
DuesStatus = Literal["done", "pending", "none"]


class BookDueMemberOut(BaseModel):
    member_id: uuid.UUID
    percent: int | None
    # 각자 입금이고 회비를 정했을 때 이번 기간 낼 돈. 아니면 null.
    due: Decimal | None
    deposited: Decimal
    status: DuesStatus


class BookDuesOut(BaseModel):
    """이번 기간 멤버마다 회비를 냈나. 지금 멤버만 싣는다.

    각자 입금은 넣은 돈을 낼 돈과 견준다(회비가 없으면 한 번이라도 넣었나).
    나중에 정산은 그 기간 정산을 끝냈으면 모두 done, 아니면 더 보내거나 받을 돈이 없는 사람만 done.
    """

    rule: SettleRule
    # 기간의 이름 달 'YYYY-MM', 여행 가계부는 'all'.
    period_key: str
    period_start: date | None
    period_end: date | None
    dues_amount: Decimal | None
    ratio: bool
    members: list[BookDueMemberOut]


class SettlementDoneIn(BaseModel):
    """끝낼 달. 여행 가계부는 이 값을 보지 않는다."""

    year: int = Field(ge=MIN_YEAR, le=MAX_YEAR)
    month: int = Field(ge=1, le=12)


# ── 리포트 ─────────────────────────────────────────────


class BookCategoryChangeOut(BaseModel):
    category_id: uuid.UUID | None
    current: Decimal
    previous: Decimal
    delta: Decimal


class BookInsightOut(BaseModel):
    """자세히 보기. 잠금은 화면의 일이고 값은 늘 싣는다."""

    # 지난달 같은 기간(1일부터 오늘과 같은 날까지)에 쓴 돈. 지난 달을 보면 지난달 전체.
    previous_spent_same_window: Decimal
    compare_delta: Decimal
    compare_window_end: date
    largest_increase: BookCategoryChangeOut | None
    # 변화가 큰 것부터 여덟 개까지.
    category_changes: list[BookCategoryChangeOut]
    # 이번 달만 있다. 지난 달은 null.
    projected_month_end: Decimal | None
    is_projection_reliable: bool


class BookReportOut(BaseModel):
    period_start: date
    period_end: date
    spent: Decimal
    entry_count: int
    budget: Decimal | None
    remaining: Decimal | None
    # 쓴 돈 ÷ 예산. 예산이 없으면 null.
    spend_progress: Decimal | None
    # 개인 리포트와 같은 모양이다. 도넛과 목록이 같은 줄을 쓴다.
    breakdown: list[BreakdownRowOut]
    breakdown_total: Decimal
    insight: BookInsightOut

    _ratio = field_validator("spend_progress")(ratio_out)
