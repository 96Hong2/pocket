import { useOverlayBackClose } from '../../app/providers';
import type { BookOut } from '../../shared/api';
import { BottomSheet, CategoryAvatar, type IconName } from '../../shared/ui';

import { MY_BOOK_ICON, MY_BOOK_NAME, bookKindIcon, splitBooks } from './bookText';

export interface BookPickerSheetProps {
  open: boolean;
  onClose: () => void;
  /** 지금 고른 가계부. `null` 이면 내 가계부다. */
  value: string | null;
  books: readonly BookOut[];
  onChange: (bookId: string | null) => void;
  /** 창 제목. 홈은 「어느 가계부를 볼까요」 다. */
  title?: string;
}

/**
 * 어느 가계부를 볼지 고르는 창. 홈과 리포트가 같은 창을 쓴다.
 *
 * 내 가계부가 늘 맨 위다. 그 아래 쓰는 중인 가계부, 맨 아래 「완료한 가계부」 를 둔다.
 * 고르면 바로 닫힌다. 확인 버튼을 두지 않는다.
 */
export function BookPickerSheet({
  open,
  onClose,
  value,
  books,
  onChange,
  title = '어느 가계부를 볼까요',
}: BookPickerSheetProps) {
  useOverlayBackClose(open, onClose);
  const { active, ended } = splitBooks(books);

  function pick(bookId: string | null): void {
    onClose();
    if (bookId !== value) onChange(bookId);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={title} className="book-picker">
      <ul className="book-picker__list">
        <li>
          <PickRow
            icon={MY_BOOK_ICON}
            name={MY_BOOK_NAME}
            selected={value == null}
            onPick={() => pick(null)}
          />
        </li>
        {active.map((book) => (
          <li key={book.id}>
            <PickRow
              icon={bookKindIcon(book.kind)}
              name={book.name}
              selected={value === book.id}
              onPick={() => pick(book.id)}
            />
          </li>
        ))}
      </ul>

      {ended.length > 0 ? (
        <>
          <p className="book-picker__label">완료한 가계부</p>
          <ul className="book-picker__list">
            {ended.map((book) => (
              <li key={book.id}>
                <PickRow
                  icon={bookKindIcon(book.kind)}
                  name={book.name}
                  selected={value === book.id}
                  onPick={() => pick(book.id)}
                  muted
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </BottomSheet>
  );
}

function PickRow({
  icon,
  name,
  selected,
  muted = false,
  onPick,
}: {
  icon: IconName;
  name: string;
  selected: boolean;
  muted?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className="book-picker__row"
      aria-pressed={selected}
      data-muted={muted || undefined}
      onClick={onPick}
    >
      <CategoryAvatar icon={icon} size={40} />
      <span className="book-picker__name">{name}</span>
      <span className="book-picker__check" aria-hidden="true">
        {selected ? '✓' : ''}
      </span>
    </button>
  );
}
