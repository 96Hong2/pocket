"""공유 가계부 서비스.

멤버가 아니거나 권한이 없으면 404 NOT_FOUND 로 답한다. 있는지조차 알리지 않는다.
완료한 가계부에 쓰려 하면 409 BOOK_ENDED 다. 트랜잭션 경계는 여기 있다(서비스가 commit 한다).
개인 거래 표와 개인 조회는 건드리지 않는다. 옮기기 두 개만 두 쪽을 한 commit 으로 묶는다.

달은 가계부 시간대와 가계부 시작일로 끊는다(ADR-0050). 기록의 날짜는 적는 사람 화면의 날짜를
그대로 받아 두었으므로 달 거르기는 날짜 비교뿐이고, 가계부 시간대는 「오늘」 과 멤버가 있던
기간을 가를 때만 쓴다. 기간을 만드는 곳은 `_period_containing`, `_period_of`, `_book_period`
셋뿐이다.

입금 기록은 쓴 돈이 아니다. 기록을 읽는 조건은 `entry_filter` 하나이고 기본이 지출만이다.
"""

from __future__ import annotations

import re
import secrets
import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, and_, func, or_, select, update
from sqlalchemy.orm import InstrumentedAttribute, Session, aliased

from app.api.errors import ApiError, ErrorCode
from app.domain import aggregation as agg, book_report, settlement as settling
from app.domain.books import (
    FALLBACK_CATEGORY,
    INVITE_CODE_BYTES,
    INVITE_CODE_PATTERN,
    INVITE_DAYS,
    MAX_BOOKS_PER_USER,
    MAX_ENTRIES_PER_DAY,
    MAX_MEMBERS,
    RESTORE_DAYS,
    TRIP_PERIOD,
    BookEntryKind,
    BookKind,
    BookRole,
    SettleRule,
    category_seeds,
    invite_max_joins,
)
from app.domain.money import Money, ratio
from app.domain.period import DEFAULT_START_DAY, MAX_START_DAY, MIN_START_DAY, BudgetPeriod
from app.domain.report import rank_breakdown
from app.models import (
    Book,
    BookCategory,
    BookEntry,
    BookInvite,
    BookMember,
    Category,
    CategoryKind,
    Settlement,
    Transaction,
    User,
)
from app.modules import ledger
from app.modules.books.schemas import (
    BOOK_CATEGORY_LIMIT,
    BookCategoryChangeOut,
    BookCategoryCreate,
    BookCategoryOut,
    BookCreate,
    BookDueMemberOut,
    BookDuesOut,
    BookEntryCreate,
    BookEntryCreated,
    BookEntryListOut,
    BookEntryOut,
    BookInsightOut,
    BookInviteOut,
    BookListOut,
    BookMemberEntriesOut,
    BookMemberOut,
    BookMonthStateOut,
    BookOut,
    BookReportOut,
    DuesStatus,
    InvitePreviewOut,
    InviteStatus,
    JoinIn,
    MoveInIn,
    MoveOutResult,
    SettlementDoneIn,
    SettlementDoneOut,
    SettlementMemberOut,
    SettlementOut,
    SettlementTransferOut,
)
from app.modules.categories import service as categories
from app.modules.reports.schemas import to_breakdown
from app.modules.transactions import service as transactions

__all__ = [
    "absorb_memberships",
    "book_categories",
    "create_book",
    "create_category",
    "create_entry",
    "create_invite",
    "delete_book",
    "delete_entry",
    "entry_filter",
    "get_book",
    "get_dues",
    "get_report",
    "get_settlement",
    "join_book",
    "leave_book",
    "list_books",
    "list_entries",
    "mark_settlement_done",
    "member_entries",
    "month_state_for",
    "move_entry_in",
    "move_entry_out",
    "preview_invite",
    "remove_member",
    "require_book_category",
    "restore_book",
    "restore_entry",
    "stage_entry",
    "undo_move_in",
    "undo_move_out",
    "undo_settlement_done",
    "update_book",
    "update_entry",
    "writable_book",
]

_BOOK_NOT_FOUND = "가계부를 찾지 못했어요."
_ENTRY_NOT_FOUND = "기록을 찾지 못했어요."
_INVITE_NOT_FOUND = "초대 링크를 찾지 못했어요."
_MEMBER_NOT_FOUND = "멤버를 찾지 못했어요."
_CODE_RE = re.compile(INVITE_CODE_PATTERN)

# 초대 화면의 상태와 합류할 때의 오류가 같은 판정을 쓴다. 둘이 어긋나면 화면은 「같이 쓰기」 를
# 보여 놓고 누르면 막히게 된다.
_JOIN_ERRORS: dict[str, tuple[ErrorCode, str]] = {
    "ended": (ErrorCode.BOOK_ENDED, "완료한 가계부라 들어갈 수 없어요."),
    "closed": (ErrorCode.INVITE_CLOSED, "더 이상 쓸 수 없는 초대 링크예요."),
    "expired": (ErrorCode.INVITE_EXPIRED, "초대 링크가 만료됐어요."),
    "full": (ErrorCode.BOOK_FULL, f"이 가계부는 {MAX_MEMBERS}명이 다 찼어요."),
}


def _now() -> datetime:
    return datetime.now(UTC)


def _not_found(message: str = _BOOK_NOT_FOUND) -> ApiError:
    return ApiError(ErrorCode.NOT_FOUND, message, status_code=404)


def _tz(book: Book) -> ZoneInfo:
    return ledger.zone(book.timezone)


def _today(book: Book) -> date:
    """가계부 시간대의 오늘. 오늘을 읽는 곳은 여기 하나라 테스트는 이것만 바꿔 날을 고정한다."""
    return datetime.now(_tz(book)).date()


def _start_day(book: Book) -> int:
    """가계부 시작일. 비었거나 범위 밖이면 1(달력 월)."""
    value = book.month_start_day
    if value is None or not MIN_START_DAY <= value <= MAX_START_DAY:
        return DEFAULT_START_DAY
    return value


def _period_containing(book: Book, day: date) -> BudgetPeriod:
    return BudgetPeriod.containing(day, _start_day(book))


def _period_of(book: Book, year: int, month: int) -> BudgetPeriod:
    """이름이 `year`년 `month`월인 가계부의 한 달. 시작일 25 면 10월은 9/25 ~ 10/24 다."""
    return BudgetPeriod.of_month(year, month, _start_day(book))


def _book_period(book: Book, asked: BudgetPeriod | None) -> BudgetPeriod:
    """질의로 받은 달을 가계부의 한 달로. 안 보냈으면 오늘이 든 기간.

    라우터의 `MonthQuery` 는 가계부를 모르고 달력 월을 만든다. 그 시작 연월이 곧 물은 이름 달이라
    그것만 읽어 시작일로 다시 만든다. 그래야 질의 모양과 openapi 가 그대로다.
    """
    if asked is None:
        return _period_containing(book, _today(book))
    return _period_of(book, asked.start.year, asked.start.month)


def _joined(member: BookMember) -> tuple[datetime, str]:
    return ledger.as_utc(member.joined_at), str(member.id)


# ── 접근 ───────────────────────────────────────────────


@dataclass(frozen=True)
class _Access:
    book: Book
    me: BookMember

    @property
    def is_owner(self) -> bool:
        return self.me.role is BookRole.OWNER


def _active_membership(
    session: Session, book_id: uuid.UUID, user_id: uuid.UUID
) -> BookMember | None:
    return session.scalar(
        select(BookMember).where(
            BookMember.book_id == book_id,
            BookMember.user_id == user_id,
            BookMember.left_at.is_(None),
        )
    )


def _access(session: Session, user: User, book_id: uuid.UUID, *, lock: bool = False) -> _Access:
    """안 지운 가계부의 지금 멤버만 통과한다. 아니면 있는지도 알리지 않고 404."""
    stmt = select(Book).where(Book.id == book_id, Book.deleted_at.is_(None))
    if lock:
        stmt = stmt.with_for_update()
    book = session.scalar(stmt)
    if book is None:
        raise _not_found()
    me = _active_membership(session, book.id, user.id)
    if me is None:
        raise _not_found()
    return _Access(book=book, me=me)


def _require_owner(access: _Access) -> None:
    if not access.is_owner:
        raise _not_found()


def _require_open(book: Book, message: str = "완료한 가계부라 적을 수 없어요.") -> None:
    if book.ended_at is not None:
        raise ApiError(ErrorCode.BOOK_ENDED, message, status_code=409)


def _members(session: Session, book_id: uuid.UUID) -> list[BookMember]:
    return list(session.scalars(select(BookMember).where(BookMember.book_id == book_id)))


def _my_member_ids(session: Session, book_id: uuid.UUID, user_id: uuid.UUID) -> set[uuid.UUID]:
    """나갔다 다시 들어오면 줄이 둘이다. 예전 줄로 적은 기록도 내 것이다."""
    return set(
        session.scalars(
            select(BookMember.id).where(
                BookMember.book_id == book_id, BookMember.user_id == user_id
            )
        )
    )


