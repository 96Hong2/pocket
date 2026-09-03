import { useEffect, useMemo, useState } from 'react';

import { IdentityNotice } from '../app/IdentityNotice';
import {
  CalendarGrid,
  EditSheet,
  LEDGER_PAGE_SIZE,
  MonthTotals,
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
import {
  formatCurrency,
  formatDayLabel,
  formatWeekday,
  shiftMonth,
  toLedgerDate,
} from '../shared/lib/format';
import { TEST_IDS } from '../shared/testIds';
import { Card, EmptyState, ErrorState, LoadingState, MonthStepper } from '../shared/ui';

/**
 * 월간 달력. 기록한 것을 다시 보는 화면이다.
 *
 * 한 화면이 달력·선택한 날 목록·검색을 다 가진다. 시안이 그렇게 그려져 있고,
 * 달을 옮기는 자리가 하나여야 어느 달을 보고 있는지 헷갈리지 않는다.
 *
 * 검색 중에는 달력과 선택한 날 목록을 감춘다. 결과가 달력 아래에 따로 붙으면
 * 지금 보는 것이 무엇인지 읽히지 않는다.
 */

/** 입력할 때마다 서버를 부르지 않는다. 한 글자씩 요청하면 앞 요청이 뒤 요청을 덮는다. */
const SEARCH_DEBOUNCE_MS = 250;

function useDebounced(value: string, delay: number): string {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return settled;
}

export default function CalendarPage() {
  const today = toLedgerDate(new Date());
  const thisMonth = today.slice(0, 7);

  const [month, setMonth] = useState(thisMonth);
  const [selected, setSelected] = useState(today);
  const [typed, setTyped] = useState('');
  const [editing, setEditing] = useState<TransactionOut | null>(null);

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
        // 달을 옮기는 동안이다. 오류 카드로 묶으면 정상 로딩이 실패로 보인다.
        <Card padding="md">
          <LoadingState variant="rows" rows={1} label="이번 달 합계를 불러오는 중이에요" />
        </Card>
      ) : (
        <MonthTotals summary={summary.data} />
      )}

      <SearchBox value={typed} onChange={setTyped} />

      {searching ? (
        <section className="tx-list" aria-label="검색 결과">
          <p className="tx-list__head">
            검색 결과 {pages.isPending ? '' : `${items.length}${pages.hasNextPage ? '건 이상' : '건'}`}
          </p>
          <TransactionPages
            items={items}
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
        <>
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
              onSelect={setSelected}
            />
          )}

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
              items={items}
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
                    icon="27_clock"
                    title="이 날은 기록이 없어요"
                    description="없는 날도 괜찮아요."
                  />
                </Card>
              }
            />
          </section>
        </>
      )}

      <EditSheet
        transaction={editing}
        categories={categoryItems}
        month={monthParams}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
