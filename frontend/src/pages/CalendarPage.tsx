import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { IdentityNotice } from '../app/IdentityNotice';
import { EVENTS, useAnalytics } from '../shared/analytics';
import { QuickRecordSheet } from '../features/quick-record';
import {
  CalendarGrid,
  EditSheet,
  LEDGER_PAGE_SIZE,
  MonthTotals,
  MonthTotalsSkeleton,
  SearchBox,
  TransactionPages,
} from '../features/transactions';
import {
  parseDecimalOr,
  useCalendar,
  useCategories,
  useSummary,
  useTransactionPages,
  type TransactionOut,
} from '../shared/api';
import { NoSpendRow, splitNoSpend } from '../shared/ledger';
import {
  formatCurrency,
  formatDayLabel,
  formatRelativeDay,
  formatWeekday,
  shiftMonth,
  toLedgerDate,
} from '../shared/lib/format';
import { useDebounced } from '../shared/lib/useDebounced';
import { TEST_IDS } from '../shared/testIds';
import { Button, Card, EmptyState, ErrorState, MonthStepper } from '../shared/ui';

/**
 * 월간 달력. 기록한 것을 다시 보고, 그 날에 바로 적는 화면이다.
 *
 * 한 화면이 달력·선택한 날 목록·검색을 다 가진다. 시안이 그렇게 그려져 있고,
 * 달을 옮기는 자리가 하나여야 어느 달을 보고 있는지 헷갈리지 않는다.
 *
 * **고른 날에 적고·고치고·지우는 일이 여기서 다 끝난다.** 지난 날 하나를 빠뜨린 것을
 * 여기서 발견하는데, 적으려고 홈으로 돌아가면 그 날이 아니라 오늘에 적힌다.
 *
 * **검색 칸은 달력 아래다.** 위에 두면 이 화면에 들어온 사람이 달력보다 검색을 먼저 본다.
 * 이 화면에 오는 이유는 달력을 보려는 것이고, 검색은 그러다 찾을 것이 생겼을 때 쓴다.
 *
 * 검색 중에도 **달력은 그대로 둔다.** 감추면 아래 있던 검색 칸이 위로 뛰어올라, 글자를
 * 한 자 칠 때마다 화면이 움직인다. 대신 고른 날 목록 자리에 결과가 들어선다.
 * 달력의 날을 누르면 검색을 끝내고 그 날로 간다. 안 그러면 검색 중 달력이 안 눌리는
 * 죽은 자리가 된다.
 */

/** 입력할 때마다 서버를 부르지 않는다. 한 글자씩 요청하면 앞 요청이 뒤 요청을 덮는다. */
const SEARCH_DEBOUNCE_MS = 250;

/** `2026-08` 모양인지. 리포트가 붙여 준 값이라 아무 문자열이나 들어올 수 있다. */
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * 찾아본 것을 한 번만 센다.
 *
 * **한 글자 칠 때마다 세지 않는다.** 이미 늦춘 질의(`useDebounced`)가 바뀌고 그 결과까지
 * 온 뒤에 한 줄 남긴다. 그렇게 해야 「몇 번 찾았나」 가 「몇 자 쳤나」 가 되지 않는다.
 *
 * **검색어는 절대 안 싣는다.** 상호와 메모가 그대로 들어 있다. 길이와 결과 수까지다.
 * 찾은 것이 없는 검색(`hits: 0`)이 그중 제일 값어치 있다. 그 달의 목록이나 달력이
 * 제 일을 못 했다는 뜻이기 때문이다.
 */
function useSearchLog(query: string | null, hits: number | null): void {
  const analytics = useAnalytics();
  // 같은 질의의 결과가 여러 번 그려져도 한 번만 센다.
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (query == null || hits == null) {
      // 검색을 접으면 다음에 같은 말을 찾아도 새로 센다.
      if (query == null) sent.current = null;
      return;
    }
    if (sent.current === query) return;
    sent.current = query;
    analytics.log(EVENTS.searchUsed, { length: query.length, hits }, { kind: 'event' });
  }, [analytics, query, hits]);
}

