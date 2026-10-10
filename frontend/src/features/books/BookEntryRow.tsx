import { parseDecimalOr, type BookEntryOut, type BookOut } from '../../shared/api';
import { formatDayLabel } from '../../shared/lib/format';
import { Chip, TransactionRow, iconOf } from '../../shared/ui';

import {
  DEPOSIT_AVATAR,
  entryCategory,
  entryTitle,
  isDeposit,
  payerName,
  writerName,
} from './bookEntryText';

export interface BookEntryRowProps {
  book: BookOut;
  entry: BookEntryOut;
  /** 목록 마지막 줄. 구분선을 지운다. */
  last: boolean;
  onPick: () => void;
  /** 날짜 머리로 묶은 목록(멤버 내역)에서는 줄마다 날짜를 다시 적지 않는다. */
  showDay?: boolean;
}

/**
 * 공유 기록 한 줄. 홈의 「최근 같이 쓴 돈」 과 멤버 내역이 같은 줄을 쓴다.
 *
 * 지출은 분류 그림과 적은 사람 칩, 입금은 저금통 그림과 「<이름> 넣음」 칩이다. 입금 금액은 개인
 * 가계부의 수입과 같은 색과 `+` 로 적는다. 새 색을 만들지 않는다.
 */
export function BookEntryRow({ book, entry, last, onPick, showDay = true }: BookEntryRowProps) {
  const deposit = isDeposit(entry);
  return (
    <TransactionRow
      {...(deposit ? DEPOSIT_AVATAR : iconOf(entryCategory(book, entry)))}
      className="book-entry"
      title={entryTitle(book, entry)}
      amount={parseDecimalOr(entry.amount, 0)}
      tone={deposit ? 'income' : 'expense'}
      avatarSize={48}
      density="compact"
      hideDivider={last}
      chips={
        <>
          {showDay ? (
            <span className="book-entry__day">{formatDayLabel(entry.occurred_on)}</span>
          ) : null}
          <Chip variant="kind">
            {deposit ? `${payerName(book, entry)} 넣음` : writerName(book, entry)}
          </Chip>
          {entry.updated_by_member_id != null ? <Chip variant="kind">고침</Chip> : null}
        </>
      }
      onClick={onPick}
    />
  );
}
