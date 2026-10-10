import { useId, useState } from 'react';

import { useOverlayBackClose, useToast } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { ApiError, useCreateBookEntry, type BookOut } from '../../shared/api';
import { toLedgerDate } from '../../shared/lib/format';
import { DAY_MAX } from '../../shared/lib/limits';
import { AmountField, BottomSheet, Button } from '../../shared/ui';

import { BookPayerRow } from './BookPayerRow';

export interface BookDepositSheetProps {
  open: boolean;
  book: BookOut;
  onClose: () => void;
}

/**
 * 「입금 적기」. 각자 입금 가계부에서 누가 얼마를 넣었는지 적는다.
 *
 * 입금은 쓴 돈, 남은 예산, 정산 어디에도 들지 않는다(서버가 가른다). 분류가 없고 내 가계부로
 * 옮길 수 없다. 넣은 사람은 처음에 나로 골라져 있다.
 */
export function BookDepositSheet({ open, book, onClose }: BookDepositSheetProps) {
  const [saving, setSaving] = useState(false);
  useOverlayBackClose(open, onClose, saving);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!saving}
      title="입금 적기"
      className="book-deposit"
    >
      {/* 열 때마다 새로 마운트해 오늘 날짜와 나를 다시 골라 둔다. */}
      {open ? <DepositForm book={book} onSavingChange={setSaving} onClose={onClose} /> : null}
    </BottomSheet>
  );
}

function DepositForm({
  book,
  onSavingChange,
  onClose,
}: {
  book: BookOut;
  onSavingChange: (saving: boolean) => void;
  onClose: () => void;
}) {
  const analytics = useAnalytics();
  const toast = useToast();
  const create = useCreateBookEntry();
  const dayId = useId();
  const [digits, setDigits] = useState('');
  const [payerId, setPayerId] = useState<string>(book.my_member_id);
  const [day, setDay] = useState(() => toLedgerDate(new Date()));
  const [memo, setMemo] = useState('');

  const amount = Number(digits);
  const canSave = digits !== '' && amount > 0 && !create.isPending;
  const message =
    create.error instanceof ApiError
      ? create.error.message
      : create.isError
        ? '입금을 적지 못했어요. 적은 값은 그대로 있어요.'
        : null;

  function save(): void {
    if (!canSave) return;
    const title = memo.trim();
    onSavingChange(true);
    create.mutate(
      {
        bookId: book.id,
        body: {
          kind: 'deposit',
          amount: String(amount),
          occurred_on: day,
          paid_by_member_id: payerId,
          title: title === '' ? null : title,
        },
      },
      {
        onSettled: () => onSavingChange(false),
        onSuccess: () => {
          analytics.log(
            EVENTS.bookChanged,
            { action: 'deposit_added', kind: book.kind },
            { kind: 'click' },
          );
          onClose();
          toast.show({ text: '입금을 적었어요' });
        },
      },
    );
  }

  return (
    <div className="book-deposit__body">
      <AmountField label="금액" value={digits} onChange={setDigits} />

      <BookPayerRow
        book={book}
        label="넣은 사람"
        value={payerId}
        disabled={create.isPending}
        onChange={setPayerId}
      />

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
          disabled={create.isPending}
          onChange={(event) => setDay(event.target.value === '' ? day : event.target.value)}
        />
      </div>

      <label className="tx-edit__field">
        <span className="tx-edit__label">메모</span>
        <input
          className="tx-edit__input"
          value={memo}
          disabled={create.isPending}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="예: 10월 회비"
          maxLength={120}
        />
      </label>

      {message != null ? (
        <p className="book-deposit__notice" role="alert">
          {message}
        </p>
      ) : null}

      <Button fullWidth disabled={!canSave} onClick={save}>
        저장
      </Button>
    </div>
  );
}
