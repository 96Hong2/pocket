import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router';

import { useBookView, useBridge, useOverlayBackClose, useToast } from '../../app/providers';
import { ROUTES } from '../../app/router/routes';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  ApiError,
  parseDecimal,
  useBook,
  useBookDues,
  useDeleteBook,
  useLeaveBook,
  useRemoveMember,
  useRestoreBook,
  useUpdateBook,
  type BookDuesOut,
  type BookMemberOut,
  type BookOut,
} from '../../shared/api';
import { formatCurrency, formatDayLabel, toLedgerDate } from '../../shared/lib/format';
import { withJosa } from '../../shared/lib/josa';
import { readPlusInterest } from '../../shared/lib/plusInterest';
import {
  Button,
  Card,
  CategoryAvatar,
  Chip,
  ErrorState,
  LeaveConfirm,
  LoadingState,
  StateView,
} from '../../shared/ui';
import {
  BookBudgetSheet,
  bookKindIcon,
  bookKindLabel,
  budgetLabel,
  duesLabel,
  memberName,
  membersBucket,
  otherActiveMembers,
  useBookInvite,
} from '../books';

import { BookDuesSheet } from './BookDuesSheet';
import { BookField } from './BookField';
import { BookMemberSheet } from './BookMemberSheet';
import { BookStartDaySheet } from './BookStartDaySheet';
import { PlusInterestSheet } from './PlusInterestSheet';

/** 한 가계부에 함께 있을 수 있는 사람 수. 서버와 같은 값이다. */
const MAX_MEMBERS = 10;

type Confirm = { kind: 'kick'; member: BookMemberOut } | { kind: 'delete' } | { kind: 'leave' };

/**
 * 가계부 하나의 설정.
 *
 * 멤버, 초대장, 회비, 예산, 시작일은 멤버 누구나 보고 바꾼다. 이름 바꾸기, 완료하기, 지우기,
 * 내보내기는 관리자만 본다. 완료하기는 묻지 않고 하고 알림에서 되돌린다. 멤버 모두에게 영향이
 * 가는 지우기, 나가기, 내보내기만 확인 창을 띄운다.
 *
 * 멤버 줄은 누구나 눌러 그 사람의 지난 내역을 본다. 내보내기는 그 내역 맨 아래에 있다.
 */
export function BookSettings({
  bookId,
  showOpen = true,
}: {
  bookId: string | null;
  /** 「<이름> 열기」 를 세우나. 홈의 멤버 얼굴에서 왔으면 이미 그 가계부를 보고 있어 뺀다. */
  showOpen?: boolean;
}) {
  const book = useBook(bookId);

  if (bookId == null) return <BookGone />;
  if (book.isError && book.error instanceof ApiError && book.error.status === 404) {
    return <BookGone />;
  }
  if (book.isError && book.data == null) return <ErrorState onRetry={() => void book.refetch()} />;
  if (book.data == null) return <LoadingState variant="rows" rows={3} />;

  return <SettingsBody book={book.data} showOpen={showOpen} />;
}

/** 나갔거나 지워진 가계부. 주소만 남은 자리다. */
function BookGone() {
  const navigate = useNavigate();
  return (
    <StateView
      icon="59_people"
      title="열 수 없는 가계부예요"
      action={
        <Button variant="primarySmall" onClick={() => navigate(ROUTES.books, { replace: true })}>
          같이 쓰는 가계부 보기
        </Button>
      }
    />
  );
}

