import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { ApiError, parseDecimal, useUpdateBook, type BookOut } from '../../shared/api';
import { AmountField, BottomSheet, Button } from '../../shared/ui';

import { budgetLabel } from './bookText';

export interface BookBudgetSheetProps {
  open: boolean;
  book: BookOut | null;
  onClose: () => void;
  /** 저장이 끝난 뒤. 알림을 띄울 자리가 부른다. 예산을 없앴으면 `monthly_budget` 이 null 이다. */
  onSaved?: (book: BookOut) => void;
}

/**
 * 공유 가계부 예산. 우리 집 홈의 「예산 정하기」 와 설정의 「한 달 예산」 이 같은 창을 쓴다.
 *
 * 예산은 매달 같은 금액이다. 멤버 누구나 정하고 바꾼다. 이미 있으면 「예산 없애기」 로 지울 수 있다.
 * 개인 예산 창(`BudgetAmountSheet`)과 같은 모양으로 둔다.
 */
export function BookBudgetSheet({ open, book, onClose, onSaved }: BookBudgetSheetProps) {
  // 저장 응답을 기다리는 동안 닫히지 않는다. 닫히면 실패를 그릴 자리가 없어진다.
  const [saving, setSaving] = useState(false);
  useOverlayBackClose(open, onClose, saving);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!saving}
      title={book != null ? budgetLabel(book.kind) : '한 달 예산'}
      className="book-budget"
    >
      {open && book != null ? (
        // 열 때마다 새로 마운트해 지금 예산을 넣는다.
        <BookBudgetForm
          key={book.id}
          book={book}
          onSavingChange={setSaving}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </BottomSheet>
  );
}

function BookBudgetForm({
  book,
  onSavingChange,
  onClose,
  onSaved,
}: {
  book: BookOut;
  onSavingChange: (saving: boolean) => void;
  onClose: () => void;
  onSaved?: (book: BookOut) => void;
}) {
  const update = useUpdateBook();
  const current = parseDecimal(book.monthly_budget);
  const [digits, setDigits] = useState(current == null ? '' : String(current));

  const next = Number(digits);
  const canSave = digits !== '' && next > 0 && !update.isPending;
  const message = update.error instanceof ApiError ? update.error.message : null;

  function save(amount: number | null): void {
    onSavingChange(true);
    update.mutate(
      { bookId: book.id, body: { monthly_budget: amount } },
      {
        onSettled: () => onSavingChange(false),
        onSuccess: (saved) => {
          onSaved?.(saved);
          onClose();
        },
      },
    );
  }

  return (
    <div className="book-budget__body">
      <AmountField label="금액" value={digits} onChange={setDigits} />

      {message != null ? (
        <p className="book-budget__notice" role="alert">
          {message}
        </p>
      ) : null}

      {message == null && digits !== '' && next <= 0 ? (
        <p className="book-budget__notice" role="status">
          1원부터 정할 수 있어요
        </p>
      ) : null}

      <Button fullWidth disabled={!canSave} onClick={() => save(next)}>
        저장
      </Button>

      {current != null ? (
        <Button variant="ghost" fullWidth disabled={update.isPending} onClick={() => save(null)}>
          예산 없애기
        </Button>
      ) : null}
    </div>
  );
}
