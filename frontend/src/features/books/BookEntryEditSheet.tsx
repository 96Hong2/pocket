import { useEffect, useId, useRef, useState } from 'react';

import { useOverlayBackClose, useToast } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  ApiError,
  parseDecimalOr,
  useDeleteBookEntry,
  useMoveEntryOut,
  useRestoreBookEntry,
  useUndoMoveOut,
  useUpdateBookEntry,
  type BookEntryOut,
  type BookEntryUpdate,
  type BookOut,
} from '../../shared/api';
import { CategoryPicker, FutureDayConfirm } from '../../shared/ledger';
import { isFutureDay } from '../../shared/lib/format';
import { DAY_MAX } from '../../shared/lib/limits';
import {
  AmountField,
  BottomSheet,
  Button,
  CategoryAvatar,
  LeaveConfirm,
  iconOf,
} from '../../shared/ui';

import { CategoryComposeOverlay } from '../categories';

import {
  asPickable,
  deleteOthersText,
  editedLine,
  editedToast,
  entryCategory,
  entryTitle,
  wroteLine,
} from './bookEntryText';
import { BookDestinationRow } from './BookDestinationRow';
import { BookPayerRow } from './BookPayerRow';

export interface BookEntryEditSheetProps {
  book: BookOut;
  /** 고칠 기록. `null` 이면 닫혀 있다. */
  entry: BookEntryOut | null;
  onClose: () => void;
}

/**
 * 공유 기록 고치기. 개인 기록 수정(`EditSheet`)과 같은 자리, 같은 이름(「기록 수정」)이다.
 *
 * 맨 위에 누가 적었고 누가 마지막에 고쳤는지를 적는다. 같이 쓰는 기록이라 「이거 누가
 * 바꿨지」 가 가장 먼저 궁금하다. 할 수 없는 일의 버튼은 설명 없이 숨긴다.
 *
 * **내가 적은 것은 묻지 않고 지운다.** 대신 「지웠어요 [되돌리기]」 알림을 띄운다.
 * 남이 적은 것을 관리자가 지울 때만 한 번 묻는다. 그 사람 화면에서도 사라지기 때문이다.
 */
export function BookEntryEditSheet({ book, entry, onClose }: BookEntryEditSheetProps) {
  const analytics = useAnalytics();
  const toast = useToast();
  // 되돌리기는 시트가 닫힌 뒤 알림에서 누른다. 그래서 요청 훅을 닫혀도 남는 이 바깥에 둔다.
  const restore = useRestoreBookEntry();
  const undoMove = useUndoMoveOut();
  const dirtyRef = useRef(false);
  const [asking, setAsking] = useState(false);

  function requestClose(): void {
    if (asking) return;
    if (dirtyRef.current) {
      setAsking(true);
      return;
    }
    onClose();
  }

  useOverlayBackClose(entry != null, requestClose);

  function afterDelete(deleted: BookEntryOut): void {
    toast.show({
      text: '지웠어요',
      actionLabel: '되돌리기',
      onAction: () => {
        analytics.log(
          EVENTS.recordChanged,
          { action: 'restore', book: 'shared' },
          { kind: 'click' },
        );
        restore.mutate(
          { bookId: deleted.book_id, entryId: deleted.id },
          {
            onError: (error) =>
              toast.show({
                text: error instanceof ApiError ? error.message : '되돌리지 못했어요',
              }),
          },
        );
      },
    });
  }

  /** 내 가계부로 옮긴 뒤. 되돌리면 같은 기록이 낸 사람·분류·고친 사람째 돌아온다. */
  function afterMoveOut(moved: BookEntryOut): void {
    toast.show({
      text: '내 가계부로 옮겼어요',
      actionLabel: '되돌리기',
      onAction: () => {
        // 되돌림은 옮김으로 세지 않는다. 옮긴 횟수가 되돌린 만큼 부푼다.
        analytics.log(
          EVENTS.recordChanged,
          { action: 'undo_move', to: 'shared', book: 'shared' },
          { kind: 'click' },
        );
        undoMove.mutate(
          { bookId: moved.book_id, entryId: moved.id },
          {
            onError: (error) =>
              toast.show({
                text:
                  error instanceof ApiError
                    ? (error.serverMessage ?? '되돌리지 못했어요')
                    : '되돌리지 못했어요',
              }),
          },
        );
      },
    });
  }

  return (
    <BottomSheet
      open={entry != null}
      onClose={requestClose}
      ariaLabel="기록 수정"
      className="tx-edit book-edit"
      size="tall"
    >
      {entry != null ? (
        <EntryForm
          key={entry.id}
          book={book}
          entry={entry}
          dirtyRef={dirtyRef}
          onClose={onClose}
          onDeleted={afterDelete}
          onMovedOut={afterMoveOut}
          onSaved={(text) => toast.show({ text })}
        />
      ) : null}
      {asking ? (
        <LeaveConfirm
          text="고친 것이 사라져요. 그만둘까요?"
          stayLabel="계속 고치기"
          onStay={() => setAsking(false)}
          onLeave={() => {
            setAsking(false);
            onClose();
          }}
        />
      ) : null}
    </BottomSheet>
  );
}