export default function CalendarPage() {
  const today = toLedgerDate(new Date());
  const thisMonth = today.slice(0, 7);

  /*
    리포트의 달력 아이콘이 `?month=2026-08` 로 데려온다. 보던 달을 그대로 연다.
    한 번만 읽는다. 계속 보고 있으면 화살표로 달을 옮겨도 주소가 도로 끌고 온다.
    주소를 손으로 친 경우에도 어긋난 값이면 그냥 이번 달을 연다.
  */
  const [params] = useSearchParams();
  const [month, setMonth] = useState(() => {
    const asked = params.get('month');
    return asked != null && MONTH_PATTERN.test(asked) && asked <= thisMonth ? asked : thisMonth;
  });
  const [selected, setSelected] = useState(() => (month === thisMonth ? today : `${month}-01`));
  const [typed, setTyped] = useState('');
  const [editing, setEditing] = useState<TransactionOut | null>(null);
  // 고른 날에 적는 시트. 이름에 날이 붙은 버튼만 그 날에 적는 규칙을 여기서도 지킨다.
  const [recording, setRecording] = useState(false);

  const query = useDebounced(typed, SEARCH_DEBOUNCE_MS).trim();
  const searching = query.length > 0;

  const monthParams = useMemo(() => {
    const [year, monthNumber] = month.split('-').map(Number);
    return { year, month: monthNumber };
  }, [month]);

  const summary = useSummary(monthParams);
  const calendar = useCalendar(monthParams);
  const categories = useCategories();
  const pages = useTransactionPages({
    ...monthParams,
    limit: LEDGER_PAGE_SIZE,
    ...(searching ? { q: query } : { day: selected }),
  });

  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  useSearchLog(searching ? query : null, pages.isSuccess ? items.length : null);
  // 안 쓴 날 표시는 금액이 0 이라 거래 한 줄로 그릴 수 없다. 홈과 같은 함수로 가른다.
  const { noSpend, spent } = splitNoSpend(items);
  const categoryItems = categories.data?.items ?? [];
  const dayNumbers = calendar.data?.days.find((day) => day.day === selected);

  function moveMonth(next: string): void {
    setMonth(next);
    // 다른 달로 가면 고른 날이 그 달 밖에 남는다. 이번 달이면 오늘, 아니면 1일로 옮긴다.
    setSelected(next === thisMonth ? today : `${next}-01`);
  }

  return (
    <div className="page tx">
      <h1 className="page__title">월간 달력</h1>
      <p className="page__lead">날짜별로 얼마 썼는지 한눈에 봐요</p>

      <IdentityNotice />

      <MonthStepper
        value={month}
        onChange={moveMonth}
        maxMonth={thisMonth}
        minMonth={shiftMonth(thisMonth, -36)}
      />

      {summary.isError ? (
        <Card padding="md">
          <ErrorState
            size="inline"
            title="이번 달 합계를 불러오지 못했어요"
            onRetry={() => void summary.refetch()}
          />
        </Card>
      ) : summary.data == null ? (
        // 달을 옮기는 동안이다. 합계 띠와 같은 높이라 아래가 안 움직인다.
        <MonthTotalsSkeleton />
      ) : (
        <MonthTotals summary={summary.data} />
      )}

      {calendar.isError ? (
        <Card padding="md">
          <ErrorState
            size="inline"
            title="달력을 불러오지 못했어요"
            onRetry={() => void calendar.refetch()}
          />
        </Card>
      ) : (
        <CalendarGrid
          month={month}
          days={calendar.data?.days ?? []}
          selected={selected}
          today={today}
          onSelect={(day) => {
            setSelected(day);
            // 검색 중이었다면 여기서 끝난다. 고른 날을 보여 주려고 누른 것이다.
            setTyped('');
          }}
        />
      )}

      <SearchBox value={typed} onChange={setTyped} />

      {searching ? (
        <section className="tx-list" aria-label="검색 결과">
          <p className="tx-list__head">
            검색 결과{' '}
            {pages.isPending ? '' : `${spent.length}${pages.hasNextPage ? '건 이상' : '건'}`}
          </p>
          <TransactionPages
            items={spent}
            categories={categoryItems}
            isPending={pages.isPending}
            isError={pages.isError}
            onRetry={() => void pages.refetch()}
            hasMore={pages.hasNextPage}
            isLoadingMore={pages.isFetchingNextPage}
            onMore={() => void pages.fetchNextPage()}
            onPick={setEditing}
            empty={
              <Card padding="md">
                <EmptyState
                  size="inline"
                  icon="23_document"
                  title="맞는 내역이 없어요"
                  description="다른 말로 찾아볼까요?"
                />
              </Card>
            }
          />
        </section>
      ) : (
        <section className="tx-list" aria-label="고른 날 기록">
          <p className="tx-list__head">
            <span>
              {formatDayLabel(selected)} {formatWeekday(selected)}요일
            </span>
            <span className="tx-list__total" data-testid={TEST_IDS.dayTotal}>
              {formatCurrency(parseDecimalOr(dayNumbers?.expense, 0))}
            </span>
          </p>
          <TransactionPages
            items={spent}
            categories={categoryItems}
            isPending={pages.isPending}
            isError={pages.isError}
            onRetry={() => void pages.refetch()}
            hasMore={pages.hasNextPage}
            isLoadingMore={pages.isFetchingNextPage}
            onMore={() => void pages.fetchNextPage()}
            onPick={setEditing}
            empty={
              // 안 썼다고 적어 둔 날은 빈 날이 아니다. 아래 줄이 그 자리를 채운다.
              noSpend.length > 0 ? null : (
                <Card padding="list">
                  <p className="tx-list__empty" role="status">
                    이 날은 기록이 없어요. 없는 날도 괜찮아요.
                  </p>
                </Card>
              )
            }
          />
          {/* 읽기 전용이다. 되돌리는 길은 오늘을 보는 홈에만 둔다. */}
          {noSpend.length > 0 ? (
            <Card padding="list">
              <NoSpendRow />
            </Card>
          ) : null}

          {/*
              **버튼 이름에 그 날을 적는다.** 「기록하기」 라고만 쓰면 오늘에 적히는 홈의
              버튼과 구분이 안 되고, 실제로 그렇게 오늘에 적힌 적이 있다.
              앞날은 아직 쓰지 않은 돈이라 적을 자리를 열지 않는다.
            */}
          {selected <= today ? (
            <Button
              className="tx-list__record"
              variant="outline"
              fullWidth
              onClick={() => setRecording(true)}
            >
              {formatRelativeDay(selected)} 기록하기
            </Button>
          ) : null}
        </section>
      )}

      <EditSheet
        transaction={editing}
        categories={categoryItems}
        month={monthParams}
        onClose={() => setEditing(null)}
      />

      <QuickRecordSheet
        open={recording}
        day={selected}
        from="calendar_day"
        onClose={() => setRecording(false)}
        /*
          시트 안에서 날짜를 바꿔 적었으면 달력도 그 날로 간다. 고른 날과 적힌 날이
          어긋난 채로 남으면, 적은 것이 목록에 없어 안 들어간 줄 안다.
        */
        onRecorded={(recordedDay) => {
          setSelected(recordedDay);
          setMonth(recordedDay.slice(0, 7));
        }}
      />
    </div>
  );
}
