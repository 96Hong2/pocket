import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { useBridge, useToast } from '../../app/providers';
import { bookSettingsPath, bookSettlePath } from '../../app/router/routes';
import {
  parseDecimal,
  parseDecimalOr,
  useBook,
  useBookEntries,
  useBookReport,
  useBookSettlement,
  type BookEntryOut,
  type BookOut,
  type SettlementOut,
} from '../../shared/api';
import { readBookInviteSent } from '../../shared/lib/bookInviteSent';
import { markBookIntroSeen, readBookIntroSeen } from '../../shared/lib/bookIntroSeen';
import { formatCurrency, formatDayLabel, toLedgerDate } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import {
  Amount,
  Button,
  Card,
  Chip,
  ErrorState,
  LoadingState,
  SageCard,
  TransactionRow,
  iconOf,
  iconUrl,
} from '../../shared/ui';

import { AdSlot } from '../ads';

import { BookBudgetSheet } from './BookBudgetSheet';
import { BookChip } from './BookChip';
import { BookEntryEditSheet } from './BookEntryEditSheet';
import { entryCategory, entryTitle, settleLine, settleTitle, writerName } from './bookEntryText';
import { MY_BOOK_NAME, noticeText } from './bookText';
import { useBookInvite } from './useBookInvite';
import { useBookLive } from './useBookLive';
import { useBookNotices } from './useBookNotices';

export interface BookHomeProps {
  bookId: string;
  /** 내가 멤버인 가계부 전부. 맨 위 칩이 고르기 창에 쓴다. */
  books: readonly BookOut[];
  onChangeBook: (bookId: string | null) => void;
  /** 「기록하기」. 기록 시트는 홈이 들고 있다. 이 가계부가 「적을 곳」 에 골라져 열린다. */
  onRecord: () => void;
}

/** 「최근 같이 쓴 돈」 이 먼저 보여 주는 줄 수. 아래 정산 카드가 내리지 않고 보이게 한다. */
const RECENT_LIMIT = 5;

/**
 * 공유 가계부를 볼 때의 홈.
 *
 * 순서는 남은 예산(없으면 쓴 돈) → 기록하기 → 최근 같이 쓴 돈 → 정산이다. 멤버별 합계나
 * 누가 더 썼나는 어디에도 없다. 설정은 오른쪽 위 멤버 얼굴 뒤에 있다.
 *
 * 이 화면이 떠 있는 동안만 자주 다시 읽는다(`useBookLive`). 같이 쓰는 사람이 방금 적은 것이
 * 새로 고침 없이 들어와야 「같이 쓴다」 가 된다.
 */
export function BookHome({ bookId, books, onChangeBook, onRecord }: BookHomeProps) {
  const listed = books.find((book) => book.id === bookId);
  const live = useBookLive(listed?.ended !== true);
  const query = useBook(bookId, live);
  const book = query.data ?? listed;

  if (book == null) {
    return query.isError ? (
      <ErrorState onRetry={() => void query.refetch()} />
    ) : (
      <LoadingState label="가계부를 불러오는 중이에요" />
    );
  }

  return <BookHomeBody book={book} books={books} onChangeBook={onChangeBook} onRecord={onRecord} />;
}