function EntryForm({
  book,
  entry,
  dirtyRef,
  onClose,
  onDeleted,
  onMovedOut,
  onSaved,
}: {
  book: BookOut;
  entry: BookEntryOut;
  /** 고친 것이 있나. 바깥 시트가 나가기 전에 한 번 묻는 데 쓴다. 상태로 올리면 한 박자 늦다. */
  dirtyRef: { current: boolean };
  onClose: () => void;
  onDeleted: (entry: BookEntryOut) => void;
  /** 내 가계부로 옮긴 뒤. 알림과 되돌리기는 시트 바깥이 띄운다. */
  onMovedOut: (entry: BookEntryOut) => void;
  onSaved: (text: string) => void;
}) {
  const analytics = useAnalytics();
  const update = useUpdateBookEntry();
  const remove = useDeleteBookEntry();
  const moveOut = useMoveEntryOut();
  const dayId = useId();

  const readOnly = book.ended;
  const savedAmount = parseDecimalOr(entry.amount, 0);
  const [day, setDay] = useState(entry.occurred_on);
  const [title, setTitle] = useState(entry.title ?? '');
  const [amount, setAmount] = useState(String(savedAmount));
  const [categoryId, setCategoryId] = useState<string | null>(entry.category_id);
  const [payerId, setPayerId] = useState<string | null>(entry.paid_by_member_id);
  /** 내 가계부로 옮길까. 적은 사람에게만 이 줄이 선다. */
  const [toMine, setToMine] = useState(false);
  const [asking, setAsking] = useState(false);
  const [futureAsking, setFutureAsking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  /** 새 분류 만들기 창이 떴나. 이 가계부 분류를 만들어 멤버 모두에게 보인다. */
  const [creating, setCreating] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);

  // 작은 화면에서는 버튼 줄이 접힌 아래에 있다. 물음이 열리면 그 자리로 데려간다.
  useEffect(() => {
    if (asking) confirmRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [asking]);

  const busy = update.isPending || remove.isPending || moveOut.isPending;
  const nextAmount = Number(amount);
  const amountOk = amount !== '' && Number.isFinite(nextAmount) && nextAmount > 0;
  const headCategory =
    book.categories.find((category) => category.id === categoryId) ?? entryCategory(book, entry);
  const edited = editedLine(book, entry);
  const own = entry.can_move;

  function changes(): BookEntryUpdate {
    const next: BookEntryUpdate = {};
    const trimmed = title.trim();
    if (day !== entry.occurred_on) next.occurred_on = day;
    if (trimmed !== (entry.title ?? '')) next.title = trimmed === '' ? null : trimmed;
    if (amountOk && nextAmount !== savedAmount) next.amount = String(nextAmount);
    if (categoryId !== entry.category_id) next.category_id = categoryId;
    if (payerId !== entry.paid_by_member_id && payerId != null) next.paid_by_member_id = payerId;
    return next;
  }

  dirtyRef.current = !readOnly && (Object.keys(changes()).length > 0 || toMine);

  function requestSubmit(): void {
    if (day !== entry.occurred_on && isFutureDay(day)) {
      setFutureAsking(true);
      return;
    }
    void submit();
  }

  async function submit(): Promise<void> {
    setFutureAsking(false);
    setFailed(null);
    const body = changes();
    const fields = Object.keys(body);
    if (fields.length === 0 && !toMine) {
      onClose();
      return;
    }
    try {
      if (fields.length > 0) {
        await update.mutateAsync({ bookId: book.id, entryId: entry.id, body });
        analytics.log(EVENTS.recordChanged, {
          action: 'edit',
          fields: fields.sort().join(','),
          book: 'shared',
        });
      }
      if (toMine) {
        await moveOut.mutateAsync({ bookId: book.id, entryId: entry.id });
        analytics.log(EVENTS.recordChanged, { action: 'move', to: 'mine', book: 'shared' });
        onClose();
        onMovedOut(entry);
        return;
      }
      onClose();
      onSaved(editedToast(book));
    } catch (error) {
      setFailed(
        error instanceof ApiError
          ? error.message
          : '고친 것을 저장하지 못했어요. 입력한 값은 그대로 있어요.',
      );
    }
  }

  async function destroy(): Promise<void> {
    try {
      setFailed(null);
      await remove.mutateAsync({ bookId: book.id, entryId: entry.id });
      analytics.log(EVENTS.recordChanged, { action: 'delete', book: 'shared' });
      onClose();
      onDeleted(entry);
    } catch (error) {
      setAsking(false);
      setFailed(
        error instanceof ApiError ? error.message : '지우지 못했어요. 기록은 그대로 있어요.',
      );
    }
  }

  function askOrDelete(): void {
    // 내가 적은 것은 묻지 않는다. 알림의 되돌리기가 그 물음을 대신한다.
    if (own) {
      void destroy();
      return;
    }
    analytics.log(EVENTS.recordChanged, { action: 'delete_asked', book: 'shared' });
    setAsking(true);
  }

  return (
    <div className="tx-edit__body">
      <div className="tx-edit__scroll">
        <div className="tx-edit__head">
          <CategoryAvatar {...iconOf(headCategory)} size={58} />
          {/* 날짜는 바로 아래 「날짜」 칸이 말한다. 제목에 이어 붙이지 않는다. */}
          <p className="tx-edit__title">{entryTitle(book, entry)}</p>
        </div>

        <div className="book-edit__who">
          <p className="book-edit__who-line">{wroteLine(book, entry)}</p>
          {edited != null ? <p className="book-edit__who-line">{edited}</p> : null}
        </div>

        {own && !readOnly ? (
          <BookDestinationRow
            className="book-edit__dest"
            books={[book]}
            value={toMine ? null : book.id}
            disabled={busy}
            onChange={(next) => setToMine(next == null)}
          />
        ) : null}

        <div className="tx-edit__day">
          <label className="tx-edit__day-label" htmlFor={dayId}>
            날짜
          </label>
          <input
            id={dayId}
            className="tx-edit__day-input"
            type="date"
            value={day}
            max={DAY_MAX}
            disabled={busy || readOnly}
            onChange={(event) =>
              setDay(event.target.value === '' ? entry.occurred_on : event.target.value)
            }
          />
        </div>

        <div className="tx-edit__fields">
          <label className="tx-edit__field">
            <span className="tx-edit__label">상호</span>
            <input
              className="tx-edit__input"
              value={title}
              disabled={readOnly}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="어디서 썼나요"
              maxLength={120}
            />
          </label>
          <AmountField
            className="tx-edit__field--amount"
            variant="compact"
            label="금액"
            value={amount}
            disabled={readOnly}
            onChange={setAmount}
          />
        </div>

        <CategoryPicker
          className="tx-edit__cats"
          ariaLabel="카테고리"
          size="sm"
          categories={asPickable(book.categories)}
          selectedId={categoryId}
          disabled={busy || readOnly}
          onPick={(category) => setCategoryId(category.id)}
          onCreate={readOnly ? undefined : () => setCreating(true)}
          // 공유 분류는 관리 화면이 없다. 그리로 가라는 줄을 세우지 않는다.
          manageNote={false}
        />

        {/* 고치던 날짜·상호·금액은 뒤에 그대로 남는다. 만들면 그 분류가 골라진다. */}
        <CategoryComposeOverlay
          open={creating}
          fixedKind="expense"
          bookId={book.id}
          onBack={() => setCreating(false)}
          onClose={() => setCreating(false)}
          onCreated={(created) => setCategoryId(created.id)}
        />

        <BookPayerRow
          className="book-edit__payer"
          book={book}
          value={payerId}
          disabled={busy || readOnly}
          onChange={setPayerId}
        />

        {!amountOk && !readOnly ? (
          <p className="tx-edit__hint">금액은 1원부터 넣을 수 있어요</p>
        ) : null}

        {failed != null ? (
          <p className="tx-edit__notice" role="alert">
            {failed}
          </p>
        ) : null}
      </div>

      {futureAsking ? (
        <FutureDayConfirm
          day={day}
          onFix={() => setFutureAsking(false)}
          onSave={() => void submit()}
        />
      ) : null}

      <div className="pk-sheet-foot">
        {readOnly ? (
          <>
            <p className="book-edit__ended" role="status">
              끝난 가계부라 고칠 수 없어요
            </p>
            <Button variant="outline" fullWidth onClick={onClose}>
              닫기
            </Button>
          </>
        ) : asking ? (
          <div className="tx-edit__confirm" role="group" aria-label="삭제 확인" ref={confirmRef}>
            <p className="tx-edit__confirm-text">{deleteOthersText(book, entry)}</p>
            <div className="tx-edit__actions">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setAsking(false);
                  analytics.log(EVENTS.recordChanged, {
                    action: 'delete_cancelled',
                    book: 'shared',
                  });
                }}
              >
                그대로 둘래요
              </Button>
              <Button
                variant="danger"
                className="tx-edit__done"
                disabled={busy}
                onClick={() => void destroy()}
              >
                지울게요
              </Button>
            </div>
          </div>
        ) : (
          <div className="tx-edit__actions">
            {entry.can_delete ? (
              <Button variant="outline" disabled={busy} onClick={askOrDelete}>
                지우기
              </Button>
            ) : null}
            <Button
              variant="primarySmall"
              className="tx-edit__done"
              disabled={busy || !amountOk}
              onClick={requestSubmit}
            >
              저장
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
