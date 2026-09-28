import { useState } from 'react';
import { Link } from 'react-router';

import { bookSettingsPath } from '../../app/router/routes';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  ApiError,
  parseDecimalOr,
  useBook,
  useBookSettlement,
  useSettleDone,
  useSettleUndo,
  type BookOut,
  type SettlementOut,
  type SettlementPeriod,
} from '../../shared/api';
import { formatCurrency, formatDayLabel, toLedgerDate } from '../../shared/lib/format';
import { withJosa } from '../../shared/lib/josa';
import {
  Button,
  Card,
  ErrorState,
  LoadingState,
  MonthStepper,
  SageCard,
  StateView,
} from '../../shared/ui';
import { findMember, memberName, membersBucket } from '../books';

import { paidLabel, settleSummary, settledDetail, settledHeadline } from './settleText';

function thisMonth(): string {
  return toLedgerDate(new Date()).slice(0, 7);
}

/** `2026-09` → `{ year: 2026, month: 9 }` */
function monthParams(month: string): { year: number; month: number } {
  const [year, value] = month.split('-').map(Number);
  return { year, month: value };
}

/** 「9월」. 여행은 달이 아니라 여행 전체를 본다. 홈 정산 카드와 같은 이름을 쓴다. */
function periodName(book: BookOut, month: string): string {
  return book.kind === 'trip' ? '여행 전체' : `${Number(month.slice(5, 7))}월`;
}

/**
 * 정산. 우리 집 홈의 정산 카드에서 들어온다.
 *
 * 둘이면 한 문장(「준호가 은홍에게 12,500원 보내면 반반이에요」), 셋 이상이면 보낼 돈 목록이다.
 * 송금 버튼과 금액 복사는 없다. 「정산 끝냈어요」 는 묻지 않고 표시하고 「되돌리기」 로 무른다.
 * 멤버별 막대나 순위 색은 두지 않는다. 누가 더 썼나를 겨루는 화면이 아니다.
 */
export function BookSettle({ bookId }: { bookId: string | null }) {
  const book = useBook(bookId);

  if (bookId == null || (book.error instanceof ApiError && book.error.status === 404)) {
    return <StateView icon="59_people" title="열 수 없는 가계부예요" />;
  }
  if (book.isError && book.data == null) return <ErrorState onRetry={() => void book.refetch()} />;
  if (book.data == null) return <LoadingState variant="rows" rows={3} />;

  return <SettleBody book={book.data} />;
}

function SettleBody({ book }: { book: BookOut }) {
  const [month, setMonth] = useState(thisMonth);
  const period: SettlementPeriod = book.kind === 'trip' ? 'all' : monthParams(month);
  const settlement = useBookSettlement(book.id, period);
  const firstMonth = toLedgerDate(new Date(book.created_at)).slice(0, 7);

  return (
    <div className="book-settle">
      {/*
        나눈다는 한 줄은 서버가 방금 준 규칙이 나누는 규칙일 때만 둔다. 홈에 남은 옛 값만 보고
        그리면 아래의 「정산이 없어요」 와 한 화면에서 부딪친다.
      */}
      {settlement.data != null && settlement.data.rule !== 'none' ? (
        <p className="page__lead book-settle__lead">같이 쓴 돈을 낸 사람 기준으로 나눠요</p>
      ) : null}
      {/* 같이 모은 돈 가계부는 어느 달이든 정산이 없다. 달을 옮길 이유가 없다. */}
      {book.settle_rule === 'none' ? null : book.kind === 'trip' ? (
        <p className="book-settle__period">{periodName(book, month)}</p>
      ) : (
        <MonthStepper
          value={month}
          onChange={setMonth}
          minMonth={firstMonth}
          maxMonth={thisMonth()}
          jumpTo={thisMonth()}
        />
      )}

      {settlement.data != null ? (
        <SettleResult book={book} month={month} settlement={settlement.data} />
      ) : settlement.isError ? (
        <ErrorState onRetry={() => void settlement.refetch()} />
      ) : (
        <LoadingState variant="rows" rows={2} />
      )}
    </div>
  );
}

