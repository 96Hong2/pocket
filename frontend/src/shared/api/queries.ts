/**
 * 조회 훅.
 *
 * 이 훅들이 `shared` 에 있는 이유는 무효화 대상이 feature 경계를 넘기 때문이다.
 * 예산 상태는 홈·기록·예산 설정 세 곳이 같이 보고, 거래를 저장하면 셋이 한꺼번에 낡는다.
 * 키와 훅을 feature 마다 만들면 어느 한 곳이 반드시 빠진다. 한 자리에 둔다.
 *
 * **지금 화면이 실제로 쓰는 조회만 있다.** 나머지는 그 화면을 만들 때 여기에 더한다.
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { MonthParams, TransactionListParams } from './client';
import { useApiClient, useApiReady } from './context';
import { queryKeys } from './queryKeys';

/** 카테고리 목록. 기본 11개 + 내가 만든 것. */
export function useCategories() {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.categories(),
    queryFn: ({ signal }) => client.listCategories({ signal }),
    enabled: isReady,
    // 거래를 저장해도 달라지지 않는다. 앱을 여는 동안 한 번이면 된다.
    staleTime: 30 * 60_000,
  });
}

/**
 * 예산 상태와 이번 달 사실.
 *
 * 홈이 첫 화면을 고르는 근거(`has_any_transaction`)까지 여기서 온다.
 * 예산을 정하지 않은 것은 정상이고 그때 `budget.amount` 가 null 이다. 오류가 아니다.
 */
export function useBudget(params?: MonthParams) {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.budget(params),
    queryFn: ({ signal }) => client.getBudget(params, { signal }),
    enabled: isReady,
  });
}

/**
 * 그 달의 거래 목록. 최근 것이 앞에 온다.
 *
 * 홈은 이 목록에서 오늘 것만 골라 그린다. 서버에 '오늘' 조회가 따로 없고,
 * 달 단위로 한 번 받아 두면 저장·되돌리기 뒤 무효화 대상이 하나로 끝난다.
 */
export function useTransactions(params?: TransactionListParams) {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.transactions(params),
    queryFn: ({ signal }) => client.listTransactions(params, { signal }),
    enabled: isReady,
  });
}

/** 그 달의 지출·수입·차액과 예산 상태. 내역 화면이 쓸 자리이고 지금은 홈이 부르지 않는다. */
export function useSummary(params?: MonthParams) {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.summary(params),
    queryFn: ({ signal }) => client.getSummary(params, { signal }),
    enabled: isReady,
  });
}

/**
 * 커서로 이어 받는 거래 목록.
 *
 * 달력 화면의 검색 결과와 전체 내역이 쓴다. 홈은 이걸 쓰지 않는다. 홈은 그 달을 한 번 받아
 * 오늘 것만 골라 그리므로 페이지를 넘길 이유가 없다.
 *
 * 커서는 queryKey 에 넣지 않는다. 페이지마다 키가 달라지면 이어 붙일 대상을 잃는다.
 */
export function useTransactionPages(params?: TransactionListParams) {
  const client = useApiClient();
  const isReady = useApiReady();

  return useInfiniteQuery({
    queryKey: queryKeys.transactions(params),
    queryFn: ({ pageParam, signal }) =>
      client.listTransactions({ ...params, cursor: pageParam ?? undefined }, { signal }),
    initialPageParam: null as string | null,
    // null 이면 더 없다는 뜻이다. 서버가 마지막 페이지에 커서를 주지 않는다.
    getNextPageParam: (last) => last.next_cursor ?? null,
    enabled: isReady,
  });
}

/** 달력 격자용 날짜별 합계. 기록이 있는 날만 온다. 빈 칸은 화면이 채운다. */
export function useCalendar(params?: MonthParams) {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.calendar(params),
    queryFn: ({ signal }) => client.getCalendar(params, { signal }),
    enabled: isReady,
  });
}