# ── 가계부 ─────────────────────────────────────────────


def _used_up(invite: BookInvite) -> bool:
    return invite.max_joins is not None and invite.join_count >= invite.max_joins


def _live_invite(session: Session, book: Book, now: datetime) -> BookInvite | None:
    rows = session.scalars(
        select(BookInvite)
        .where(BookInvite.book_id == book.id, BookInvite.closed_at.is_(None))
        .order_by(BookInvite.created_at.desc())
    )
    for row in rows:
        if not _used_up(row) and ledger.as_utc(row.expires_at) > now:
            return row
    return None


def _close_invites(session: Session, book_id: uuid.UUID, now: datetime) -> None:
    session.execute(
        update(BookInvite)
        .where(BookInvite.book_id == book_id, BookInvite.closed_at.is_(None))
        .values(closed_at=now)
    )


def _new_invite(book: Book, me: BookMember, now: datetime) -> BookInvite:
    return BookInvite(
        book_id=book.id,
        code=secrets.token_urlsafe(INVITE_CODE_BYTES),
        created_by_member_id=me.id,
        expires_at=now + timedelta(days=INVITE_DAYS),
        max_joins=invite_max_joins(book.kind),
        join_count=0,
    )


def _member_out(member: BookMember, me: BookMember) -> BookMemberOut:
    left = member.left_at is not None
    return BookMemberOut(
        id=member.id,
        # 나간 사람의 이름은 내보내지 않는다.
        name=None if left else member.display_name,
        role=member.role,
        is_me=member.id == me.id,
        joined_at=member.joined_at,
        left=left,
    )


def _book_out(
    session: Session, book: Book, me: BookMember, *, now: datetime | None = None
) -> BookOut:
    members = _members(session, book.id)
    active = sorted((m for m in members if m.left_at is None), key=_joined)
    gone = sorted((m for m in members if m.left_at is not None), key=_joined)
    cats = book_categories(session, book)
    invite = _live_invite(session, book, now or _now())
    percents = _percents(book)
    return BookOut(
        id=book.id,
        kind=book.kind,
        name=book.name,
        settle_rule=book.settle_rule,
        monthly_budget=book.monthly_budget,
        month_start_day=_start_day(book),
        share_percents=(
            {uuid.UUID(key): value for key, value in percents.items()}
            if percents is not None
            else None
        ),
        dues_amount=book.dues_amount,
        ended=book.ended_at is not None,
        ended_at=book.ended_at,
        created_at=book.created_at,
        my_member_id=me.id,
        my_role=me.role,
        members=[_member_out(m, me) for m in [*active, *gone]],
        active_member_count=len(active),
        categories=[BookCategoryOut.model_validate(c) for c in cats],
        invite=BookInviteOut.model_validate(invite) if invite is not None else None,
    )


def list_books(session: Session, user: User) -> BookListOut:
    """내가 지금 멤버인 가계부. 지운 것은 빼고 끝난 것은 담는다."""
    rows = session.execute(
        select(Book, BookMember)
        .join(BookMember, BookMember.book_id == Book.id)
        .where(
            BookMember.user_id == user.id,
            BookMember.left_at.is_(None),
            Book.deleted_at.is_(None),
        )
    ).all()
    now = _now()
    items = [_book_out(session, book, me, now=now) for book, me in rows]
    items.sort(key=lambda item: (item.ended, -item.created_at.timestamp(), str(item.id)))
    return BookListOut(items=items)


def _require_book_room(session: Session, user: User) -> None:
    """지금 멤버로 같이 쓰는 가계부가 상한이면 더 만들거나 들어가지 못한다."""
    count = session.scalar(
        select(func.count())
        .select_from(BookMember)
        .join(Book, Book.id == BookMember.book_id)
        .where(
            BookMember.user_id == user.id,
            BookMember.left_at.is_(None),
            Book.deleted_at.is_(None),
        )
    )
    if (count or 0) >= MAX_BOOKS_PER_USER:
        raise ApiError(
            ErrorCode.USAGE_LIMIT,
            f"가계부는 {MAX_BOOKS_PER_USER}개까지 함께 쓸 수 있어요.",
            status_code=429,
        )


def create_book(session: Session, user: User, body: BookCreate) -> BookOut:
    """가계부, 관리자 멤버, 종류별 분류, 살아 있는 초대를 한 번에 만든다."""
    _require_book_room(session, user)
    now = _now()
    book = Book(
        kind=body.kind,
        name=body.name,
        settle_rule=body.settle_rule,
        monthly_budget=None,
        timezone=user.timezone or ledger.DEFAULT_TIMEZONE,
        created_by_user_id=user.id,
    )
    session.add(book)
    session.flush()

    me = BookMember(
        book_id=book.id,
        user_id=user.id,
        display_name=body.my_name,
        role=BookRole.OWNER,
        joined_at=now,
    )
    session.add(me)
    session.add_all(
        BookCategory(
            book_id=book.id, name=seed.name, icon_key=seed.icon_key, sort_order=seed.sort_order
        )
        for seed in category_seeds(body.kind)
    )
    session.flush()
    session.add(_new_invite(book, me, now))
    session.commit()
    return _book_out(session, book, me, now=now)


def get_book(session: Session, user: User, book_id: uuid.UUID) -> BookOut:
    access = _access(session, user, book_id)
    return _book_out(session, access.book, access.me)


# 관리자만 고치는 칸과 멤버 누구나 고치는 칸. 회비와 예산은 같이 쓰는 사람 모두의 일이다.
_OWNER_FIELDS = ("name", "ended")
_MEMBER_FIELDS = ("settle_rule", "monthly_budget", "month_start_day", "dues_amount")


def _percents(book: Book) -> dict[str, int] | None:
    """저장한 회비 비율. 모양이 깨졌으면 없는 것(똑같이)으로 본다."""
    raw = book.share_percents
    if not isinstance(raw, Mapping) or not raw:
        return None
    try:
        return {str(uuid.UUID(str(key))): int(value) for key, value in raw.items()}
    except (TypeError, ValueError):
        return None


def _checked_percents(
    session: Session, book: Book, value: Mapping[uuid.UUID, int] | None
) -> dict[str, int] | None:
    """비율 키는 지금 멤버 id 전부와 정확히 같아야 한다. 빠지거나 남는 사람이 있으면 422."""
    if value is None:
        return None
    active = {m.id for m in _members(session, book.id) if m.left_at is None}
    if set(value) != active:
        raise ApiError(
            ErrorCode.INVALID_REQUEST, "비율은 지금 멤버 모두에게 정해 주세요.", status_code=422
        )
    return {str(key): int(percent) for key, percent in value.items()}


def update_book(session: Session, user: User, book_id: uuid.UUID, data: dict[str, Any]) -> BookOut:
    """`data` 는 보낸 필드만 담는다(exclude_unset). name, ended 는 관리자만.

    비율을 고칠 때는 가계부 줄을 잠근다. 그 사이 누가 들어오면 비율이 사람과 어긋난다.
    """
    access = _access(session, user, book_id, lock="share_percents" in data)
    book = access.book
    if any(field in data for field in _OWNER_FIELDS) and not access.is_owner:
        raise _not_found()

    if "name" in data:
        book.name = data["name"]
    for field in _MEMBER_FIELDS:
        # monthly_budget 과 dues_amount 의 null 은 지운다. 나머지는 스키마가 null 을 막는다.
        if field in data:
            setattr(book, field, data[field])
    if "share_percents" in data:
        book.share_percents = _checked_percents(session, book, data["share_percents"])
    if "ended" in data:
        if data["ended"] and book.ended_at is None:
            book.ended_at = _now()
        elif not data["ended"]:
            book.ended_at = None
    session.commit()
    return _book_out(session, book, access.me)


def delete_book(session: Session, user: User, book_id: uuid.UUID) -> None:
    """관리자만. 소프트 삭제하고 초대를 닫는다."""
    access = _access(session, user, book_id)
    _require_owner(access)
    now = _now()
    access.book.deleted_at = now
    access.book.deleted_by_user_id = user.id
    _close_invites(session, access.book.id, now)
    session.commit()


def restore_book(session: Session, user: User, book_id: uuid.UUID) -> BookOut:
    """지운 사람이 아직 관리자이고 지운 지 30일 안이면 되살린다. 아니면 404."""
    book = session.get(Book, book_id)
    if book is None or book.deleted_at is None or book.deleted_by_user_id != user.id:
        raise _not_found()
    if ledger.as_utc(book.deleted_at) < _now() - timedelta(days=RESTORE_DAYS):
        raise _not_found()
    me = _active_membership(session, book.id, user.id)
    if me is None or me.role is not BookRole.OWNER:
        raise _not_found()
    book.deleted_at = None
    book.deleted_by_user_id = None
    session.commit()
    return _book_out(session, book, me)