function SettleResult({
  book,
  month,
  settlement,
}: {
  book: BookOut;
  month: string;
  settlement: SettlementOut;
}) {
  const analytics = useAnalytics();
  const done = useSettleDone();
  const undo = useSettleUndo();
  const [failure, setFailure] = useState<string | null>(null);

  const nameOf = (memberId: string) => memberName(findMember(book, memberId));
  const summary = settleSummary(settlement, nameOf);
  const total = parseDecimalOr(settlement.total, 0);
  const when = periodName(book, month);
  const busy = done.isPending || undo.isPending;
  const logParams = { rule: settlement.rule, members: membersBucket(settlement.members.length) };

  if (summary.state === 'none') {
    return (
      <SageCard className="book-settle__card">
        <p className="book-settle__sentence">같이 모은 돈으로 쓰는 가계부라 정산이 없어요</p>
        <Link className="book-settle__link" to={bookSettingsPath(book.id)}>
          돈 나누기 바꾸기
        </Link>
      </SageCard>
    );
  }

  // 여행 가계부도 달을 보내야 한다(서버가 형식을 본다). 값은 보지 않고 기간 전체를 끝낸다.
  const params = monthParams(month);

  function markDone(): void {
    setFailure(null);
    done.mutate(
      { bookId: book.id, ...params },
      {
        onSuccess: () => {
          // 알림은 띄우지 않는다. 제목이 「9월 정산을 끝냈어요」 로 바뀌어 같은 말을 두 번 하게 된다.
          analytics.log(EVENTS.settleChanged, { action: 'done', ...logParams }, { kind: 'click' });
        },
        onError: (error) =>
          setFailure(error instanceof ApiError ? error.message : '지금은 끝내지 못했어요'),
      },
    );
  }

  function undoDone(): void {
    setFailure(null);
    undo.mutate(
      { bookId: book.id, period: book.kind === 'trip' ? 'all' : monthParams(month) },
      {
        onSuccess: () => {
          analytics.log(
            EVENTS.settleChanged,
            { action: 'undone', ...logParams },
            { kind: 'click' },
          );
        },
        onError: (error) =>
          setFailure(error instanceof ApiError ? error.message : '지금은 되돌리지 못했어요'),
      },
    );
  }

  const settled = settlement.done != null && !settlement.changed_after_done;
  const hasSomething =
    summary.state === 'pair' || summary.state === 'many' || summary.state === 'balanced';
  const doneBy =
    settlement.done == null
      ? null
      : memberName(findMember(book, settlement.done.done_by_member_id));
  const doneOn =
    settlement.done == null
      ? null
      : formatDayLabel(toLedgerDate(new Date(settlement.done.done_at)));

  return (
    <>
      <SageCard className="book-settle__card" role="group" aria-label="정산 결과">
        {settlement.changed_after_done ? (
          <p className="book-settle__caution" role="status">
            끝낸 뒤 바뀐 기록이 있어요
          </p>
        ) : null}
        {/*
          끝냈으면 제목이 「9월 정산을 끝냈어요」 다. 보내면 반반이라는 문장이 그대로 크게 남으면
          아직 할 일이 남은 것처럼 읽힌다. 계산한 금액은 흐린 줄로 남긴다.
        */}
        {settled ? (
          <>
            <p className="book-settle__sentence">{settledHeadline(when)}</p>
            {settledDetail(summary).map((line) => (
              <p key={line} className="book-settle__calc">
                {line}
              </p>
            ))}
          </>
        ) : null}
        {settled ? null : summary.state === 'pair' ? (
          <p className="book-settle__sentence">{summary.text}</p>
        ) : null}
        {!settled && summary.state === 'many' ? (
          <ul className="book-settle__transfers">
            {summary.lines.map((line) => (
              <li key={line} className="book-settle__sentence">
                {line}
              </li>
            ))}
          </ul>
        ) : null}
        {!settled && summary.state === 'balanced' ? (
          <p className="book-settle__sentence">딱 맞아요. 보낼 돈이 없어요</p>
        ) : null}
        {summary.state === 'alone' ? (
          <p className="book-settle__sentence">같이 쓴 사람이 없어 나눌 돈이 없어요</p>
        ) : null}
        <p className="book-settle__total">
          같이 쓴 돈 <span data-numeric>{formatCurrency(total)}</span>
        </p>
      </SageCard>

      {settlement.members.length > 0 ? (
        <Card padding="list" className="book-settle__members">
          <ul className="book-settle__rows">
            {settlement.members.map((member) => (
              <li key={member.member_id} className="book-settle__row">
                <span className="book-settle__who">{paidLabel(nameOf(member.member_id))}</span>
                <span className="book-settle__amount" data-numeric>
                  {formatCurrency(parseDecimalOr(member.paid, 0))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {failure != null ? (
        <p className="book-manage__notice" role="alert">
          {failure}
        </p>
      ) : null}

      {settled && doneOn != null ? (
        <div className="book-settle__done">
          <div className="book-settle__done-text">
            <p className="book-settle__done-line">
              {doneBy == null
                ? `${doneOn}에 끝냈어요`
                : `${withJosa(doneBy, '이/가')} ${doneOn}에 끝냈어요`}
            </p>
          </div>
          <Button variant="ghost" disabled={busy} onClick={undoDone}>
            되돌리기
          </Button>
        </div>
      ) : hasSomething && total > 0 ? (
        <Button fullWidth disabled={busy} onClick={markDone}>
          {settlement.changed_after_done ? '다시 끝내기' : '정산 끝냈어요'}
        </Button>
      ) : null}

      {hasSomething && total > 0 ? (
        <p className="book-settle__note">보낸 돈은 따로 적지 않아도 돼요</p>
      ) : null}
    </>
  );
}
