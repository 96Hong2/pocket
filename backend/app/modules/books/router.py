"""공유 가계부 엔드포인트.

라우터는 늘 등록한다. openapi.json 이 .env 값에 따라 달라지면 CI 의 스펙 비교가 깨진다.
기능 스위치가 꺼져 있으면 요청 시점에 404 로 막는다. 인증보다 먼저 보므로 사용자 행도 안 생긴다.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import AppSettings, CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES, ApiError, ErrorCode
from app.api.months import MonthQuery
from app.modules.books import service
from app.modules.books.schemas import (
    BookCategoryCreate,
    BookCategoryOut,
    BookCreate,
    BookEntryCreate,
    BookEntryCreated,
    BookEntryListOut,
    BookEntryOut,
    BookEntryUpdate,
    BookInviteOut,
    BookListOut,
    BookOut,
    BookReportOut,
    BookUpdate,
    InvitePreviewOut,
    JoinIn,
    MoveInIn,
    MoveOutResult,
    SettlementDoneIn,
    SettlementOut,
)

__all__ = ["invites_router", "require_shared_books", "router"]


def require_shared_books(settings: AppSettings) -> None:
    """기능 스위치가 꺼져 있으면 없는 경로처럼 답한다."""
    if not settings.shared_books_enabled:
        raise ApiError(ErrorCode.NOT_FOUND, "찾을 수 없어요.", status_code=404)


_GUARD = [Depends(require_shared_books)]

router = APIRouter(prefix="/books", tags=["books"], responses=ERROR_RESPONSES, dependencies=_GUARD)
invites_router = APIRouter(
    prefix="/invites", tags=["books"], responses=ERROR_RESPONSES, dependencies=_GUARD
)


def _no_content() -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── 가계부 ─────────────────────────────────────────────


@router.get("", response_model=BookListOut)
def index(session: DbSession, user: CurrentUser) -> BookListOut:
    return service.list_books(session, user)


@router.post("", response_model=BookOut, status_code=status.HTTP_201_CREATED)
def create(body: BookCreate, session: DbSession, user: CurrentUser) -> BookOut:
    return service.create_book(session, user, body)


@router.get("/{book_id}", response_model=BookOut)
def show(book_id: uuid.UUID, session: DbSession, user: CurrentUser) -> BookOut:
    return service.get_book(session, user, book_id)


@router.patch("/{book_id}", response_model=BookOut)
def update(book_id: uuid.UUID, body: BookUpdate, session: DbSession, user: CurrentUser) -> BookOut:
    return service.update_book(session, user, book_id, body.model_dump(exclude_unset=True))


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def destroy(book_id: uuid.UUID, session: DbSession, user: CurrentUser) -> Response:
    service.delete_book(session, user, book_id)
    return _no_content()


@router.post("/{book_id}/restore", response_model=BookOut)
def restore(book_id: uuid.UUID, session: DbSession, user: CurrentUser) -> BookOut:
    return service.restore_book(session, user, book_id)


@router.post(
    "/{book_id}/categories", response_model=BookCategoryOut, status_code=status.HTTP_201_CREATED
)
def create_category(
    book_id: uuid.UUID, body: BookCategoryCreate, session: DbSession, user: CurrentUser
) -> BookCategoryOut:
    return service.create_category(session, user, book_id, body)


# ── 초대와 멤버 ─────────────────────────────────────────


@router.post(
    "/{book_id}/invites", response_model=BookInviteOut, status_code=status.HTTP_201_CREATED
)
def create_invite(book_id: uuid.UUID, session: DbSession, user: CurrentUser) -> BookInviteOut:
    return service.create_invite(session, user, book_id)


@router.post("/{book_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave(book_id: uuid.UUID, session: DbSession, user: CurrentUser) -> Response:
    service.leave_book(session, user, book_id)
    return _no_content()


@router.delete("/{book_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    book_id: uuid.UUID, member_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> Response:
    service.remove_member(session, user, book_id, member_id)
    return _no_content()


@invites_router.get("/{code}", response_model=InvitePreviewOut)
def preview_invite(code: str, session: DbSession, user: CurrentUser) -> InvitePreviewOut:
    # 형식이 틀린 코드도 422 가 아니라 404 로 답한다. 화면이 한 가지로 안내한다.
    return service.preview_invite(session, user, code)


@invites_router.post("/{code}/join", response_model=BookOut)
def join(code: str, body: JoinIn, session: DbSession, user: CurrentUser) -> BookOut:
    return service.join_book(session, user, code, body)


# ── 공유 기록 ───────────────────────────────────────────


@router.get("/{book_id}/entries", response_model=BookEntryListOut)
def list_entries(
    book_id: uuid.UUID, period: MonthQuery, session: DbSession, user: CurrentUser
) -> BookEntryListOut:
    return service.list_entries(session, user, book_id, period)


@router.post(
    "/{book_id}/entries", response_model=BookEntryCreated, status_code=status.HTTP_201_CREATED
)
def create_entry(
    book_id: uuid.UUID, body: BookEntryCreate, session: DbSession, user: CurrentUser
) -> BookEntryCreated:
    return service.create_entry(session, user, book_id, body)


@router.post(
    "/{book_id}/entries/move-in",
    response_model=BookEntryCreated,
    status_code=status.HTTP_201_CREATED,
)
def move_in(
    book_id: uuid.UUID, body: MoveInIn, session: DbSession, user: CurrentUser
) -> BookEntryCreated:
    return service.move_entry_in(session, user, book_id, body)


@router.patch("/{book_id}/entries/{entry_id}", response_model=BookEntryOut)
def update_entry(
    book_id: uuid.UUID,
    entry_id: uuid.UUID,
    body: BookEntryUpdate,
    session: DbSession,
    user: CurrentUser,
) -> BookEntryOut:
    return service.update_entry(
        session, user, book_id, entry_id, body.model_dump(exclude_unset=True)
    )


@router.delete("/{book_id}/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    book_id: uuid.UUID, entry_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> Response:
    service.delete_entry(session, user, book_id, entry_id)
    return _no_content()


@router.post("/{book_id}/entries/{entry_id}/restore", response_model=BookEntryOut)
def restore_entry(
    book_id: uuid.UUID, entry_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> BookEntryOut:
    return service.restore_entry(session, user, book_id, entry_id)


@router.post("/{book_id}/entries/{entry_id}/move-out", response_model=MoveOutResult)
def move_out(
    book_id: uuid.UUID, entry_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> MoveOutResult:
    return service.move_entry_out(session, user, book_id, entry_id)


@router.post("/{book_id}/entries/{entry_id}/undo-move-in", response_model=MoveOutResult)
def undo_move_in(
    book_id: uuid.UUID, entry_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> MoveOutResult:
    # 옮기기 전 내 거래를 그대로 살린다. 태그, 결제 수단, 시각이 남는다.
    return service.undo_move_in(session, user, book_id, entry_id)


@router.post("/{book_id}/entries/{entry_id}/undo-move-out", response_model=BookEntryOut)
def undo_move_out(
    book_id: uuid.UUID, entry_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> BookEntryOut:
    return service.undo_move_out(session, user, book_id, entry_id)


# ── 정산 ───────────────────────────────────────────────


@router.get("/{book_id}/settlement", response_model=SettlementOut)
def settlement(
    book_id: uuid.UUID, period: MonthQuery, session: DbSession, user: CurrentUser
) -> SettlementOut:
    return service.get_settlement(session, user, book_id, period)


@router.post("/{book_id}/settlement/done", response_model=SettlementOut)
def settlement_done(
    book_id: uuid.UUID, body: SettlementDoneIn, session: DbSession, user: CurrentUser
) -> SettlementOut:
    return service.mark_settlement_done(session, user, book_id, body)


@router.delete("/{book_id}/settlement/done", response_model=SettlementOut)
def settlement_undo(
    book_id: uuid.UUID, period: MonthQuery, session: DbSession, user: CurrentUser
) -> SettlementOut:
    return service.undo_settlement_done(session, user, book_id, period)


# ── 리포트 ─────────────────────────────────────────────


@router.get("/{book_id}/report", response_model=BookReportOut)
def report(
    book_id: uuid.UUID, period: MonthQuery, session: DbSession, user: CurrentUser
) -> BookReportOut:
    return service.get_report(session, user, book_id, period)
