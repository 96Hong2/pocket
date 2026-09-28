import { useEffect, useRef, useState } from 'react';

import { EVENTS, useAnalytics, type FlowId } from '../../shared/analytics';
import {
  ApiError,
  parseDecimal,
  parseDecimalOr,
  useMoveEntryOut,
  useUpdateBookEntry,
  type BookEntryOut,
  type BookMonthStateOut,
  type BookOut,
} from '../../shared/api';
import { formatCurrency, toLedgerDate } from '../../shared/lib/format';
import { Button, TransactionRow, iconOf } from '../../shared/ui';

import { entryCategory, entryTitle, monthWord, othersSeeLine } from './bookEntryText';
import { BookPayerRow } from './BookPayerRow';

export interface BookFeedbackPanelProps {
  flowId: FlowId;
  book: BookOut;
  entry: BookEntryOut;
  /** 이 기록이 들어간 달의 쓴 돈과 예산. 저장 응답에 함께 온다. */
  month: BookMonthStateOut;
  onEntryChange: (entry: BookEntryOut) => void;
  onConfirm: () => void;
}

/**
 * 공유 가계부에 적은 뒤의 한 화면.
 *
 * 개인 저장 뒤 화면(`FeedbackPanel`)보다 짧다. 어디에 적혔나, 그 달 우리 돈이 어떤가,
 * 누가 볼 수 있나, 누가 냈나까지다. 상호·메모·태그·결제 수단 칸은 없다.
 * 잘못 골랐으면 「내 가계부로 옮기기」 한 번으로 되돌린다.
 */
export function BookFeedbackPanel({
  flowId,
  book,
  entry,
  month,
  onEntryChange,
  onConfirm,
}: BookFeedbackPanelProps) {
  const analytics = useAnalytics();
  const panelRef = useRef<HTMLDivElement>(null);
  const update = useUpdateBookEntry();
  const moveOut = useMoveEntryOut();
  const [moved, setMoved] = useState(false);

  // 저장하면 방금 누른 칩이 사라져 포커스가 시트 밖으로 떨어진다. 여기서 다시 잡는다.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const busy = update.isPending || moveOut.isPending;
  const error = [update.error, moveOut.error].find((item) => item instanceof ApiError);
  const category = entryCategory(book, entry);

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
    moveOut.mutate({ bookId: book.id, entryId: entry.id }, { onSuccess: () => setMoved(true) });
  }

  function confirm(): void {
    analytics.log(EVENTS.feedbackAction, { action: 'confirm' }, { flowId, kind: 'click' });
    onConfirm();
  }

  return (
    <div className="feedback book-feedback" ref={panelRef} tabIndex={-1}>
      <div className="feedback__head">
        <span className="feedback__label book-feedback__label">
          {moved ? '내 가계부로 옮겼어요' : `${book.name}에 적었어요`}
        </span>
      </div>

      <TransactionRow
        {...iconOf(category)}
        title={entryTitle(book, entry)}
        subtitle={entry.title != null ? category?.name : undefined}
        amount={parseDecimalOr(entry.amount, 0)}
        tone="expense"
        avatarSize={50}
        hideDivider
      />

      {moved ? null : (
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

/**
 * 「이번 달 남은 예산 215,200원」 또는 「이번 달 같이 쓴 돈 32,000원」.
 *
 * 여행 가계부는 달이 아니라 여행 전체로 정산한다. 서버도 여행 전체를 세어 보낸다(`month`).
 * 그래서 「이번 여행에 같이 쓴 돈」 이다.
 */
function monthLine(book: BookOut, month: BookMonthStateOut): string {
  const trip = book.kind === 'trip';
  const when = trip ? '이번 여행' : monthWord(month.period_start, toLedgerDate(new Date()));
  const remaining = parseDecimal(month.remaining);
  if (month.budget != null && remaining != null) {
    if (remaining < 0) return `${when} 예산보다 ${formatCurrency(-remaining)} 더 썼어요`;
    return `${when} 남은 예산 ${formatCurrency(remaining)}`;
  }
  const spent = formatCurrency(parseDecimalOr(month.spent, 0));
  return trip ? `${when}에 같이 쓴 돈 ${spent}` : `${when} 같이 쓴 돈 ${spent}`;
}
