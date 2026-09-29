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
 * 지금 보는 가계부 이름과 아래 화살표. 누르면 고르기 창이 뜬다.
 *
 * 흰 알약에 테두리를 둘러 고르는 칸으로 읽히게 한다. 글자만 두면 제목처럼 보여 누를 생각을 못 한다.
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
        <svg
          className="book-chip__caret"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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
