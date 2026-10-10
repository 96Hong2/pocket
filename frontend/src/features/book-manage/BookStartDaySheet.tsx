import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { ApiError, useUpdateBook, type BookOut } from '../../shared/api';
import { BottomSheet, MonthStartPicker } from '../../shared/ui';

export interface BookStartDaySheetProps {
  open: boolean;
  book: BookOut;
  onClose: () => void;
  /** 저장한 뒤. 알림을 띄울 자리가 부른다. 같은 날을 고르면 저장하지 않고 닫기만 한다. */
  onSaved: () => void;
}

/**
 * 공유 가계부의 한 달 시작일. 내 가계부의 「한 달 시작일」 과 같은 칸과 미리보기를 쓴다.
 *
 * 멤버 누구나 바꾼다. 예산, 정산, 리포트의 「이번 달」 이 이 날부터 시작한다.
 */
export function BookStartDaySheet({ open, book, onClose, onSaved }: BookStartDaySheetProps) {
  const [saving, setSaving] = useState(false);
  useOverlayBackClose(open, onClose, saving);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!saving}
      title="한 달 시작일"
      className="month-start"
    >
      {/* 열 때마다 새로 마운트해 지금 저장된 날을 골라 둔다. 앞서 실패한 줄도 남지 않는다. */}
      {open ? (
        <StartDayForm book={book} onSavingChange={setSaving} onClose={onClose} onSaved={onSaved} />
      ) : null}
    </BottomSheet>
  );
}

function StartDayForm({
  book,
  onSavingChange,
  onClose,
  onSaved,
}: {
  book: BookOut;
  onSavingChange: (saving: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const analytics = useAnalytics();
  const update = useUpdateBook();
  const failure =
    update.error instanceof ApiError
      ? update.error.message
      : update.isError
        ? '시작일을 저장하지 못했어요.'
        : null;

  function save(day: number): void {
    const from = book.month_start_day;
    if (day === from) {
      onClose();
      return;
    }
    onSavingChange(true);
    update.mutate(
      { bookId: book.id, body: { month_start_day: day } },
      {
        onSettled: () => onSavingChange(false),
        onSuccess: () => {
          analytics.log(
            EVENTS.bookChanged,
            { action: 'start_day_changed', kind: book.kind, day, from_day: from },
            { kind: 'click' },
          );
          onSaved();
          onClose();
        },
      },
    );
  }

  return (
    <MonthStartPicker
      value={book.month_start_day}
      saving={update.isPending}
      notice={
        failure != null ? (
          <p className="book-manage__notice" role="alert">
            {failure}
          </p>
        ) : null
      }
      onSave={save}
    />
  );
}