# ── 초대와 멤버 ─────────────────────────────────────────


def create_invite(session: Session, user: User, book_id: uuid.UUID) -> BookInviteOut:
    """앞선 살아 있는 초대를 닫고 새로 만든다. 완료한 가계부면 BOOK_ENDED."""
    access = _access(session, user, book_id)
    _require_open(access.book, "완료한 가계부라 초대할 수 없어요.")
    now = _now()
    _close_invites(session, access.book.id, now)
    invite = _new_invite(access.book, access.me, now)
    session.add(invite)
    session.commit()
    return BookInviteOut.model_validate(invite)


def _find_invite(session: Session, code: str) -> BookInvite:
    """모르는 코드와 형식이 틀린 코드는 같은 404 다. 화면이 한 가지로 안내한다."""
    if not _CODE_RE.fullmatch(code):
        raise _not_found(_INVITE_NOT_FOUND)
    invite = session.scalar(select(BookInvite).where(BookInvite.code == code))
    if invite is None:
        raise _not_found(_INVITE_NOT_FOUND)
    return invite


def _removed_since(session: Session, book: Book, user_id: uuid.UUID, invite: BookInvite) -> bool:
    """이 링크가 나온 뒤 관리자가 내보낸 사람인가. 그 사람은 새 링크가 있어야 돌아온다."""
    made = ledger.as_utc(invite.created_at)
    return any(
        removed is not None and ledger.as_utc(removed) >= made
        for removed in session.scalars(
            select(BookMember.removed_at).where(
                BookMember.book_id == book.id, BookMember.user_id == user_id
            )
        )
    )


def _invite_status(
    invite: BookInvite, book: Book, active_count: int, now: datetime, *, removed: bool = False
) -> InviteStatus:
    if book.ended_at is not None:
        return "ended"
    if invite.closed_at is not None or _used_up(invite) or removed:
        return "closed"
    if ledger.as_utc(invite.expires_at) <= now:
        return "expired"
    if active_count >= MAX_MEMBERS:
        return "full"
    return "ok"


def preview_invite(session: Session, user: User, code: str) -> InvitePreviewOut:
    """모르는 코드, 형식이 틀린 코드, 지운 가계부는 404."""
    invite = _find_invite(session, code)
    book = session.scalar(select(Book).where(Book.id == invite.book_id, Book.deleted_at.is_(None)))
    if book is None:
        raise _not_found(_INVITE_NOT_FOUND)

    active = [m for m in _members(session, book.id) if m.left_at is None]
    mine = next((m for m in active if m.user_id == user.id), None)
    inviter = (
        session.get(BookMember, invite.created_by_member_id)
        if invite.created_by_member_id is not None
        else None
    )
    status: InviteStatus = (
        "member"
        if mine is not None
        else _invite_status(
            invite,
            book,
            len(active),
            _now(),
            removed=_removed_since(session, book, user.id, invite),
        )
    )
    # 못 쓰는 링크로는 가계부 근황(바뀐 이름, 인원)을 알리지 않는다. 내보낸 사람이 옛 링크를
    # 들고 있어도 그렇다. 만료 화면은 「누구에게 새 링크를 부탁할지」 만 쓰니 초대한 사람만 남긴다.
    sealed = status in ("closed", "ended", "expired")
    return InvitePreviewOut(
        status=status,
        book_kind=book.kind,
        book_name="" if sealed else book.name,
        # 초대한 사람이 나갔으면 이름을 싣지 않는다.
        inviter_name=(
            inviter.display_name
            if inviter is not None and inviter.left_at is None and status not in ("closed", "ended")
            else None
        ),
        active_member_count=0 if sealed else len(active),
        book_id=book.id if mine is not None else None,
        is_inviter=mine is not None and inviter is not None and inviter.user_id == user.id,
    )


def join_book(session: Session, user: User, code: str, body: JoinIn) -> BookOut:
    """이미 멤버면 그대로 돌려준다. 가계부 행을 잠근 뒤 인원을 센다."""
    invite = _find_invite(session, code)
    book = session.scalar(
        select(Book).where(Book.id == invite.book_id, Book.deleted_at.is_(None)).with_for_update()
    )
    if book is None:
        raise _not_found(_INVITE_NOT_FOUND)
    # 잠그기 전에 읽은 값이다. 그 사이 다른 사람이 들어왔으면 센 횟수가 달라져 있다.
    session.refresh(invite)

    mine = _active_membership(session, book.id, user.id)
    if mine is not None:
        return _book_out(session, book, mine)
    _require_book_room(session, user)

    now = _now()
    active_count = sum(1 for m in _members(session, book.id) if m.left_at is None)
    status = _invite_status(
        invite, book, active_count, now, removed=_removed_since(session, book, user.id, invite)
    )
    if status != "ok":
        code_, message = _JOIN_ERRORS[status]
        raise ApiError(code_, message, status_code=409)

    member = BookMember(
        book_id=book.id,
        user_id=user.id,
        display_name=body.name,
        role=BookRole.MEMBER,
        joined_at=now,
    )
    session.add(member)
    invite.join_count += 1
    if _used_up(invite):
        invite.closed_at = now
    _reset_percents(book)
    session.commit()
    return _book_out(session, book, member, now=now)


def _reset_percents(book: Book) -> None:
    """사람이 바뀌면 비율을 똑같이로 돌린다. 남은 비율을 짐작해 나누지 않는다."""
    book.share_percents = None


def leave_book(session: Session, user: User, book_id: uuid.UUID) -> None:
    """관리자가 나가면 가장 먼저 들어온 멤버가 관리자가 된다. 아무도 안 남으면 가계부를 지운다."""
    access = _access(session, user, book_id, lock=True)
    book, me = access.book, access.me
    now = _now()
    others = sorted(
        (m for m in _members(session, book.id) if m.left_at is None and m.id != me.id),
        key=_joined,
    )
    me.left_at = now
    _reset_percents(book)
    if me.role is BookRole.OWNER:
        me.role = BookRole.MEMBER
        if others:
            others[0].role = BookRole.OWNER
    if not others:
        book.deleted_at = now
        book.deleted_by_user_id = user.id
        _close_invites(session, book.id, now)
    session.commit()


def remove_member(session: Session, user: User, book_id: uuid.UUID, member_id: uuid.UUID) -> None:
    """관리자만, 자기 자신은 안 된다. 링크는 닫지 않고 내보낸 사람만 그 링크로 못 돌아온다."""
    access = _access(session, user, book_id, lock=True)
    _require_owner(access)
    target = session.get(BookMember, member_id)
    if (
        target is None
        or target.book_id != access.book.id
        or target.left_at is not None
        or target.id == access.me.id
    ):
        raise _not_found(_MEMBER_NOT_FOUND)
    now = _now()
    target.left_at = now
    target.removed_at = now
    _reset_percents(access.book)
    session.commit()


def absorb_memberships(session: Session, *, source: User, target: User) -> None:
    """이메일로 합칠 때 source 의 멤버 줄을 target 으로 옮긴다. commit 은 부르는 쪽이 한다.

    옮기지 않으면 접힌 source 에 멤버 줄이 남아 그 사람이 공유 가계부를 통째로 잃는다.
    둘이 같은 가계부의 멤버였으면 source 가 적은 기록을 target 멤버 줄로 돌리고 source 줄은
    나간 것으로 둔다. 한 사람이 한 가계부에 두 번 있을 수는 없다.
    """
    now = _now()
    for row in session.scalars(select(BookMember).where(BookMember.user_id == source.id)).all():
        keep = _active_membership(session, row.book_id, target.id) if row.left_at is None else None
        if keep is not None:
            _repoint_member(session, old=row.id, new=keep.id)
            # 두 줄이 한 사람이 되면 비율의 키 하나가 사라진다.
            session.execute(update(Book).where(Book.id == row.book_id).values(share_percents=None))
            if row.role is BookRole.OWNER:
                keep.role = BookRole.OWNER
                row.role = BookRole.MEMBER
            row.left_at = now
        row.user_id = target.id
    for column in (Book.created_by_user_id, Book.deleted_by_user_id):
        session.execute(update(Book).where(column == source.id).values({column.key: target.id}))
    session.flush()


def _repoint_member(session: Session, *, old: uuid.UUID, new: uuid.UUID) -> None:
    columns: tuple[InstrumentedAttribute[uuid.UUID | None], ...] = (
        BookEntry.created_by_member_id,
        BookEntry.paid_by_member_id,
        BookEntry.updated_by_member_id,
        BookEntry.deleted_by_member_id,
    )
    for column in columns:
        session.execute(update(BookEntry).where(column == old).values({column.key: new}))
    # 적은 사람이 고친 것은 고친 사람 칸을 비운다(적은 사람과 같으면 비운다는 규칙).
    session.execute(
        update(BookEntry)
        .where(BookEntry.created_by_member_id == new, BookEntry.updated_by_member_id == new)
        .values(updated_by_member_id=None)
    )
    session.execute(
        update(BookInvite)
        .where(BookInvite.created_by_member_id == old)
        .values(created_by_member_id=new)
    )
    session.execute(
        update(Settlement).where(Settlement.done_by_member_id == old).values(done_by_member_id=new)
    )