function SettingsBody({ book, showOpen }: { book: BookOut; showOpen: boolean }) {
  const navigate = useNavigate();
  const bridge = useBridge();
  const analytics = useAnalytics();
  const toast = useToast();
  const { viewingBookId, setViewingBookId } = useBookView();
  const update = useUpdateBook();
  const removeMember = useRemoveMember();
  const leave = useLeaveBook();
  const remove = useDeleteBook();
  const restore = useRestoreBook();
  const invite = useBookInvite('settings');
  // 이번 기간 회비 상태. 멤버 줄의 「입금완료」·「정산완료」 가 여기서 나온다.
  const dues = useBookDues(book.id);

  const [confirm, setConfirm] = useState<Confirm | null>(null);
  // 확인 창이 떠 있으면 뒤로가기는 창만 닫는다. 요청이 나가기 전에 창을 먼저 닫아 잠글 일이 없다.
  useOverlayBackClose(confirm != null, () => setConfirm(null));
  /** 내역을 펼친 멤버. */
  const [history, setHistory] = useState<BookMemberOut | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [duesOpen, setDuesOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [plusWanted, setPlusWanted] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const endNoteId = useId();
  const deleteNoteId = useId();

  useEffect(() => {
    let alive = true;
    void readPlusInterest(bridge.storage).then((wanted) => {
      if (alive) setPlusWanted(wanted);
    });
    return () => {
      alive = false;
    };
  }, [bridge]);

  const isOwner = book.my_role === 'owner';
  const members = book.members.filter((member) => !member.left);
  const others = otherActiveMembers(book);
  const bucket = membersBucket(book.active_member_count);
  const budget = parseDecimal(book.monthly_budget);
  const inviteUntil =
    book.invite == null ? null : formatDayLabel(toLedgerDate(new Date(book.invite.expires_at)));
  /*
    연인·부부 가계부는 한 사람이 들어오면 초대 링크가 닫힌다. 둘이 되면 더 부를 사람이 없으니
    초대장 버튼을 걷고, 「2/10」 처럼 자리가 남은 것처럼 적지 않는다.
  */
  const pairDone = book.kind === 'couple' && book.active_member_count >= 2;
  const canInvite = !book.ended && book.active_member_count < MAX_MEMBERS && !pairDone;

  function fail(error: unknown): void {
    setFailure(
      error instanceof ApiError ? error.message : '지금은 바꾸지 못했어요. 잠시 뒤 다시 해 주세요',
    );
  }

  function setEnded(ended: boolean): void {
    setFailure(null);
    // 알림의 되돌리기는 이 화면을 떠난 뒤에도 눌릴 수 있다. 약속으로 받아야 그때도 끝까지 간다.
    update
      .mutateAsync({ bookId: book.id, body: { ended } })
      .then(() => {
        analytics.log(
          EVENTS.bookChanged,
          { action: ended ? 'ended' : 'reopened', kind: book.kind },
          { kind: 'click' },
        );
        if (ended) {
          toast.show({
            text: '가계부를 완료했어요',
            actionLabel: '되돌리기',
            onAction: () => setEnded(false),
          });
        }
      })
      .catch(fail);
  }

  async function sendInvite(): Promise<void> {
    const sent = await invite.send(book);
    if (sent) toast.show({ text: '초대장을 보냈어요' });
  }

  function kick(member: BookMemberOut): void {
    setConfirm(null);
    setHistory(null);
    setFailure(null);
    removeMember.mutate(
      { bookId: book.id, memberId: member.id },
      {
        onSuccess: () => {
          analytics.log(
            EVENTS.bookMemberChanged,
            { action: 'removed', role: member.role },
            { kind: 'click' },
          );
          toast.show({ text: `${memberName(member)}님을 내보냈어요` });
        },
        onError: fail,
      },
    );
  }

  async function leaveBook(): Promise<void> {
    setConfirm(null);
    setFailure(null);
    try {
      await leave.mutateAsync(book.id);
    } catch (error) {
      fail(error);
      return;
    }
    analytics.log(
      EVENTS.bookMemberChanged,
      { action: 'left', role: book.my_role },
      { kind: 'click' },
    );
    if (viewingBookId === book.id) setViewingBookId(null);
    navigate(ROUTES.home, { replace: true });
    toast.show({ text: `${book.name}에서 나왔어요` });
  }

  async function deleteBook(): Promise<void> {
    setConfirm(null);
    setFailure(null);
    try {
      await remove.mutateAsync(book.id);
    } catch (error) {
      fail(error);
      return;
    }
    analytics.log(EVENTS.bookChanged, { action: 'deleted', kind: book.kind }, { kind: 'click' });
    if (viewingBookId === book.id) setViewingBookId(null);
    navigate(ROUTES.books, { replace: true });
    toast.show({
      text: '가계부를 지웠어요',
      actionLabel: '되돌리기',
      onAction: () => {
        // 이 화면은 이미 떠났다. 끝까지 기다리는 약속으로 받아야 되살린 뒤 그 가계부를 연다.
        void restore
          .mutateAsync(book.id)
          .then((restored) => {
            analytics.log(
              EVENTS.bookChanged,
              { action: 'restored', kind: restored.kind },
              { kind: 'click' },
            );
            setViewingBookId(restored.id);
            navigate(ROUTES.home);
          })
          .catch(() => toast.show({ text: '되돌리지 못했어요. 잠시 뒤 다시 해 주세요' }));
      },
    });
  }

  function openBook(): void {
    setViewingBookId(book.id);
    navigate(ROUTES.home);
  }

  return (
    <div className="book-settings">
      <Card className="book-settings__head">
        <div className="book-settings__head-row">
          <CategoryAvatar icon={bookKindIcon(book.kind)} size={48} />
          <div className="book-settings__head-text">
            <h2 className="book-settings__name">{book.name}</h2>
            <p className="book-settings__meta">
              {bookKindLabel(book.kind)} 가계부
              {book.ended ? <Chip variant="excluded">완료</Chip> : null}
            </p>
          </div>
        </div>
        {showOpen ? (
          <Button fullWidth onClick={openBook}>
            {book.name} 열기
          </Button>
        ) : null}
      </Card>

      {failure != null ? (
        <p className="book-manage__notice" role="alert">
          {failure}
        </p>
      ) : null}

      <section className="book-settings__section" aria-labelledby="book-members">
        <h2 id="book-members" className="book-settings__label">
          {pairDone ? `멤버 ${members.length}명` : `멤버 ${members.length}/${MAX_MEMBERS}`}
        </h2>
        <Card padding="list">
          <ul className="book-settings__members">
            {members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                done={doneLabel(dues.data, member.id)}
                onOpen={() => setHistory(member)}
              />
            ))}
          </ul>
        </Card>

        {canInvite ? (
          <div className="book-settings__invite">
            <Button
              variant="outline"
              fullWidth
              disabled={invite.busy}
              onClick={() => void sendInvite()}
            >
              초대장 보내기
            </Button>
            {invite.failure != null ? (
              <p className="book-manage__notice" role="alert">
                {invite.failure}
              </p>
            ) : inviteUntil != null ? (
              <p className="book-settings__hint">링크는 {inviteUntil}까지 쓸 수 있어요</p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="book-settings__section" aria-labelledby="book-way">
        <h2 id="book-way" className="book-settings__label">
          같이 쓰는 방식
        </h2>
        <Card padding="list">
          <ul className="link-rows book-settings__rows">
            <li>
              <button type="button" className="link-row" onClick={() => setDuesOpen(true)}>
                <span className="link-row__label">회비</span>
                <span className="link-row__value">{duesLabel(book)}</span>
              </button>
            </li>
            <li>
              <button type="button" className="link-row" onClick={() => setBudgetOpen(true)}>
                <span className="link-row__label">{budgetLabel(book.kind)}</span>
                <span className="link-row__value">
                  {budget == null ? '안 정했어요' : formatCurrency(budget)}
                </span>
              </button>
            </li>
            {/* 여행 가계부는 달로 끊지 않고 여행 전체를 본다. 시작일이 쓰이지 않는다. */}
            {book.kind === 'trip' ? null : (
              <li>
                <button type="button" className="link-row" onClick={() => setStartOpen(true)}>
                  <span className="link-row__label">시작일</span>
                  <span className="link-row__value">매달 {book.month_start_day}일</span>
                </button>
              </li>
            )}
          </ul>
        </Card>
      </section>

      {isOwner ? (
        <section className="book-settings__section" aria-labelledby="book-owner">
          <h2 id="book-owner" className="book-settings__label">
            가계부 관리
          </h2>
          <Card padding="list">
            {renaming ? (
              <RenameForm
                book={book}
                onDone={() => setRenaming(false)}
                onRenamed={() => {
                  analytics.log(
                    EVENTS.bookChanged,
                    { action: 'renamed', kind: book.kind },
                    { kind: 'click' },
                  );
                  toast.show({ text: '이름을 바꿨어요' });
                }}
              />
            ) : null}
            <ul className="link-rows book-settings__rows">
              {renaming ? null : (
                <li>
                  <button type="button" className="link-row" onClick={() => setRenaming(true)}>
                    <span className="link-row__label">이름 바꾸기</span>
                  </button>
                </li>
              )}
              <li>
                {book.ended ? (
                  <button
                    type="button"
                    className="link-row"
                    disabled={update.isPending}
                    onClick={() => setEnded(false)}
                  >
                    <span className="link-row__label">다시 열기</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="link-row"
                    aria-label="가계부 완료하기"
                    aria-describedby={endNoteId}
                    disabled={update.isPending}
                    onClick={() => setEnded(true)}
                  >
                    <RowText
                      title="가계부 완료하기"
                      note="기록은 남고 더 적을 수 없어요"
                      noteId={endNoteId}
                    />
                  </button>
                )}
              </li>
              <li>
                <button
                  type="button"
                  className="link-row book-settings__danger"
                  aria-label="가계부 지우기"
                  aria-describedby={deleteNoteId}
                  onClick={() => setConfirm({ kind: 'delete' })}
                >
                  <RowText
                    title="가계부 지우기"
                    note="멤버 모두의 화면에서 기록이 사라져요"
                    noteId={deleteNoteId}
                  />
                </button>
              </li>
            </ul>
          </Card>
        </section>
      ) : null}

      {/*
        광고 없이 쓰기는 같이 쓰는 방식(돈 나누기, 예산)과 다른 이야기라 따로 한 줄로 둔다.
        아직 준비 중인 자리라 맨 아래, 나가기 바로 위다.
      */}
      <section className="book-settings__section" aria-label={`${book.name} 광고 없이 쓰기`}>
        <Card padding="list">
          <ul className="link-rows book-settings__rows">
            <li>
              <button type="button" className="link-row" onClick={() => setPlusOpen(true)}>
                <span className="link-row__label">{book.name} 광고 없이 쓰기</span>
                <Chip variant={plusWanted ? 'sage' : 'kind'}>
                  {plusWanted ? '신청함' : '준비 중'}
                </Chip>
              </button>
            </li>
          </ul>
        </Card>
      </section>

      <Button
        variant="ghost"
        fullWidth
        className="book-settings__leave"
        onClick={() => setConfirm({ kind: 'leave' })}
      >
        {book.name}에서 나가기
      </Button>

      <BookDuesSheet
        open={duesOpen}
        book={book}
        onClose={() => setDuesOpen(false)}
        onSaved={() => toast.show({ text: '바꿨어요' })}
      />

      <BookStartDaySheet
        open={startOpen}
        book={book}
        onClose={() => setStartOpen(false)}
        onSaved={() => toast.show({ text: '바꿨어요' })}
      />

      <BookMemberSheet
        book={book}
        member={history}
        onClose={() => setHistory(null)}
        onKick={
          isOwner && history != null && !history.is_me
            ? (member) => setConfirm({ kind: 'kick', member })
            : undefined
        }
      />

      <BookBudgetSheet
        open={budgetOpen}
        book={book}
        onClose={() => setBudgetOpen(false)}
        onSaved={() => toast.show({ text: '예산을 바꿨어요' })}
      />

      <PlusInterestSheet
        open={plusOpen}
        bookName={book.name}
        members={bucket}
        wanted={plusWanted}
        onWanted={() => setPlusWanted(true)}
        onClose={() => setPlusOpen(false)}
      />

      {confirm?.kind === 'kick' ? (
        <LeaveConfirm
          ariaLabel={`${memberName(confirm.member)}님을 내보낼까요?`}
          text={
            <ConfirmText
              title={`${memberName(confirm.member)}님을 내보낼까요?`}
              lines={[`${memberName(confirm.member)}님이 적은 기록은 남아요`]}
            />
          }
          stayLabel="계속 같이 쓰기"
          leaveLabel="내보내기"
          onStay={() => setConfirm(null)}
          onLeave={() => kick(confirm.member)}
        />
      ) : null}

      {confirm?.kind === 'delete' ? (
        <LeaveConfirm
          ariaLabel={`${withJosa(book.name, '을/를')} 지울까요?`}
          text={
            <ConfirmText
              title={`${withJosa(book.name, '을/를')} 지울까요?`}
              lines={[
                '기록이 멤버 모두의 화면에서 사라져요',
                ...(book.ended ? [] : ['기록을 남기려면 「가계부 완료하기」를 써 주세요']),
              ]}
            />
          }
          stayLabel="그대로 두기"
          leaveLabel="지우기"
          onStay={() => setConfirm(null)}
          onLeave={() => void deleteBook()}
        />
      ) : null}

      {confirm?.kind === 'leave' ? (
        <LeaveConfirm
          ariaLabel={`${book.name}에서 나갈까요?`}
          text={
            <ConfirmText title={`${book.name}에서 나갈까요?`} lines={leaveLines(book, others)} />
          }
          stayLabel="계속 쓰기"
          leaveLabel="나가기"
          onStay={() => setConfirm(null)}
          onLeave={() => void leaveBook()}
        />
      ) : null}
    </div>
  );
}

/** 나가기 전에 알려 줄 것. 혼자면 가계부가 없어진다는 것, 관리자면 누가 이어받는지. */
function leaveLines(book: BookOut, others: BookMemberOut[]): string[] {
  if (others.length === 0) return ['혼자 쓰는 가계부라 나가면 가계부가 지워져요'];
  const lines = [`내가 적은 기록은 ${book.name}에 남아요`, '내 가계부는 그대로예요'];
  if (book.my_role === 'owner') {
    const next = [...others].sort((a, b) => a.joined_at.localeCompare(b.joined_at))[0];
    lines.push(`관리자는 ${memberName(next)}님이 이어받아요`);
  }
  return lines;
}

/** 줄 이름 아래 조용한 한 줄. 무엇이 일어나는지 누르기 전에 읽힌다. */
function RowText({ title, note, noteId }: { title: string; note: string; noteId: string }) {
  return (
    <span className="link-row__label book-settings__row-text">
      <span>{title}</span>
      <span id={noteId} className="book-settings__row-note">
        {note}
      </span>
    </span>
  );
}

function ConfirmText({ title, lines }: { title: string; lines: string[] }) {
  return (
    <>
      <span className="book-confirm__title">{title}</span>
      {lines.map((line) => (
        <span key={line} className="book-confirm__line">
          {line}
        </span>
      ))}
    </>
  );
}

/**
 * 이번 기간을 마친 멤버에게만 붙는 말. 각자 입금이면 「입금완료」, 나중에 정산이면 「정산완료」 다.
 *
 * 아직인 사람에게는 아무것도 달지 않는다. 안 낸 사람을 가리키는 화면을 만들지 않는다.
 */
function doneLabel(dues: BookDuesOut | undefined, memberId: string): string | null {
  const row = dues?.members.find((member) => member.member_id === memberId);
  if (row?.status !== 'done') return null;
  return dues?.rule === 'none' ? '입금완료' : '정산완료';
}

/** 멤버 한 줄. 누구나 눌러 그 사람의 지난 내역을 연다. */
function MemberRow({
  member,
  done,
  onOpen,
}: {
  member: BookMemberOut;
  done: string | null;
  onOpen: () => void;
}) {
  const name = memberName(member);
  return (
    <li className="book-settings__member">
      <button type="button" className="book-settings__member-row" onClick={onOpen}>
        <span className="book-settings__face" aria-hidden="true">
          {name.slice(0, 1)}
        </span>
        <span className="book-settings__member-name">{name}</span>
        {member.role === 'owner' ? <Chip variant="kind">관리자</Chip> : null}
        {member.is_me ? <Chip variant="kind">나</Chip> : null}
        {done != null ? <Chip variant="coach">{done}</Chip> : null}
      </button>
    </li>
  );
}

function RenameForm({
  book,
  onDone,
  onRenamed,
}: {
  book: BookOut;
  onDone: () => void;
  onRenamed: () => void;
}) {
  const update = useUpdateBook();
  const [name, setName] = useState(book.name);
  const trimmed = name.trim();
  const canSave = trimmed !== '' && trimmed !== book.name && !update.isPending;
  const message = update.error instanceof ApiError ? update.error.message : null;

  return (
    <form
      className="book-settings__rename"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave) return;
        update.mutate(
          { bookId: book.id, body: { name: trimmed } },
          {
            onSuccess: () => {
              onRenamed();
              onDone();
            },
          },
        );
      }}
    >
      <BookField label="가계부 이름" value={name} onChange={setName} maxLength={20} autoFocus />
      {message != null ? (
        <p className="book-manage__notice" role="alert">
          {message}
        </p>
      ) : null}
      <div className="book-settings__rename-actions">
        <Button variant="outline" onClick={onDone}>
          취소
        </Button>
        <Button type="submit" variant="primarySmall" disabled={!canSave}>
          저장
        </Button>
      </div>
    </form>
  );
}
