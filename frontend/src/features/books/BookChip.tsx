import { useState } from 'react';

import type { BookOut } from '../../shared/api';
import { cx } from '../../shared/lib/cx';

import { BookPickerSheet } from './BookPickerSheet';
import { MY_BOOK_NAME } from './bookText';

export interface BookChipProps {
  /** 지금 보는 가계부. `null` 이면 내 가계부다. */
  value: string | null;
  books: readonly BookOut[];
  onChange: (bookId: string | null) => void;
  /** 고르기 창 제목. 안 주면 「어느 가계부를 볼까요」. */
  title?: string;
  className?: string;
}

/**
 * 지금 보는 가계부 이름과 ▾. 누르면 고르기 창이 뜬다.
 *
 * 홈 맨 위와 리포트 머리에 선다. 가계부가 하나도 없는 사람에게는 부르는 쪽이 아예 그리지 않는다.
 * 읽는 이름에 「보는 가계부」 를 붙인다. 이름만 읽히면 기록 시트의 「내 가계부」 칩과 구분이 안 된다.
 */
export function BookChip({ value, books, onChange, title, className }: BookChipProps) {
  const [open, setOpen] = useState(false);
  const current = value == null ? null : books.find((book) => book.id === value);
  const label = value == null ? MY_BOOK_NAME : (current?.name ?? '가계부');

  return (
    <>
      <button
        type="button"
        className={cx('book-chip', className)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`보는 가계부 ${label}`}
        onClick={() => setOpen(true)}
      >
        <span className="book-chip__name">{label}</span>
        <span className="book-chip__caret" aria-hidden="true">
          ▾
        </span>
      </button>
      <BookPickerSheet
        open={open}
        onClose={() => setOpen(false)}
        value={value}
        books={books}
        onChange={onChange}
        title={title}
      />
    </>
  );
}