# ── 공유 기록 ───────────────────────────────────────────


# 지출만. 입금은 쓴 돈이 아니라서 합계, 정산, 리포트, 중복 판정이 이것만 본다.
_SPENDING: tuple[BookEntryKind, ...] = (BookEntryKind.EXPENSE,)
_DEPOSITS: tuple[BookEntryKind, ...] = (BookEntryKind.DEPOSIT,)


def entry_filter(
    book: Book,
    *,
    kinds: Sequence[BookEntryKind] | None = _SPENDING,
    period: BudgetPeriod | None = None,
) -> list[ColumnElement[bool]]:
    """살아 있는 공유 기록을 거르는 조건. 기록을 읽는 곳은 전부 이것을 쓴다.

    지운 것과 내 가계부로 옮겨 나간 것은 뺀다. `kinds` 가 None 이면 종류를 가리지 않는다.
    `period` 가 있으면 그 날짜 안만 본다.
    """
    where: list[ColumnElement[bool]] = [
        BookEntry.book_id == book.id,
        BookEntry.deleted_at.is_(None),
        BookEntry.moved_out_at.is_(None),
    ]
    if kinds is not None:
        where.append(BookEntry.kind.in_(kinds))
    if period is not None:
        where += [BookEntry.occurred_on >= period.start, BookEntry.occurred_on <= period.end]
    return where


def _sums_by_kind(
    session: Session, book: Book, period: BudgetPeriod | None, *extra: ColumnElement[bool]
) -> dict[BookEntryKind, Money]:
    rows = session.execute(
        select(BookEntry.kind, func.coalesce(func.sum(BookEntry.amount), 0))
        .where(*entry_filter(book, kinds=None, period=period), *extra)
        .group_by(BookEntry.kind)
    )
    sums = {kind: Money.zero() for kind in BookEntryKind}
    for kind, total in rows:
        sums[BookEntryKind(kind)] = Money(Decimal(total or 0))
    return sums


def _can_delete(entry: BookEntry, mine: set[uuid.UUID], is_owner: bool) -> bool:
    """화면의 지우기 단추와 서버 검사가 같은 판정을 쓴다. 어긋나면 단추를 눌러 404 를 본다."""
    return entry.created_by_member_id in mine or is_owner


def _entry_out(entry: BookEntry, mine: set[uuid.UUID], is_owner: bool) -> BookEntryOut:
    written_by_me = entry.created_by_member_id in mine
    return BookEntryOut(
        id=entry.id,
        book_id=entry.book_id,
        kind=entry.kind,
        amount=entry.amount,
        category_id=entry.category_id,
        title=entry.title,
        memo=entry.memo,
        occurred_on=entry.occurred_on,
        created_by_member_id=entry.created_by_member_id,
        paid_by_member_id=entry.paid_by_member_id,
        updated_by_member_id=entry.updated_by_member_id,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        can_delete=_can_delete(entry, mine, is_owner),
        # 입금을 내 가계부로 옮기면 넣은 돈이 내 지출이 된다.
        can_move=written_by_me and entry.kind is BookEntryKind.EXPENSE,
        written_by_me=written_by_me,
    )


def _require_entry_room(session: Session, book: Book) -> None:
    """한 가계부에 24시간 동안 적은 줄이 상한이면 더 적지 못한다. 지운 줄도 센다.

    지우고 다시 적기를 되풀이해 표를 끝없이 키우지 못하게.
    """
    count = session.scalar(
        select(func.count())
        .select_from(BookEntry)
        .where(BookEntry.book_id == book.id, BookEntry.created_at >= _now() - timedelta(days=1))
    )
    if (count or 0) >= MAX_ENTRIES_PER_DAY:
        raise ApiError(
            ErrorCode.USAGE_LIMIT,
            "오늘은 이 가계부에 충분히 적었어요. 내일 다시 적어 주세요.",
            status_code=429,
        )


def _live_entry(session: Session, book: Book, entry_id: uuid.UUID) -> BookEntry:
    entry = session.get(BookEntry, entry_id)
    if entry is None or entry.book_id != book.id or entry.deleted_at is not None:
        raise _not_found(_ENTRY_NOT_FOUND)
    return entry


def _book_category(session: Session, book: Book, category_id: uuid.UUID) -> BookCategory | None:
    """이 가계부의 지우지 않은 분류. 아니면 None."""
    row = session.get(BookCategory, category_id)
    if row is None or row.book_id != book.id or row.deleted_at is not None:
        return None
    return row


def _require_category(session: Session, book: Book, category_id: uuid.UUID | None) -> None:
    """같은 가계부의 분류만 받는다. 다른 가계부 분류를 달면 상대 화면이 이름을 못 푼다."""
    if category_id is not None and _book_category(session, book, category_id) is None:
        raise ApiError(ErrorCode.INVALID_CATEGORY, "분류를 찾지 못했어요.", status_code=422)


def _payer(session: Session, book: Book, me: BookMember, member_id: uuid.UUID | None) -> uuid.UUID:
    """낸 사람. 비우면 나다. 지금 멤버만 고를 수 있다."""
    if member_id is None:
        return me.id
    row = session.get(BookMember, member_id)
    if row is None or row.book_id != book.id or row.left_at is not None:
        raise ApiError(ErrorCode.INVALID_REQUEST, "낸 사람을 찾지 못했어요.", status_code=422)
    return row.id


def _month_state(
    session: Session, book: Book, period: BudgetPeriod, *, whole: bool = False
) -> BookMonthStateOut:
    """`whole` 이면 기간과 상관없이 지우지 않은 기록 전부를 센다(여행 가계부).

    쓴 돈과 남은 예산은 지출만 본다. 넣은 돈은 따로 싣고 둘을 합치지 않는다.
    """
    sums = _sums_by_kind(session, book, None if whole else period)
    spent = sums[BookEntryKind.EXPENSE]
    budget = Money(book.monthly_budget) if book.monthly_budget is not None else None
    return BookMonthStateOut(
        period_start=period.start,
        period_end=period.end,
        spent=spent.amount,
        budget=budget.amount if budget is not None else None,
        remaining=(budget - spent).amount if budget is not None else None,
        deposited=sums[BookEntryKind.DEPOSIT].amount,
    )


def _trip_period(session: Session, book: Book) -> BudgetPeriod:
    """여행 가계부는 달이 아니라 여행 전체다. 가장 이른 기록부터 오늘(가계부 시간대)까지.

    쓴 돈은 이 기간이 아니라 지우지 않은 기록 전부로 센다(`_month_state(whole=True)`).
    정산 화면의 여행 전체 합계와 같은 숫자여야 한다.
    """
    today = _today(book)
    first = session.scalar(select(func.min(BookEntry.occurred_on)).where(*entry_filter(book)))
    start = first or today
    # 앞날로 적은 기록만 있으면 시작이 오늘보다 늦다. 기간이 뒤집히지 않게 끝을 맞춘다.
    return BudgetPeriod(start, max(today, start))


def _created(session: Session, access: _Access, entry: BookEntry) -> BookEntryCreated:
    mine = _my_member_ids(session, access.book.id, access.me.user_id)
    trip = access.book.kind is BookKind.TRIP
    period = (
        _trip_period(session, access.book)
        if trip
        else _period_containing(access.book, entry.occurred_on)
    )
    return BookEntryCreated(
        entry=_entry_out(entry, mine, access.is_owner),
        month=_month_state(session, access.book, period, whole=trip),
    )


_NEWEST_FIRST = (BookEntry.occurred_on.desc(), BookEntry.created_at.desc(), BookEntry.id.desc())


def list_entries(
    session: Session,
    user: User,
    book_id: uuid.UUID,
    period: BudgetPeriod | None,
    *,
    include_deposits: bool = False,
) -> BookEntryListOut:
    """그 달의 기록. 달은 가계부 시간대와 시작일로 끊고, 안 보내면 이번 달.

    입금은 `include_deposits` 일 때만 싣는다. 옛 화면은 이 값을 몰라 입금을 지출로 그린다.
    """
    access = _access(session, user, book_id)
    period = _book_period(access.book, period)
    kinds = None if include_deposits else _SPENDING
    rows = session.scalars(
        select(BookEntry)
        .where(*entry_filter(access.book, kinds=kinds, period=period))
        .order_by(*_NEWEST_FIRST)
    )
    mine = _my_member_ids(session, access.book.id, user.id)
    return BookEntryListOut(items=[_entry_out(row, mine, access.is_owner) for row in rows])