function BookHomeBody({
  book,
  books,
  onChangeBook,
  onRecord,
}: {
  book: BookOut;
  books: readonly BookOut[];
  onChangeBook: (bookId: string | null) => void;
  onRecord: () => void;
}) {
  const live = useBookLive(!book.ended);
  const entries = useBookEntries(book.id, undefined, live);
  const report = useBookReport(book.id, undefined, live);
  const settles = book.settle_rule === 'even';
  const trip = book.kind === 'trip';
  // 여행 가계부는 맨 위 숫자도 여행 전체라 나누지 않아도 정산 합계를 읽는다.
  const settlement = useBookSettlement(book.id, trip ? 'all' : undefined, {
    ...live,
    enabled: settles || trip,
  });
  const notices = useBookNotices(book);
  const [editing, setEditing] = useState<BookEntryOut | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const items = entries.data?.items;
  const shownItems = items == null || showAll ? items : items.slice(0, RECENT_LIMIT);
  // 쓴 돈이 0원인 달에는 정산 카드를 세우지 않는다. 빈 달에 「딱 맞아요」 는 할 말이 아니다.
  const settleShown =
    settles &&
    settlement.data != null &&
    settlement.data.members.length >= 2 &&
    parseDecimalOr(settlement.data.total, 0) > 0;

  return (
    <>
      <div className="book-home__top">
        <BookChip value={book.id} books={books} onChange={onChangeBook} />
        <MemberFaces book={book} />
      </div>

      {notices.length > 0 ? (
        <div className="book-home__notices" role="status">
          {notices.map((notice) => (
            <p
              key={notice.kind === 'joined' ? notice.memberId : 'ended'}
              className="book-home__notice"
            >
              {noticeText(notice)}
            </p>
          ))}
        </div>
      ) : null}

      <BookHero
        book={book}
        report={report}
        tripSettlement={trip ? settlement : null}
        onSetBudget={() => setBudgetOpen(true)}
      />

      <IntroCard book={book} />

      {book.active_member_count === 1 && !book.ended ? <AloneCard book={book} /> : null}

      {book.ended ? (
        <p className="book-home__ended">끝난 가계부예요</p>
      ) : (
        <Button
          className="home-cta"
          fullWidth
          onClick={onRecord}
          leadingIcon={
            <img className="home-cta__icon" src={iconUrl('01_coins')} alt="" aria-hidden="true" />
          }
        >
          기록하기
        </Button>
      )}

      <section className="book-home__recent" aria-label="최근 같이 쓴 돈">
        <h2 className="book-home__title">최근 같이 쓴 돈</h2>
        {items != null && shownItems != null ? (
          items.length > 0 ? (
            <>
              <Card padding="list">
                {shownItems.map((entry, index) => (
                  <EntryRow
                    key={entry.id}
                    book={book}
                    entry={entry}
                    last={index === shownItems.length - 1}
                    onPick={() => setEditing(entry)}
                  />
                ))}
              </Card>
              {/*
                다섯 줄만 먼저 보인다. 아래 정산 카드가 한 번에 보이게 한다.
                더 보려면 같은 자리에서 펼친다. 새 화면으로 가지 않는다.
              */}
              {shownItems.length < items.length ? (
                <button type="button" className="book-home__more" onClick={() => setShowAll(true)}>
                  이번 달 {items.length}건 모두 보기
                </button>
              ) : null}
            </>
          ) : (
            <Card padding="md">
              <p className="book-home__empty">아직 같이 쓴 돈이 없어요</p>
            </Card>
          )
        ) : entries.isError ? (
          <Card padding="md">
            <ErrorState
              size="inline"
              title="같이 쓴 돈을 불러오지 못했어요"
              onRetry={() => void entries.refetch()}
            />
          </Card>
        ) : (
          <Card padding="md">
            <LoadingState variant="rows" rows={2} label="같이 쓴 돈을 불러오는 중이에요" />
          </Card>
        )}
      </section>

      {settleShown && settlement.data != null ? (
        <Link className="book-settle-card" to={bookSettlePath(book.id)}>
          <span className="book-settle-card__text">
            <span className="book-settle-card__title">{settleTitle(settlement.data)}</span>
            <span className="book-settle-card__line">{settleLine(book, settlement.data)}</span>
          </span>
          <span className="book-settle-card__chevron" aria-hidden="true">
            ›
          </span>
        </Link>
      ) : null}

      <AdSlot placement="book_home" />

      <BookEntryEditSheet book={book} entry={editing} onClose={() => setEditing(null)} />
      <BookBudgetSheet open={budgetOpen} book={book} onClose={() => setBudgetOpen(false)} />
    </>
  );
}

/** 오른쪽 위 멤버 얼굴. 넷까지 첫 글자로 그리고 나머지는 「+N」. 누르면 가계부 설정이다. */
function MemberFaces({ book }: { book: BookOut }) {
  const active = book.members.filter((member) => !member.left);
  const shown = active.slice(0, 4);
  const extra = active.length - shown.length;

  return (
    <Link
      className="book-faces"
      to={bookSettingsPath(book.id, 'home')}
      aria-label={`가계부 설정, 멤버 ${active.length}명`}
    >
      {shown.map((member) => (
        <span key={member.id} className="book-faces__face" data-me={member.is_me || undefined}>
          {Array.from(member.name ?? '?')[0]}
        </span>
      ))}
      {extra > 0 ? <span className="book-faces__more">+{extra}</span> : null}
    </Link>
  );
}

/**
 * 맨 위 숫자. 예산이 있으면 남은 예산, 없으면 그 달 쓴 돈이다.
 *
 * 가계부 이름은 바로 위 칩이 이미 말한다. 여기서 다시 적지 않는다.
 */
