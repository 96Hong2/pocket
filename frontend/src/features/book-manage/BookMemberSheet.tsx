import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import {
  parseDecimalOr,
  useBookMemberEntries,
  type BookEntryOut,
  type BookMemberOut,
  type BookOut,
} from '../../shared/api';
import { formatDayLabel } from '../../shared/lib/format';
import { Amount, BottomSheet, Button, Card, ErrorState, LoadingState } from '../../shared/ui';
import { BookEntryEditSheet, BookEntryRow, memberName } from '../books';

export interface BookMemberSheetProps {
  book: BookOut;
  /** 내역을 볼 멤버. `null` 이면 닫혀 있다. */
  member: BookMemberOut | null;
  onClose: () => void;
  /** 관리자가 남을 열었을 때만 준다. 맨 아래 「내보내기」 가 서고, 누르면 확인 창이 뜬다. */
  onKick?: (member: BookMemberOut) => void;
}

/**
 * 멤버를 눌러 여는 그 사람의 지난 내역. 그 사람이 낸 지출과 넣은 입금이 최신순으로 선다.
 *
 * 맨 위 두 숫자는 전 기간 합이다. 누가 더 썼나를 겨루는 화면이 아니라 색이나 순위는 없다.
 * 줄을 누르면 홈과 같은 기록 고치기가 열린다. 관리자가 남을 열었으면 맨 아래에 「내보내기」 가 선다.
 */
export function BookMemberSheet({ book, member, onClose, onKick }: BookMemberSheetProps) {
  const [editing, setEditing] = useState<BookEntryOut | null>(null);
  useOverlayBackClose(member != null, onClose);

  return (
    <>
      <BottomSheet
        open={member != null}
        onClose={onClose}
        size="tall"
        title={member == null ? undefined : memberName(member)}
        className="book-member"
      >
        {member != null ? (
          <MemberHistory
            key={member.id}
            book={book}
            member={member}
            onPick={setEditing}
            onKick={onKick}
          />
        ) : null}
      </BottomSheet>
      <BookEntryEditSheet book={book} entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function MemberHistory({
  book,
  member,
  onPick,
  onKick,
}: {
  book: BookOut;
  member: BookMemberOut;
  onPick: (entry: BookEntryOut) => void;
  onKick?: (member: BookMemberOut) => void;
}) {
  const history = useBookMemberEntries(book.id, member.id);
  const pages = history.data?.pages;
  const first = pages?.[0];
  const items = pages?.flatMap((page) => page.items) ?? [];
  const deposited = parseDecimalOr(first?.deposited_total, 0);
  // 나중에 정산 가계부에 입금이 한 번도 없으면 「넣은 돈 0원」 은 할 말이 아니다.
  const showDeposited = book.settle_rule === 'none' || deposited > 0;

  return (
    <div className="book-member__body">
      {first != null ? (
        <div className="book-member__totals" role="group" aria-label="모두 더한 돈">
          {showDeposited ? (
            <p className="book-member__total">
              <span className="book-member__total-label">넣은 돈</span>
              <Amount value={deposited} size={18} weight={800} />
            </p>
          ) : null}
          <p className="book-member__total">
            <span className="book-member__total-label">낸 돈</span>
            <Amount value={parseDecimalOr(first.paid_total, 0)} size={18} weight={800} />
          </p>
        </div>
      ) : null}

      {pages == null ? (
        history.isError ? (
          <ErrorState
            size="inline"
            title="내역을 불러오지 못했어요"
            onRetry={() => void history.refetch()}
          />
        ) : (
          <LoadingState variant="rows" rows={3} label="내역을 불러오는 중이에요" />
        )
      ) : items.length === 0 ? (
        <p className="book-member__empty">아직 적은 기록이 없어요</p>
      ) : (
        <div className="book-member__days">
          {byDay(items).map(([day, entries]) => (
            <section key={day} className="book-member__day" aria-label={formatDayLabel(day)}>
              <h3 className="book-member__day-title">{formatDayLabel(day)}</h3>
              <Card padding="list">
                {entries.map((entry, index) => (
                  <BookEntryRow
                    key={entry.id}
                    book={book}
                    entry={entry}
                    last={index === entries.length - 1}
                    showDay={false}
                    onPick={() => onPick(entry)}
                  />
                ))}
              </Card>
            </section>
          ))}
          {history.hasNextPage ? (
            <button
              type="button"
              className="book-home__more"
              disabled={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
            >
              더 보기
            </button>
          ) : null}
        </div>
      )}

      {onKick != null ? (
        <Button
          variant="outline"
          fullWidth
          className="book-member__kick"
          onClick={() => onKick(member)}
        >
          내보내기
        </Button>
      ) : null}
    </div>
  );
}

/** 최신순 줄을 날짜끼리 묶는다. 서버가 하루치를 쪼개 보내지 않아 같은 날이 두 번 서지 않는다. */
function byDay(items: readonly BookEntryOut[]): [string, BookEntryOut[]][] {
  const groups: [string, BookEntryOut[]][] = [];
  for (const entry of items) {
    const last = groups.at(-1);
    if (last != null && last[0] === entry.occurred_on) last[1].push(entry);
    else groups.push([entry.occurred_on, [entry]]);
  }
  return groups;
}
