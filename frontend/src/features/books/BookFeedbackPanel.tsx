import { useEffect, useRef, useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics, type FlowId } from '../../shared/analytics';
import {
  ApiError,
  parseDecimalOr,
  useMoveEntryOut,
  useUndoMoveOut,
  useUpdateBookEntry,
  type BookEntryOut,
  type BookMonthStateOut,
  type BookOut,
} from '../../shared/api';
import { formatDayLabel, formatWeekday } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { Button, SavedHero, SheetHeader, TransactionRow, iconOf } from '../../shared/ui';

import { entryCategory, entryTitle, monthLine, othersSeeLine } from './bookEntryText';
import { BookPayerRow } from './BookPayerRow';

export interface BookFeedbackPanelProps {
  flowId: FlowId;
  book: BookOut;
  entry: BookEntryOut;
  /** 이 기록이 들어간 달의 쓴 돈과 예산. 저장 응답에 함께 온다. */
  month: BookMonthStateOut;
  onEntryChange: (entry: BookEntryOut) => void;
  onConfirm: () => void;
  /** 시트가 받은 Esc 를 이 화면의 ‹ 와 같은 길로 보내려고 건다. */
  backRef?: { current: () => void };
}

/**
 * 공유 가계부에 적은 뒤의 한 화면.
 *
 * 개인 저장 뒤 화면(`FeedbackPanel`)과 머리가 같다. ‹, 체크 그림, 「(가계부 이름)에 적었어요」.
 * 그 아래는 그 달 우리 돈, 누가 볼 수 있나, 누가 냈나까지다. 상호, 메모, 태그, 결제 수단 칸은 없다.
 * ‹ 와 뒤로가기는 확인과 같은 길을 탄다.
 * 잘못 골랐으면 「내 가계부로 옮기기」 한 번으로 되돌린다. 옮긴 것도 「되돌리기」 로 제자리에 돌아온다.
 */
export function BookFeedbackPanel({
  flowId,
  book,
  entry,
  month,
  onEntryChange,
  onConfirm,
  backRef,
}: BookFeedbackPanelProps) {
  const analytics = useAnalytics();
  const panelRef = useRef<HTMLDivElement>(null);
  const update = useUpdateBookEntry();
  const moveOut = useMoveEntryOut();
  const undoMove = useUndoMoveOut();
  const [moved, setMoved] = useState(false);

  // 저장하면 방금 누른 칩이 사라져 포커스가 시트 밖으로 떨어진다. 여기서 다시 잡는다.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const busy = update.isPending || moveOut.isPending || undoMove.isPending;
  const error = [update.error, moveOut.error].find((item) => item instanceof ApiError);
  // 되돌리기가 막힌 이유는 서버 문구로. 없으면 한 줄로 끝낸다.
  const undoFailure =
    undoMove.error == null
      ? null
      : undoMove.error instanceof ApiError
        ? (undoMove.error.serverMessage ?? '되돌리지 못했어요')
        : '되돌리지 못했어요';
  const category = entryCategory(book, entry);
  const dayLabel = `${formatDayLabel(entry.occurred_on)} (${formatWeekday(entry.occurred_on)})`;

  function changePayer(memberId: string): void {
    if (memberId === entry.paid_by_member_id) return;
    analytics.log(
      EVENTS.recordChanged,
      { action: 'edit', field: 'paid_by', method: 'keypad', book: 'shared' },
      { flowId },
    );
    update.mutate(
      { bookId: book.id, entryId: entry.id, body: { paid_by_member_id: memberId } },
      { onSuccess: onEntryChange },
    );
  }

  function moveToMine(): void {
    analytics.log(
      EVENTS.recordChanged,
      { action: 'move', to: 'mine', book: 'shared' },
      { flowId, kind: 'click' },
    );
    undoMove.reset();
    moveOut.mutate({ bookId: book.id, entryId: entry.id }, { onSuccess: () => setMoved(true) });
  }

  /** 옮긴 것을 되돌린다. 같은 기록이 낸 사람·분류째 이 가계부로 돌아온다. */
  function undoMoveToMine(): void {
    analytics.log(
      EVENTS.recordChanged,
      { action: 'undo_move', to: 'shared', book: 'shared' },
      { flowId, kind: 'click' },
    );
    undoMove.mutate(
      { bookId: book.id, entryId: entry.id },
      {
        onSuccess: (restored) => {
          setMoved(false);
          onEntryChange(restored);
        },
      },
    );
  }

  function confirm(): void {
    analytics.log(EVENTS.feedbackAction, { action: 'confirm' }, { flowId, kind: 'click' });
    onConfirm();
  }

  // 폰 뒤로가기와 토스 위 ‹ 도 확인과 같다. 옮기는 중에는 삼킨다.
  useOverlayBackClose(true, confirm, busy);
  useEffect(() => {
    if (backRef != null) backRef.current = () => (busy ? undefined : confirm());
  });

  return (
    <div className="feedback book-feedback" ref={panelRef} tabIndex={-1}>
      <SheetHeader onBack={() => (busy ? undefined : confirm())} />
      <SavedHero
        title={moved ? '내 가계부로 옮겼어요' : `${book.name}에 적었어요`}
        testId={TEST_IDS.feedbackHeadline}
      />

      <TransactionRow
        {...iconOf(category)}
        title={entryTitle(book, entry)}
        subtitle={entry.title != null ? `${category?.name ?? '기록'}, ${dayLabel}` : dayLabel}
        amount={parseDecimalOr(entry.amount, 0)}
        tone="expense"
        avatarSize={50}
        hideDivider
      />

      {moved ? (
        <button
          type="button"
          className="book-feedback__move"
          disabled={busy}
          onClick={undoMoveToMine}
        >
          되돌리기
        </button>
      ) : (
        <>
          <div className="feedback__card" role="status">
            <p className="feedback__headline" data-numeric="">
              {monthLine(book, month)}
            </p>
            {othersSeeLine(book) != null ? (
              <p className="feedback__detail">{othersSeeLine(book)}</p>
            ) : null}
          </div>

          <BookPayerRow
            book={book}
            value={entry.paid_by_member_id}
            disabled={busy}
            onChange={changePayer}
            className="book-feedback__payer"
          />

          {entry.can_move ? (
            <button
              type="button"
              className="book-feedback__move"
              disabled={busy}
              onClick={moveToMine}
            >
              내 가계부로 옮기기
            </button>
          ) : null}
        </>
      )}

      {error != null ? (
        <p className="feedback__notice" role="alert">
          {error.message}
        </p>
      ) : null}
      {undoFailure != null ? (
        <p className="feedback__notice" role="alert">
          {undoFailure}
        </p>
      ) : null}

      <Button
        className="feedback__confirm"
        variant="primarySmall"
        fullWidth
        disabled={busy}
        onClick={confirm}
      >
        확인
      </Button>
    </div>
  );
}