def create_entry(
    session: Session, user: User, book_id: uuid.UUID, body: BookEntryCreate
) -> BookEntryCreated:
    access = _access(session, user, book_id)
    _require_open(access.book)
    _require_entry_room(session, access.book)
    # 입금에 분류가 오면 스키마가 이미 막았다.
    _require_category(session, access.book, body.category_id)
    entry = BookEntry(
        book_id=access.book.id,
        kind=body.kind,
        amount=body.amount,
        category_id=body.category_id,
        title=body.title,
        memo=body.memo,
        occurred_on=body.occurred_on,
        created_by_member_id=access.me.id,
        paid_by_member_id=_payer(session, access.book, access.me, body.paid_by_member_id),
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return _created(session, access, entry)


_ENTRY_FIELDS = ("amount", "category_id", "title", "memo", "occurred_on", "paid_by_member_id")


def update_entry(
    session: Session,
    user: User,
    book_id: uuid.UUID,
    entry_id: uuid.UUID,
    data: dict[str, Any],
) -> BookEntryOut:
    """`data` 는 보낸 필드만 담는다. 적은 사람이 아니면 updated_by 를 나로 둔다."""
    access = _access(session, user, book_id)
    _require_open(access.book)
    entry = _live_entry(session, access.book, entry_id)
    payload = {key: value for key, value in data.items() if key in _ENTRY_FIELDS}
    if "category_id" in payload:
        if entry.kind is BookEntryKind.DEPOSIT and payload["category_id"] is not None:
            raise ApiError(
                ErrorCode.INVALID_CATEGORY, "입금에는 분류를 달 수 없어요.", status_code=422
            )
        _require_category(session, access.book, payload["category_id"])
    if "paid_by_member_id" in payload:
        # null 은 나로 본다. 만들 때의 기본값과 같다.
        payload["paid_by_member_id"] = _payer(
            session, access.book, access.me, payload["paid_by_member_id"]
        )

    for field, value in payload.items():
        setattr(entry, field, value)
    mine = _my_member_ids(session, access.book.id, user.id)
    entry.updated_by_member_id = None if entry.created_by_member_id in mine else access.me.id
    session.commit()
    session.refresh(entry)
    return _entry_out(entry, mine, access.is_owner)


def delete_entry(session: Session, user: User, book_id: uuid.UUID, entry_id: uuid.UUID) -> None:
    """적은 사람이나 관리자만. 소프트 삭제."""
    access = _access(session, user, book_id)
    _require_open(access.book)
    entry = _live_entry(session, access.book, entry_id)
    mine = _my_member_ids(session, access.book.id, user.id)
    if not _can_delete(entry, mine, access.is_owner):
        raise _not_found(_ENTRY_NOT_FOUND)
    entry.deleted_at = _now()
    entry.deleted_by_member_id = access.me.id
    session.commit()


def restore_entry(
    session: Session, user: User, book_id: uuid.UUID, entry_id: uuid.UUID
) -> BookEntryOut:
    """지운 기록 되돌리기. 적은 사람이나 관리자만. 내 가계부로 옮긴 기록은 살리지 않는다."""
    access = _access(session, user, book_id)
    _require_open(access.book)
    entry = session.get(BookEntry, entry_id)
    if (
        entry is None
        or entry.book_id != access.book.id
        or entry.deleted_at is None
        or entry.moved_out_at is not None
    ):
        raise _not_found(_ENTRY_NOT_FOUND)
    mine = _my_member_ids(session, access.book.id, user.id)
    if not _can_delete(entry, mine, access.is_owner):
        raise _not_found(_ENTRY_NOT_FOUND)
    entry.deleted_at = None
    entry.deleted_by_member_id = None
    session.commit()
    session.refresh(entry)
    return _entry_out(entry, mine, access.is_owner)


def _personal_category_for(
    session: Session, user: User, overrides: dict[str, dict[str, str | None]], name: str | None
) -> uuid.UUID | None:
    """내 화면에 같은 이름으로 보이는 지출 분류. 없으면 기본 「기타」."""
    rows = session.scalars(
        select(Category).where(
            Category.deleted_at.is_(None),
            Category.kind == CategoryKind.EXPENSE,
            or_(Category.user_id == user.id, Category.user_id.is_(None)),
        )
    ).all()
    if name is not None:
        for row in rows:
            if categories.effective_name(row, overrides) == name:
                return row.id
    fallback = next(
        (row for row in rows if row.user_id is None and row.name == FALLBACK_CATEGORY), None
    )
    return fallback.id if fallback is not None else None


def _book_category_for(session: Session, book: Book, name: str | None) -> uuid.UUID | None:
    """가계부에 같은 이름의 분류가 있으면 그것, 없으면 가계부의 「기타」."""
    by_name = {row.name: row.id for row in book_categories(session, book)}
    if name is not None and name in by_name:
        return by_name[name]
    return by_name.get(FALLBACK_CATEGORY)


def _require_personal_expense(session: Session, user: User, category_id: uuid.UUID) -> None:
    """내 화면에 보이는 지출 분류만. 수입 분류로 옮기면 지출이 수입 분류를 단다."""
    categories.require_owned(session, user, category_id)
    row = session.get(Category, category_id)
    if row is None or row.kind is not CategoryKind.EXPENSE:
        raise ApiError(ErrorCode.INVALID_CATEGORY, "지출 분류를 골라 주세요.", status_code=422)


def move_entry_out(
    session: Session,
    user: User,
    book_id: uuid.UUID,
    entry_id: uuid.UUID,
    *,
    category_id: uuid.UUID | None = None,
) -> MoveOutResult:
    """적은 사람만. 내 거래를 만들고 공유 기록을 지우는 것을 한 commit 으로 묶는다.

    `category_id` 는 옮기면서 고른 내 분류다. 안 주면 같은 이름의 내 분류, 없으면 「기타」.
    """
    access = _access(session, user, book_id)
    _require_open(access.book)
    entry = _live_entry(session, access.book, entry_id)
    if entry.created_by_member_id not in _my_member_ids(session, access.book.id, user.id):
        raise _not_found(_ENTRY_NOT_FOUND)
    if entry.kind is not BookEntryKind.EXPENSE:
        raise ApiError(
            ErrorCode.INVALID_REQUEST, "입금은 내 가계부로 옮길 수 없어요.", status_code=422
        )

    if category_id is not None:
        _require_personal_expense(session, user, category_id)
    else:
        # 설정 행이 없으면 여기서 만들며 commit 한다. 아무것도 바꾸기 전에 부른다.
        overrides = categories.category_overrides(session, user)
        book_category = session.get(BookCategory, entry.category_id) if entry.category_id else None
        category_id = _personal_category_for(
            session, user, overrides, book_category.name if book_category is not None else None
        )

    tx = transactions.stage_moved_expense(
        session,
        user,
        amount=entry.amount,
        occurred_at=ledger.noon_at(entry.occurred_on, user),
        merchant=entry.title,
        memo=entry.memo,
        category_id=category_id,
    )
    now = _now()
    entry.deleted_at = now
    entry.deleted_by_member_id = access.me.id
    # 되돌리기로 살리면 같은 돈이 두 가계부에 함께 잡힌다.
    entry.moved_out_at = now
    entry.moved_to_transaction_id = tx.id
    session.commit()
    return MoveOutResult(transaction_id=tx.id)


def move_entry_in(
    session: Session, user: User, book_id: uuid.UUID, body: MoveInIn
) -> BookEntryCreated:
    """내 지출 하나를 공유 기록으로 옮긴다. 만들기와 원본 지우기를 한 commit 으로 묶는다."""
    access = _access(session, user, book_id)
    _require_open(access.book)
    _require_entry_room(session, access.book)
    tx = transactions.get_owned(session, user, body.transaction_id)
    if (
        tx.type is not agg.TransactionType.EXPENSE
        or tx.source is agg.TransactionSource.NO_SPEND
        or tx.refund_of_transaction_id is not None
        or transactions.is_refunded(session, tx.id)
    ):
        # 환불이 걸린 지출을 옮기면 개인 쪽 환불이 되돌릴 지출을 잃는다.
        raise ApiError(ErrorCode.INVALID_REQUEST, "옮길 수 없는 기록이에요.", status_code=422)

    if body.category_id is not None:
        _require_category(session, access.book, body.category_id)
        book_category_id: uuid.UUID | None = body.category_id
    else:
        overrides = categories.category_overrides(session, user)
        personal = session.get(Category, tx.category_id) if tx.category_id else None
        name = categories.effective_name(personal, overrides) if personal is not None else None
        book_category_id = _book_category_for(session, access.book, name)

    entry = BookEntry(
        book_id=access.book.id,
        amount=tx.amount,
        category_id=book_category_id,
        title=tx.merchant,
        memo=tx.memo,
        occurred_on=ledger.local_date(tx.occurred_at, ledger.user_tz(user)),
        created_by_member_id=access.me.id,
        paid_by_member_id=access.me.id,
        moved_from_transaction_id=tx.id,
    )
    session.add(entry)
    tx.deleted_at = _now()
    session.commit()
    session.refresh(entry)
    return _created(session, access, entry)


_CANNOT_UNDO = "되돌릴 수 없는 기록이에요."


def _my_transaction(session: Session, user: User, tx_id: uuid.UUID | None) -> Transaction | None:
    tx = session.get(Transaction, tx_id) if tx_id is not None else None
    return tx if tx is not None and tx.user_id == user.id else None


def undo_move_in(
    session: Session, user: User, book_id: uuid.UUID, entry_id: uuid.UUID
) -> MoveOutResult:
    """공유 가계부로 옮긴 것을 되돌린다. 새로 만들지 않고 지워 둔 원본 거래를 살린다.

    태그, 결제 수단, 예산 제외, 원래 시각, 출처가 그대로 돌아온다. 공유 기록은 지우고
    `moved_out_at` 을 찍어, 지운 기록 되돌리기로 다시 살아나 같은 돈이 두 번 잡히지 않게 한다.
    """
    access = _access(session, user, book_id)
    _require_open(access.book)
    entry = _live_entry(session, access.book, entry_id)
    if entry.created_by_member_id not in _my_member_ids(session, access.book.id, user.id):
        raise _not_found(_ENTRY_NOT_FOUND)
    tx = _my_transaction(session, user, entry.moved_from_transaction_id)
    if tx is None or tx.deleted_at is None:
        raise ApiError(ErrorCode.CONFLICT, _CANNOT_UNDO, status_code=409)

    now = _now()
    tx.deleted_at = None
    # 옮겨 둔 사이 그날에 적은 「안 썼어요」 는 되살린 지출과 함께 남을 수 없다.
    transactions.clear_no_spend_for_spending(session, user, tx)
    entry.deleted_at = now
    entry.deleted_by_member_id = access.me.id
    entry.moved_out_at = now
    entry.moved_to_transaction_id = tx.id
    session.commit()
    return MoveOutResult(transaction_id=tx.id)


def undo_move_out(
    session: Session, user: User, book_id: uuid.UUID, entry_id: uuid.UUID
) -> BookEntryOut:
    """내 가계부로 옮긴 것을 되돌린다. 그때 생긴 거래를 지우고 공유 기록을 그대로 살린다.

    낸 사람, 분류, 고친 사람이 옮기기 전과 같다. 거래에 환불이 붙었으면 되돌릴 지출을 잃어 막는다.
    """
    access = _access(session, user, book_id)
    _require_open(access.book)
    entry = session.get(BookEntry, entry_id)
    if (
        entry is None
        or entry.book_id != access.book.id
        or entry.deleted_at is None
        or entry.moved_out_at is None
    ):
        raise _not_found(_ENTRY_NOT_FOUND)
    mine = _my_member_ids(session, access.book.id, user.id)
    if entry.created_by_member_id not in mine:
        raise _not_found(_ENTRY_NOT_FOUND)
    tx = _my_transaction(session, user, entry.moved_to_transaction_id)
    if tx is None or tx.deleted_at is not None or transactions.is_refunded(session, tx.id):
        raise ApiError(ErrorCode.CONFLICT, _CANNOT_UNDO, status_code=409)

    tx.deleted_at = _now()
    entry.deleted_at = None
    entry.deleted_by_member_id = None
    entry.moved_out_at = None
    entry.moved_to_transaction_id = None
    session.commit()
    session.refresh(entry)
    return _entry_out(entry, mine, access.is_owner)


# ── 공유 분류 ───────────────────────────────────────────


def book_categories(session: Session, book: Book) -> list[BookCategory]:
    """지우지 않은 분류를 화면 순서대로."""
    return list(
        session.scalars(
            select(BookCategory)
            .where(BookCategory.book_id == book.id, BookCategory.deleted_at.is_(None))
            .order_by(BookCategory.sort_order, BookCategory.name)
        )
    )


def create_category(
    session: Session, user: User, book_id: uuid.UUID, body: BookCategoryCreate
) -> BookCategoryOut:
    """멤버 누구나 만든다. 「기타」 바로 앞에 세운다. 모두의 화면에 같이 보인다."""
    access = _access(session, user, book_id, lock=True)
    _require_open(access.book)
    rows = list(session.scalars(select(BookCategory).where(BookCategory.book_id == access.book.id)))
    live = sorted(
        (row for row in rows if row.deleted_at is None), key=lambda row: (row.sort_order, row.name)
    )
    same = next((row for row in rows if row.name == body.name), None)
    if same is not None and same.deleted_at is None:
        raise ApiError(ErrorCode.DUPLICATE_CATEGORY, "이미 있는 분류예요.", status_code=409)
    if len(live) >= BOOK_CATEGORY_LIMIT:
        raise ApiError(
            ErrorCode.INVALID_REQUEST,
            f"분류는 {BOOK_CATEGORY_LIMIT}개까지 만들 수 있어요.",
            status_code=422,
        )

    fallback = next((row for row in live if row.name == FALLBACK_CATEGORY), None)
    if fallback is None:
        order = (live[-1].sort_order + 10) if live else 10
    else:
        # 「기타」 부터 뒤를 한 칸씩 민다.
        order = fallback.sort_order
        for row in live:
            if row.sort_order >= order:
                row.sort_order += 10
    # 이름이 겹치는 지운 줄이 있으면 그 줄을 살린다. 이름은 가계부 안에서 하나다.
    row = same or BookCategory(book_id=access.book.id, name=body.name)
    row.deleted_at = None
    row.icon_key = body.icon_key
    row.sort_order = order
    session.add(row)
    session.commit()
    session.refresh(row)
    return BookCategoryOut.model_validate(row)


# ── 다른 모듈이 공유 가계부에 적을 때 ─────────────────────


def writable_book(session: Session, user: User, book_id: uuid.UUID) -> tuple[Book, BookMember]:
    """지금 멤버이고 끝나지 않은 가계부. 아니면 404 또는 BOOK_ENDED."""
    access = _access(session, user, book_id)
    _require_open(access.book)
    return access.book, access.me


def require_book_category(session: Session, book: Book, category_id: uuid.UUID | None) -> None:
    _require_category(session, book, category_id)


def stage_entry(
    session: Session,
    book: Book,
    me: BookMember,
    *,
    amount: Decimal,
    category_id: uuid.UUID | None,
    title: str | None,
    occurred_on: date,
) -> BookEntry:
    """공유 기록 한 줄을 만든다. 낸 사람은 나, commit 은 부르는 쪽이 한 번에 한다.

    분류가 비었거나 이제 없으면 「기타」 로 둔다.
    """
    # 한 묶음에 여러 줄이면 앞서 만든 줄이 flush 돼 있어 그만큼 센다.
    _require_entry_room(session, book)
    if category_id is not None and _book_category(session, book, category_id) is None:
        category_id = None
    entry = BookEntry(
        book_id=book.id,
        amount=amount,
        category_id=category_id or _book_category_for(session, book, None),
        title=title,
        occurred_on=occurred_on,
        created_by_member_id=me.id,
        paid_by_member_id=me.id,
    )
    session.add(entry)
    session.flush()
    return entry


def month_state_for(session: Session, book: Book, days: Sequence[date]) -> BookMonthStateOut:
    """여러 날에 걸쳐 적었을 때 저장 뒤 화면이 말할 달.

    이번 달이 섞여 있으면 이번 달, 아니면 가장 늦은 날의 달이다. 여행 가계부는 여행 전체다.
    """
    if book.kind is BookKind.TRIP:
        return _month_state(session, book, _trip_period(session, book), whole=True)
    current = _period_containing(book, _today(book))
    if not days or any(current.contains(day) for day in days):
        return _month_state(session, book, current)
    return _month_state(session, book, _period_containing(book, max(days)))


# ── 정산 ───────────────────────────────────────────────


def _scope(book: Book, asked: BudgetPeriod | None) -> tuple[str, BudgetPeriod | None]:
    """정산의 기간 키와 기간. 여행 가계부는 달로 끊지 않고 전체('all')를 본다.

    키는 기간의 이름 달이다. 시작일 25 의 9/25 ~ 10/24 는 '2026-10' 이다.
    """
    if book.kind is BookKind.TRIP:
        return TRIP_PERIOD, None
    period = _book_period(book, asked)
    return period.key, period


def _settle_members(
    members: Sequence[BookMember], creator_user_id: uuid.UUID | None
) -> tuple[dict[uuid.UUID, str], list[settling.SettleMember]]:
    """나갔다 다시 들어온 사람은 줄이 둘이다. 한 사람으로 묶어야 몫을 두 번 지지 않는다.

    지금 멤버인 줄(없으면 마지막 줄)이 그 사람을 대표한다. 그 기간에 멤버였는지는 줄마다 본다.
    남는 원은 역할이 아니라 만든 사람이 진다. 관리자가 바뀌어도 끝낸 정산이 흔들리지 않게.
    """
    by_user: dict[uuid.UUID, list[BookMember]] = {}
    for member in members:
        by_user.setdefault(member.user_id, []).append(member)

    canonical: dict[uuid.UUID, str] = {}
    people: list[settling.SettleMember] = []
    for user_id, rows in by_user.items():
        rows.sort(key=_joined)
        head = next((row for row in rows if row.left_at is None), rows[-1])
        for row in rows:
            canonical[row.id] = str(head.id)
        spans = tuple(
            (
                ledger.as_utc(row.joined_at),
                ledger.as_utc(row.left_at) if row.left_at is not None else None,
            )
            for row in rows
        )
        people.append(
            settling.SettleMember(
                member_id=str(head.id),
                joined_at=spans[0][0],
                left_at=spans[-1][1],
                is_creator=creator_user_id is not None and user_id == creator_user_id,
                spans=spans,
            )
        )
    return canonical, people


def _done_percents(canonical: Mapping[uuid.UUID, str], done: Settlement) -> dict[str, int] | None:
    """끝낼 때 나눈 비율을 지금 대표 id 로. 나갔다 다시 들어오면 대표 id 가 바뀐다."""
    raw = done.share_percents
    if not isinstance(raw, Mapping) or not raw:
        return None
    aliases = {str(old): head for old, head in canonical.items()}
    try:
        return {aliases.get(str(key), str(key)): int(value) for key, value in raw.items()}
    except (TypeError, ValueError):
        return None


def _compute(
    session: Session, book: Book, period: BudgetPeriod | None, done: Settlement | None
) -> tuple[dict[uuid.UUID, str], settling.Settlement]:
    """그 기간 정산. 끝낸 기간은 끝낼 때의 비율로 센다.

    비율을 바꾸거나 사람이 바뀌어 비율이 비어도 끝낸 달의 보낼 돈은 그대로다. 끝내기를 되돌리면
    지금 비율로 다시 센다.
    """
    canonical, people = _settle_members(_members(session, book.id), book.created_by_user_id)
    percents = _done_percents(canonical, done) if done is not None else _percents(book)
    stmt = select(BookEntry.amount, BookEntry.paid_by_member_id).where(
        *entry_filter(book, period=period)
    )
    start: datetime | None = None
    end: datetime | None = None
    if period is not None:
        start, end = ledger.period_bounds(period, _tz(book))
    entries = [
        settling.SettleEntry(
            amount=Money(amount),
            paid_by=canonical.get(paid_by) if paid_by is not None else None,
        )
        for amount, paid_by in session.execute(stmt)
    ]
    return canonical, settling.settle(
        people, entries, book.settle_rule, start=start, end=end, percents=percents
    )


def _changed(
    canonical: dict[uuid.UUID, str], result: settling.Settlement, current: Settlement
) -> bool:
    aliases = {str(old): head for old, head in canonical.items()}
    return settling.changed_since(result.transfers, current.transfers_snapshot, aliases)


def _current_done(session: Session, book_id: uuid.UUID, key: str) -> Settlement | None:
    """그 기간의 지금 상태. 안 되돌린 줄 중 마지막이다."""
    return session.scalar(
        select(Settlement)
        .where(
            Settlement.book_id == book_id,
            Settlement.period == key,
            Settlement.undone_at.is_(None),
        )
        .order_by(Settlement.done_at.desc(), Settlement.created_at.desc())
        .limit(1)
    )


def _settlement_out(
    session: Session, book: Book, key: str, period: BudgetPeriod | None
) -> SettlementOut:
    current = _current_done(session, book.id, key)
    canonical, result = _compute(session, book, period, current)
    return SettlementOut(
        period=key,
        period_start=period.start if period is not None else None,
        period_end=period.end if period is not None else None,
        rule=book.settle_rule,
        total=result.total.amount,
        members=[
            SettlementMemberOut(
                member_id=uuid.UUID(row.member_id),
                paid=row.paid.amount,
                share=row.share.amount,
                balance=row.balance.amount,
                percent=row.percent,
            )
            for row in result.members
        ],
        transfers=[
            SettlementTransferOut(
                from_member_id=uuid.UUID(row.from_member_id),
                to_member_id=uuid.UUID(row.to_member_id),
                amount=row.amount.amount,
            )
            for row in result.transfers
        ],
        ratio=result.ratio,
        done=(
            SettlementDoneOut(done_by_member_id=current.done_by_member_id, done_at=current.done_at)
            if current is not None
            else None
        ),
        changed_after_done=current is not None and _changed(canonical, result, current),
    )


def get_settlement(
    session: Session, user: User, book_id: uuid.UUID, period: BudgetPeriod | None
) -> SettlementOut:
    """여행 가계부는 달을 보지 않고 전체('all')를 본다."""
    access = _access(session, user, book_id)
    key, scoped = _scope(access.book, period)
    return _settlement_out(session, access.book, key, scoped)


def mark_settlement_done(
    session: Session, user: User, book_id: uuid.UUID, body: SettlementDoneIn
) -> SettlementOut:
    """지금 계산한 보낼 돈을 그대로 적어 둔다. 끝난 가계부도 정산은 끝낼 수 있다.

    가계부 줄을 잠그고 본다. 같은 보낼 돈으로 이미 끝냈으면 줄을 더 쌓지 않는다.
    """
    access = _access(session, user, book_id, lock=True)
    book = access.book
    if book.settle_rule is SettleRule.NONE:
        raise ApiError(ErrorCode.INVALID_REQUEST, "정산이 없는 가계부예요.", status_code=422)
    # 질의로 받을 때와 같은 길로 가계부의 한 달을 만든다.
    key, scoped = _scope(book, BudgetPeriod.of_month(body.year, body.month))
    current = _current_done(session, book.id, key)
    canonical, result = _compute(session, book, scoped, current)
    if current is not None and not _changed(canonical, result, current):
        # 두 사람이 거의 같이 누르면 같은 줄이 둘 쌓여 되돌리기 한 번으로 안 풀린다.
        return _settlement_out(session, book, key, scoped)
    session.add(
        Settlement(
            book_id=book.id,
            period=key,
            transfers_snapshot=settling.snapshot_of(result.transfers),
            share_percents=(
                {row.member_id: row.percent for row in result.members if row.percent is not None}
                if result.ratio
                else None
            ),
            done_by_member_id=access.me.id,
            done_at=_now(),
        )
    )
    session.commit()
    return _settlement_out(session, book, key, scoped)


def undo_settlement_done(
    session: Session, user: User, book_id: uuid.UUID, period: BudgetPeriod | None
) -> SettlementOut:
    """끝내기와 같은 잠금을 건다. 같이 누르면 되돌린 줄과 새로 끝낸 줄이 엇갈린다."""
    access = _access(session, user, book_id, lock=True)
    key, scoped = _scope(access.book, period)
    current = _current_done(session, access.book.id, key)
    if current is None:
        raise _not_found("끝낸 정산이 없어요.")
    current.undone_at = _now()
    session.commit()
    return _settlement_out(session, access.book, key, scoped)


# ── 회비 ───────────────────────────────────────────────


def _deposited_by(
    session: Session, book: Book, period: BudgetPeriod | None, canonical: Mapping[uuid.UUID, str]
) -> dict[str, Money]:
    """그 기간 사람마다 넣은 돈. 나갔다 다시 들어온 줄의 입금도 지금 대표 id 로 모은다."""
    rows = session.execute(
        select(BookEntry.paid_by_member_id, func.coalesce(func.sum(BookEntry.amount), 0))
        .where(*entry_filter(book, kinds=_DEPOSITS, period=period))
        .group_by(BookEntry.paid_by_member_id)
    )
    found: dict[str, Money] = {}
    for paid_by, total in rows:
        head = canonical.get(paid_by) if paid_by is not None else None
        if head is not None:
            found[head] = found.get(head, Money.zero()) + Money(Decimal(total or 0))
    return found


def _deposit_status(put: Money, due: Money | None) -> DuesStatus:
    """각자 입금의 한 사람. 낼 돈이 없으면 한 번이라도 넣었나만 본다."""
    if due is None:
        return "done" if put.is_positive else "pending"
    if due.is_zero:
        # 0% 인 사람은 낼 돈이 없다. 안 넣어도 「입금완료」 를 달지 않는다.
        return "none"
    return "done" if put >= due else "pending"


def get_dues(
    session: Session, user: User, book_id: uuid.UUID, period: BudgetPeriod | None
) -> BookDuesOut:
    """이번 기간 멤버마다 회비를 냈나. 여행 가계부는 기간 없이 전체다.

    탓하는 화면을 만들지 않으려고 pending 은 화면이 따로 그리지 않는다. 판정만 여기서 한다.
    """
    access = _access(session, user, book_id)
    book = access.book
    key, scoped = _scope(book, period)
    canonical, people = _settle_members(_members(session, book.id), book.created_by_user_id)
    # 지금 멤버만. 대표 줄이 지금 줄이라 마지막 기간이 열려 있다.
    current = sorted(
        (m for m in people if m.left_at is None), key=lambda m: (m.joined_at, m.member_id)
    )
    deposited = _deposited_by(session, book, scoped, canonical)
    dues = Money(book.dues_amount) if book.dues_amount is not None else None

    members: list[BookDueMemberOut] = []
    if book.settle_rule is SettleRule.NONE:
        shares, used = settling.split_shares(dues or Money.zero(), current, _percents(book))
        ratio_used = used is not None
        # 한 달 회비는 달마다 낼 돈이다. 여행은 달로 끊지 않아 견줄 낼 돈이 없다.
        monthly = dues is not None and book.kind is not BookKind.TRIP
        for m in current:
            put = deposited.get(m.member_id, Money.zero())
            due = shares[m.member_id] if monthly else None
            members.append(
                BookDueMemberOut(
                    member_id=uuid.UUID(m.member_id),
                    percent=used[m.member_id] if used is not None else None,
                    due=due.amount if due is not None else None,
                    deposited=put.amount,
                    status=_deposit_status(put, due),
                )
            )
    else:
        done_row = _current_done(session, book.id, key)
        aliases, result = _compute(session, book, scoped, done_row)
        settled = done_row is not None and not _changed(aliases, result, done_row)
        ratio_used = result.ratio
        rows = {row.member_id: row for row in result.members}
        for m in current:
            row = rows.get(m.member_id)
            status: DuesStatus
            if row is None:
                # 그 기간 사람이 아니다. 끝낸 뒤 들어온 사람에게 「정산완료」 를 달지 않는다.
                status = "none"
            elif settled:
                status = "done"
            elif result.total.is_zero:
                status = "none"
            else:
                status = "done" if row.balance.is_zero else "pending"
            members.append(
                BookDueMemberOut(
                    member_id=uuid.UUID(m.member_id),
                    percent=row.percent if row is not None else None,
                    due=None,
                    deposited=deposited.get(m.member_id, Money.zero()).amount,
                    status=status,
                )
            )
    return BookDuesOut(
        rule=book.settle_rule,
        period_key=key,
        period_start=scoped.start if scoped is not None else None,
        period_end=scoped.end if scoped is not None else None,
        dues_amount=dues.amount if dues is not None else None,
        ratio=ratio_used,
        members=members,
    )


# ── 멤버 내역 ───────────────────────────────────────────


def member_entries(
    session: Session,
    user: User,
    book_id: uuid.UUID,
    member_id: uuid.UUID,
    *,
    cursor: uuid.UUID | None,
    limit: int,
) -> BookMemberEntriesOut:
    """한 사람이 낸 지출과 넣은 입금. 보는 사람은 지금 멤버여야 하고, 다른 가계부의 멤버 id 면 404.

    나갔다 다시 들어온 사람은 예전 줄의 기록도 함께 본다. 사용자 id 는 싣지 않는다.
    쪽은 늘 `limit` 줄까지다. `cursor` 는 앞 쪽 마지막 줄의 id 이고, 정렬 키 셋째(id)까지 이어
    보아 같은 날, 같은 시각에 많이 적어도 한 쪽이 커지지 않는다.
    """
    access = _access(session, user, book_id)
    book = access.book
    target = session.get(BookMember, member_id)
    if target is None or target.book_id != book.id:
        raise _not_found(_MEMBER_NOT_FOUND)
    theirs = _my_member_ids(session, book.id, target.user_id)
    paid_by_them = BookEntry.paid_by_member_id.in_(theirs)

    sums = _sums_by_kind(session, book, None, paid_by_them)
    stmt = (
        select(BookEntry)
        .where(*entry_filter(book, kinds=None), paid_by_them)
        .order_by(*_NEWEST_FIRST)
    )
    if cursor is not None:
        stmt = stmt.where(_older_than(_cursor_entry(session, book, cursor)))
    rows = list(session.scalars(stmt.limit(limit + 1)))
    page = rows[:limit]
    head = _active_membership(session, book.id, target.user_id)
    mine = _my_member_ids(session, book.id, user.id)
    return BookMemberEntriesOut(
        member_id=target.id,
        name=head.display_name if head is not None else None,
        deposited_total=sums[BookEntryKind.DEPOSIT].amount,
        paid_total=sums[BookEntryKind.EXPENSE].amount,
        items=[_entry_out(row, mine, access.is_owner) for row in page],
        next_cursor=page[-1].id if len(rows) > limit else None,
    )


def _cursor_entry(session: Session, book: Book, cursor: uuid.UUID) -> BookEntry:
    """쪽 커서가 가리키는 줄. 그 사이 지워졌어도 정렬 키는 그대로라 이어 볼 수 있다."""
    entry = session.get(BookEntry, cursor)
    if entry is None or entry.book_id != book.id:
        raise ApiError(ErrorCode.INVALID_REQUEST, "다음 쪽을 찾지 못했어요.", status_code=422)
    return entry


def _older_than(entry: BookEntry) -> ColumnElement[bool]:
    """`_NEWEST_FIRST` 순서로 `entry` 뒤에 서는 줄.

    적은 시각은 DB 에 든 값끼리 견준다. 읽어 온 값을 다시 보내면 DB 마다 시각 글자 모양이 달라
    같은 시각이 다르게 읽힌다.
    """
    anchor = aliased(BookEntry)
    stamp = select(anchor.created_at).where(anchor.id == entry.id).scalar_subquery()
    return or_(
        BookEntry.occurred_on < entry.occurred_on,
        and_(
            BookEntry.occurred_on == entry.occurred_on,
            or_(
                BookEntry.created_at < stamp,
                and_(BookEntry.created_at == stamp, BookEntry.id < entry.id),
            ),
        ),
    )


# ── 리포트 ─────────────────────────────────────────────


def _change_out(row: book_report.CategoryDelta) -> BookCategoryChangeOut:
    return BookCategoryChangeOut(
        category_id=uuid.UUID(row.category_id) if row.category_id else None,
        current=row.current.amount,
        previous=row.previous.amount,
        delta=row.delta.amount,
    )


def get_report(
    session: Session, user: User, book_id: uuid.UUID, period: BudgetPeriod | None
) -> BookReportOut:
    """기본 리포트와 자세히 보기를 함께 싣는다. 자세히 보기를 잠그는 것은 화면의 일이다."""
    access = _access(session, user, book_id)
    book = access.book
    today = _today(book)
    period = _book_period(book, period)
    previous = period.previous_period()

    rows = session.execute(
        select(BookEntry.occurred_on, BookEntry.amount, BookEntry.category_id).where(
            *entry_filter(book, period=BudgetPeriod(previous.start, period.end))
        )
    ).all()
    # 입금은 거른 지출만 남았다. 개인 집계 규칙을 그대로 태운다.
    inputs = [
        agg.TransactionInput(
            occurred_on=occurred_on,
            amount=Money(amount),
            type=agg.TransactionType.EXPENSE,
            category_id=str(category_id) if category_id is not None else None,
        )
        for occurred_on, amount, category_id in rows
    ]
    totals = agg.aggregate_period(inputs, period)
    spent = totals.month_expense
    budget = Money(book.monthly_budget) if book.monthly_budget is not None else None
    breakdown, breakdown_total = rank_breakdown(totals.category_spend)
    insight = book_report.build_insight(inputs, period, today)

    return BookReportOut(
        period_start=period.start,
        period_end=period.end,
        spent=spent.amount,
        entry_count=sum(1 for row in inputs if period.contains(row.occurred_on)),
        budget=budget.amount if budget is not None else None,
        remaining=(budget - spent).amount if budget is not None else None,
        spend_progress=ratio(spent, budget) if budget is not None else None,
        breakdown=to_breakdown(breakdown),
        breakdown_total=breakdown_total.amount,
        insight=BookInsightOut(
            previous_spent_same_window=insight.previous_spent_same_window.amount,
            compare_delta=insight.compare_delta.amount,
            compare_window_end=insight.compare_window_end,
            largest_increase=(
                _change_out(insight.largest_increase)
                if insight.largest_increase is not None
                else None
            ),
            category_changes=[_change_out(row) for row in insight.category_changes],
            projected_month_end=(
                insight.projected_month_end.amount
                if insight.projected_month_end is not None
                else None
            ),
            is_projection_reliable=insight.is_projection_reliable,
        ),
    )
