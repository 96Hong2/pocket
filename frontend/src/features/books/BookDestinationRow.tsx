import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useBridge, useOverlayBackClose } from '../../app/providers';
import type { BookOut } from '../../shared/api';
import { readBookLast } from '../../shared/lib/bookLast';
import { cx } from '../../shared/lib/cx';
import { Button, CategoryAvatar } from '../../shared/ui';
import { trapTab } from '../../shared/ui/focusTrap';

import { secondBookId } from './bookEntryText';
import { MY_BOOK_NAME, bookKindIcon } from './bookText';

export interface BookDestinationRowProps {
  /** 지금 쓰는(끝나지 않은) 공유 가계부. 비어 있으면 부르는 쪽이 이 줄을 아예 안 그린다. */
  books: readonly BookOut[];
  /** 고른 곳. `null` 이면 내 가계부다. */
  value: string | null;
  onChange: (bookId: string | null) => void;
  /** 마지막에 적은 곳이 없을 때 둘째 칩에 세울 가계부. 홈이 보고 있는 가계부다. */
  preferredId?: string | null;
  disabled?: boolean;
  className?: string;
}

const OTHER_LABEL = '다른 가계부';

/**
 * 「적을 곳」 한 줄. 내 가계부와 공유 가계부 중 어디에 적을지 고른다.
 *
 * **칩은 셋까지다.** 내 가계부, 둘째 자리(마지막에 적은 곳이나 보는 가계부), 셋째 자리다.
 * 공유 가계부가 둘이면 셋째가 나머지 하나이고, 셋 이상이면 「다른 가계부」 가 고르기 창을 연다.
 * 거기서 고른 가계부가 둘째 자리로 온다. 칩이 늘어나면 좁은 폰에서 한 줄에 안 들어간다.
 *
 * 고르기 창은 시트를 하나 더 띄우지 않고 화면 위에 겹친다. 시트가 둘이면 닫을 때 어디로
 * 돌아가는지 흔들린다.
 */
export function BookDestinationRow({
  books,
  value,
  onChange,
  preferredId = null,
  disabled = false,
  className,
}: BookDestinationRowProps) {
  const bridge = useBridge();
  /** 「다른 가계부」 에서 고른 것. 둘째 칩 자리를 차지한다. */
  const [picked, setPicked] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let alive = true;
    void readBookLast(bridge.storage).then((id) => {
      if (alive) setLastId(id);
    });
    return () => {
      alive = false;
    };
  }, [bridge]);

  // 마지막에 적은 곳이 보는 가계부보다 앞이다. 늘 적던 곳이 늘 같은 자리에 서야 손이 기억한다.
  let second = secondBookId(books, [picked, lastId, preferredId]);
  // 고른 곳은 늘 보여야 한다. 셋째 칩에 이름이 안 서는 경우(셋 이상)에는 둘째 자리로 올린다.
  if (value != null && value !== second && books.length >= 3) second = value;
  const secondBook = books.find((book) => book.id === second) ?? null;
  const thirdBook = books.length === 2 ? (books.find((book) => book.id !== second) ?? null) : null;

  function pick(bookId: string | null): void {
    if (disabled || bookId === value) return;
    onChange(bookId);
  }

  function pickOther(bookId: string): void {
    setAsking(false);
    setPicked(bookId);
    pick(bookId);
  }

  return (
    <div className={cx('book-dest', className)}>
      <span className="book-dest__label" aria-hidden="true">
        적을 곳
      </span>
      <div className="book-dest__pills" role="group" aria-label="적을 곳">
        <button
          type="button"
          className="pk-kind__item book-dest__pill"
          aria-pressed={value == null}
          disabled={disabled}
          onClick={() => pick(null)}
        >
          {MY_BOOK_NAME}
        </button>
        {secondBook != null ? (
          <NamePill
            book={secondBook}
            pressed={value === secondBook.id}
            disabled={disabled}
            onPick={pick}
          />
        ) : null}
        {thirdBook != null ? (
          <NamePill
            book={thirdBook}
            pressed={value === thirdBook.id}
            disabled={disabled}
            onPick={pick}
          />
        ) : null}
        {books.length >= 3 ? (
          <button
            type="button"
            className="pk-kind__item book-dest__pill"
            aria-haspopup="dialog"
            aria-expanded={asking}
            disabled={disabled}
            onClick={() => setAsking(true)}
          >
            {OTHER_LABEL}
          </button>
        ) : null}
      </div>
      {asking ? (
        <WherePicker
          books={books}
          value={value}
          onPick={pickOther}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </div>
  );
}

function NamePill({
  book,
  pressed,
  disabled,
  onPick,
}: {
  book: BookOut;
  pressed: boolean;
  disabled: boolean;
  onPick: (bookId: string) => void;
}) {
  return (
    <button
      type="button"
      className="pk-kind__item book-dest__pill book-dest__pill--name"
      aria-pressed={pressed}
      aria-label={book.name}
      disabled={disabled}
      onClick={() => onPick(book.id)}
    >
      <span className="book-dest__name">{book.name}</span>
    </button>
  );
}

/**
 * 「어디에 적을까요」 고르기 창. 쓰는 가계부를 전부 세운다.
 *
 * 포털로 body 에 붙인다. 시트 안에 두면 시트의 transform 을 기준으로 잡혀 화면을 못 덮는다.
 * Esc 와 뒤로가기는 이 창만 닫는다. 캡처 단계에서 먼저 받아 시트까지 가지 않게 한다.
 */
function WherePicker({
  books,
  value,
  onPick,
  onClose,
}: {
  books: readonly BookOut[];
  value: string | null;
  onPick: (bookId: string) => void;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  // 부르는 쪽이 매번 새 함수를 넘겨도 포커스를 다시 옮기지 않게 최신 값만 붙든다.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useOverlayBackClose(true, onClose);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    boxRef.current?.querySelector<HTMLElement>('[aria-pressed="true"], button')?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
        return;
      }
      if (event.key === 'Tab' && boxRef.current != null) trapTab(boxRef.current, event);
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus();
    };
  }, []);

  return createPortal(
    <div
      className="book-where"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="book-where__box"
        role="dialog"
        aria-modal="true"
        aria-label="어디에 적을까요"
        ref={boxRef}
      >
        <p className="book-where__title">어디에 적을까요</p>
        <ul className="book-picker__list">
          {books.map((book) => (
            <li key={book.id}>
              <button
                type="button"
                className="book-picker__row"
                aria-pressed={book.id === value}
                onClick={() => onPick(book.id)}
              >
                <CategoryAvatar icon={bookKindIcon(book.kind)} size={40} />
                <span className="book-picker__name">{book.name}</span>
                <span className="book-picker__check" aria-hidden="true">
                  {book.id === value ? '✓' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Button variant="outline" fullWidth onClick={onClose}>
          닫기
        </Button>
      </div>
    </div>,
    document.body,
  );
}