function BookHero({
  book,
  report,
  tripSettlement,
  onSetBudget,
}: {
  book: BookOut;
  report: ReturnType<typeof useBookReport>;
  /** 여행 가계부면 여행 전체 정산. 맨 위 숫자가 달이 아니라 이걸 쓴다. 아니면 null. */
  tripSettlement: ReturnType<typeof useBookSettlement> | null;
  onSetBudget: () => void;
}) {
  if (tripSettlement != null) {
    return <TripHero book={book} settlement={tripSettlement} onSetBudget={onSetBudget} />;
  }

  const data = report.data;
  const periodStart = data?.period_start ?? toLedgerDate(new Date());
  const month = `${Number(periodStart.slice(5, 7))}월`;
  const label = `${month} ${book.name}`;

  if (data == null) {
    return (
      <section className="book-hero" aria-label={label}>
        {report.isError ? (
          <ErrorState
            size="inline"
            title="이번 달 돈을 불러오지 못했어요"
            onRetry={() => void report.refetch()}
          />
        ) : (
          <LoadingState size="inline" label="이번 달 돈을 불러오는 중이에요" />
        )}
      </section>
    );
  }

  const budget = parseDecimal(data.budget);
  const remaining = parseDecimal(data.remaining);
  const spent = parseDecimalOr(data.spent, 0);

  return (
    <section className="book-hero" aria-label={label}>
      {budget != null && remaining != null ? (
        <>
          <p className="book-hero__big">
            <span className="book-hero__what">남은 예산</span>
            <Amount
              data-testid={TEST_IDS.bookHeroAmount}
              className="book-hero__value"
              value={remaining}
              size={32}
              weight={800}
            />
          </p>
          <p className="book-hero__sub" data-numeric="">
            {month} 예산 {formatCurrency(budget)} 중 {formatCurrency(spent)} 썼어요
          </p>
        </>
      ) : (
        <>
          <p className="book-hero__big">
            <span className="book-hero__what">{month}에 쓴 돈</span>
            <Amount
              data-testid={TEST_IDS.bookHeroAmount}
              className="book-hero__value"
              value={spent}
              size={32}
              weight={800}
            />
          </p>
          {/* 이번 달 첫 기록 뒤에 권한다. 빈 가계부에서 예산부터 묻지 않는다. 설정에서는 늘 정할 수 있다. */}
          {data.entry_count > 0 ? (
            <button type="button" className="book-hero__budget" onClick={onSetBudget}>
              예산 정하기
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * 여행 가계부의 맨 위 숫자. 여행은 달로 끊지 않고 여행 전체로 정산하므로 여기도 여행 전체다.
 *
 * 숫자는 정산 화면의 여행 전체 합계(`settlement('all').total`)와 같은 값을 쓴다. 저장 뒤 화면의
 * 「이번 여행에 같이 쓴 돈」 도 서버가 같은 규칙(지우지 않은 기록 전부)으로 센다.
 */
function TripHero({
  book,
  settlement,
  onSetBudget,
}: {
  book: BookOut;
  settlement: ReturnType<typeof useBookSettlement>;
  onSetBudget: () => void;
}) {
  const data: SettlementOut | undefined = settlement.data;
  const label = book.name;

  if (data == null) {
    return (
      <section className="book-hero" aria-label={label}>
        {settlement.isError ? (
          <ErrorState
            size="inline"
            title="여행에 쓴 돈을 불러오지 못했어요"
            onRetry={() => void settlement.refetch()}
          />
        ) : (
          <LoadingState size="inline" label="여행에 쓴 돈을 불러오는 중이에요" />
        )}
      </section>
    );
  }

  const total = parseDecimalOr(data.total, 0);
  const budget = parseDecimal(book.monthly_budget);

  return (
    <section className="book-hero" aria-label={label}>
      {budget != null ? (
        <>
          <p className="book-hero__big">
            <span className="book-hero__what">남은 예산</span>
            <Amount
              data-testid={TEST_IDS.bookHeroAmount}
              className="book-hero__value"
              value={budget - total}
              size={32}
              weight={800}
            />
          </p>
          <p className="book-hero__sub" data-numeric="">
            예산 {formatCurrency(budget)} 중 {formatCurrency(total)} 썼어요
          </p>
        </>
      ) : (
        <>
          <p className="book-hero__big">
            <span className="book-hero__what">여행에 같이 쓴 돈</span>
            <Amount
              data-testid={TEST_IDS.bookHeroAmount}
              className="book-hero__value"
              value={total}
              size={32}
              weight={800}
            />
          </p>
          {total > 0 ? (
            <button type="button" className="book-hero__budget" onClick={onSetBudget}>
              예산 정하기
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * 초대받아 들어온 사람에게 한 번. 기록할 때 어디에 적을지 고른다는 것 하나만 말한다.
 *
 * 만든 사람(관리자)에게는 안 띄운다. 만들면서 이미 고른 사람이다.
 */
function IntroCard({ book }: { book: BookOut }) {
  const bridge = useBridge();
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    let alive = true;
    void readBookIntroSeen(bridge.storage).then((value) => {
      if (alive) setSeen(value);
    });
    return () => {
      alive = false;
    };
  }, [bridge]);

  if (seen || book.my_role !== 'member') return null;

  return (
    <SageCard className="book-card" role="group" aria-label="같이 쓰는 법">
      <p className="book-card__text">
        기록할 때 「{MY_BOOK_NAME}」와 「{book.name}」 중 한 곳을 골라요
      </p>
      <Button
        variant="outline"
        onClick={() => {
          setSeen(true);
          void markBookIntroSeen(bridge.storage);
        }}
      >
        알겠어요
      </Button>
    </SageCard>
  );
}

/**
 * 아직 혼자인 가계부. 만들 때 공유창을 닫았어도 여기서 다시 보낸다.
 *
 * **이 기기에서 이미 보냈으면 「아직 혼자예요」 라고 하지 않는다.** 만들자마자 「초대장을 보냈어요」
 * 알림 바로 위에 「아직 혼자예요 [초대장 보내기]」 가 서서, 보냈는지 안 보냈는지 헷갈렸다.
 * 보냈으면 기다리면 된다고 말하고, 다시 보내기는 작은 글씨 버튼으로 둔다.
 */
function AloneCard({ book }: { book: BookOut }) {
  const bridge = useBridge();
  const invite = useBookInvite('home');
  const toast = useToast();
  const [sent, setSent] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void readBookInviteSent(bridge.storage, book.id).then((value) => {
      if (alive) setSent(value);
    });
    return () => {
      alive = false;
    };
  }, [bridge, book.id]);

  function send(): void {
    void invite.send(book).then((ok) => {
      if (!ok) return;
      setSent(true);
      toast.show({ text: '초대장을 보냈어요' });
    });
  }

  // 저장소를 읽는 동안은 비워 둔다. 「아직 혼자예요」 가 한 번 비쳤다가 바뀌지 않게.
  if (sent == null) return null;

  if (sent) {
    return (
      <SageCard className="book-card" role="group" aria-label="초대장을 보냈어요">
        <p className="book-card__text">초대장을 보냈어요. 들어오면 여기서 알려 드려요</p>
        <button type="button" className="book-card__resend" disabled={invite.busy} onClick={send}>
          다시 보내기
        </button>
        {invite.failure != null ? (
          <p className="book-card__notice" role="alert">
            {invite.failure}
          </p>
        ) : null}
      </SageCard>
    );
  }

  return (
    <SageCard className="book-card" role="group" aria-label="아직 혼자예요">
      <p className="book-card__text">아직 혼자예요</p>
      <Button variant="outline" disabled={invite.busy} onClick={send}>
        초대장 보내기
      </Button>
      {invite.failure != null ? (
        <p className="book-card__notice" role="alert">
          {invite.failure}
        </p>
      ) : null}
    </SageCard>
  );
}

function EntryRow({
  book,
  entry,
  last,
  onPick,
}: {
  book: BookOut;
  entry: BookEntryOut;
  last: boolean;
  onPick: () => void;
}) {
  // 둘째 줄은 날짜 글씨 뒤에 적은 사람 칩, 남이 고쳤으면 「고침」 칩이 한 줄로 선다.
  return (
    <TransactionRow
      {...iconOf(entryCategory(book, entry))}
      className="book-home__entry"
      title={entryTitle(book, entry)}
      amount={parseDecimalOr(entry.amount, 0)}
      tone="expense"
      avatarSize={48}
      density="compact"
      hideDivider={last}
      chips={
        <>
          <span className="book-home__entry-day">{formatDayLabel(entry.occurred_on)}</span>
          <Chip variant="kind">{writerName(book, entry)}</Chip>
          {entry.updated_by_member_id != null ? <Chip variant="kind">고침</Chip> : null}
        </>
      }
      onClick={onPick}
    />
  );
}
