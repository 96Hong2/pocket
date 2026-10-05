/**
 * 조회 훅.
 *
 * 이 훅들이 `shared` 에 있는 이유는 무효화 대상이 feature 경계를 넘기 때문이다.
 * 예산 상태는 홈·기록·예산 설정 세 곳이 같이 보고, 거래를 저장하면 셋이 한꺼번에 낡는다.
 * 키와 훅을 feature 마다 만들면 어느 한 곳이 반드시 빠진다. 한 자리에 둔다.
 *
 * **지금 화면이 실제로 쓰는 조회만 있다.** 나머지는 그 화면을 만들 때 여기에 더한다.
 */

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { markBookActivity } from './bookActivity';
import type {
  BudgetSuggestionParams,
  CategoryReportParams,
  MonthParams,
  SettlementPeriod,
  TransactionListParams,
} from './client';
import { useApiClient, useApiReady } from './context';
import { queryKeys } from './queryKeys';
import type { AnalysisScope, BookListOut, BookOut, TransactionOut } from './types';

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
 * 앱 설정.
 *
 * 지금 열려 있는 것은 예산 이어쓰기, 홈 표시 방식, 마지막에 쓴 기록 방식 셋이다.
 * 행이 없는 사용자에게는 서버가 기본값으로 만들어 주므로 '설정이 없는 상태' 를
 * 화면이 따로 다루지 않는다.
 */
export function usePreferences() {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.preferences(),
    queryFn: ({ signal }) => client.getPreferences({ signal }),
    enabled: isReady,
    // 오래 들고 있어도 되는 값이다. 앱이 도는 동안 달라지는 것은 설정을 직접 바꿀 때와
    // 기록을 저장할 때뿐이고, 둘 다 그 자리에서 캐시를 맞춰 둔다.
    staleTime: 30 * 60_000,
  });
}

/** 내 계정. 연결 전에는 email 이 null 이고 그것이 정상이다. */
export function useMe() {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: ({ signal }) => client.getMe({ signal }),
    enabled: isReady,
    staleTime: 30 * 60_000,
  });
}

/**
 * 기록 알림 설정.
 *
 * 알림 화면 하나만 쓴다. 켜기와 시각 둘뿐이고, 행이 없는 사용자에게는 서버가 꺼진
 * 기본값으로 만들어 주므로 '설정이 없는 상태' 를 화면이 따로 다루지 않는다.
 */
export function useNotificationSettings() {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.notificationSettings(),
    queryFn: ({ signal }) => client.getNotificationSettings({ signal }),
    enabled: isReady,
    staleTime: 30 * 60_000,
  });
}

/**
 * 예산 상태와 이번 달 사실.
 *
 * 홈이 첫 화면을 고르는 근거(`has_any_transaction`)까지 여기서 온다.
 * 예산을 정하지 않은 것은 정상이고 그때 `budget.amount` 가 null 이다. 오류가 아니다.
 */
export function useBudget(params?: MonthParams, options?: { enabled?: boolean }) {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.budget(params),
    queryFn: ({ signal }) => client.getBudget(params, { signal }),
    enabled: isReady && (options?.enabled ?? true),
  });
}

/**
 * 목표 기반 생활비 제안.
 *
 * 부르는 것만으로는 아무것도 저장되지 않는다. 저장은 사용자가 버튼을 눌러 예산을 정할 때다.
 *
 * 실수령·고정비를 화면에서 고치면 키가 바뀌어 서버에 다시 묻는다. 그 사이 카드가 통째로
 * 사라지지 않게 앞 응답을 자리에 남겨 둔다(`placeholderData`). 안 그러면 한 글자 고칠 때마다
 * 카드가 빈 자리로 깜빡이고, 고치던 입력칸이 포커스를 잃는다.
 */
export function useBudgetSuggestion(
  params?: BudgetSuggestionParams,
  options?: { enabled?: boolean },
) {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.budgetSuggestion(params),
    queryFn: ({ signal }) => client.getBudgetSuggestion(params, { signal }),
    // 계산기를 열기 전에는 묻지 않는다. 시트 하나 열 때마다 서버를 부를 이유가 없다.
    enabled: isReady && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
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
 * 월 리포트. 그 화면이 그리는 것을 한 응답으로 받는다.
 *
 * 총액을 `useSummary` 에서, 조각을 여기서 가져오면 둘 사이에 저장이 끼는 순간
 * 도넛과 헤드라인이 서로 다른 말을 한다. 리포트 화면은 이 훅 하나만 쓴다.
 */
/** 리포트 분류 줄 하나의 기록과 합계. */
export function useCategoryReport(params: CategoryReportParams) {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.categoryReport(params),
    queryFn: ({ signal }) => client.getCategoryReport(params, { signal }),
    enabled: isReady,
  });
}

/**
 * 기록 하나를 한 번 받아 온다. 리포트 큰 지출 줄을 눌러 고치기 시트를 열 때 쓴다.
 *
 * 화면이 계속 지켜보는 조회로 두지 않는다. 그러면 시트에서 지운 뒤 목록 무효화에 걸려
 * 같은 id 를 다시 묻고 404 를 받는다.
 */
export function useFetchTransaction(): (id: string) => Promise<TransactionOut> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useCallback(
    (id: string) =>
      queryClient.fetchQuery({
        queryKey: queryKeys.transaction(id),
        queryFn: ({ signal }) => client.getTransaction(id, { signal }),
        staleTime: 0,
      }),
    [client, queryClient],
  );
}

export function useMonthlyReport(params?: MonthParams) {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.report(params),
    queryFn: ({ signal }) => client.getMonthlyReport(params, { signal }),
    enabled: isReady,
  });
}

/**
 * 그 달의 결산.
 *
 * 부르는 것만으로는 아무것도 저장되지 않는다. 결산을 봤다는 표시는 기기에만 남는다.
 *
 * `enabled` 를 따로 받는다. 홈은 달이 바뀐 뒤 며칠 동안만 지난달 결산을 묻고, 이미 본
 * 달은 아예 묻지 않는다. 늘 물으면 홈을 열 때마다 안 쓸 응답을 하나 더 받는다.
 */
export function useClosing(params?: MonthParams, options?: { enabled?: boolean }) {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.closing(params),
    queryFn: ({ signal }) => client.getClosing(params, { signal }),
    enabled: isReady && (options?.enabled ?? true),
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

/**
 * 자산 목록과 순자산.
 *
 * 한 번도 안 적은 것은 정상이고 그때 `snapshot` 이 null 이다. 오류가 아니다.
 * 목록이 곧 저장할 것이라서 오래 붙들지 않는다. 낡은 목록에 새 줄을 얹어 보내면
 * 그 사이에 다른 데서 고친 줄이 사라진다.
 */
export function useAssets() {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.assets(),
    queryFn: ({ signal }) => client.getAssets({ signal }),
    enabled: isReady,
  });
}

/** 달마다 월말 순자산 점. 순자산 카드의 작은 추이와 상세 그래프가 쓴다. */
export function useAssetHistory(months?: number) {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.assetHistory(months),
    queryFn: ({ signal }) => client.getAssetHistory(months, { signal }),
    enabled: isReady,
  });
}

/**
 * 「내 자산 분석」. 광고 잠금은 화면이 `fingerprint` 로 건다.
 *
 * `enabled` 를 끄면 부르지 않는다. 잠긴 입구가 지문만 견줄 때도 같은 키를 쓴다.
 */
export function useAssetAnalysis(scope: AnalysisScope, options?: { enabled?: boolean }) {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.assetAnalysis(scope),
    queryFn: ({ signal }) => client.getAssetAnalysis(scope, { signal }),
    enabled: isReady && (options?.enabled ?? true),
  });
}

/**
 * 기억한 분류 규칙.
 *
 * 줄글로 저장할 때마다 늘어나므로 오래 붙들지 않는다. 카테고리 관리에서만 본다.
 */
export function useMerchantRules() {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.merchantRules(),
    queryFn: ({ signal }) => client.listMerchantRules({ signal }),
    enabled: isReady,
  });
}

/**
 * 진행 중인 목표 하나.
 *
 * 목표를 정하지 않은 것은 정상이고 그때 `goal` 이 null 이다. 오류가 아니다.
 * 홈 카드와 목표 화면이 같은 조회를 본다. 두 곳이 각자 부르면 기여를 더한 직후
 * 한쪽만 새 값이 되어, 홈 게이지와 목표 화면 게이지가 서로 다른 말을 한다.
 */
export function useGoal() {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.goal(),
    queryFn: ({ signal }) => client.getGoal({ signal }),
    enabled: isReady,
  });
}

/**
 * 다 모으고 마친 목표들.
 *
 * 접은 것(지운 것)은 오지 않는다. 비어 있는 것이 정상이고, 그때 화면은 이 자리를 아예
 * 그리지 않는다. 하나도 안 마친 사람에게 「지난 목표 없음」을 보여 줄 이유가 없다.
 */
export function useGoalHistory(options?: { enabled?: boolean }) {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.goalHistory(),
    queryFn: ({ signal }) => client.getGoalHistory({ signal }),
    enabled: isReady && (options?.enabled ?? true),
  });
}

/**
 * 태그 목록.
 *
 * 지출 태그와 수입 태그가 한 목록에 섞여 오고, 쓰는 자리가 `kind` 로 갈라 쓴다.
 * **하나도 없는 것이 정상이다.** 태그는 그 사람이 스스로 만드는 묶음이라,
 * 안 만든 사람에게는 화면이 태그 자리를 아예 그리지 않는다.
 */
export function useTags() {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.tags(),
    queryFn: ({ signal }) => client.listTags({ signal }),
    enabled: isReady,
    // 카테고리와 같다. 기록을 저장해도 목록 자체는 달라지지 않는다.
    staleTime: 30 * 60_000,
  });
}

/** 반복 지출 설정 목록. 관리 화면 하나만 읽는다. */
export function useRecurring() {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.recurring(),
    queryFn: ({ signal }) => client.listRecurring({ signal }),
    enabled: isReady,
  });
}

/**
 * 오늘 물어볼 반복 지출.
 *
 * **빈 목록이 정상이다.** 걸어 둔 것이 없거나 아직 그날이 아니면 아무것도 안 온다.
 * 홈이 이 조회로 카드를 그리므로, 실패하면 그 자리를 비우고 오류 카드를 만들지 않는다.
 */
export function useRecurringDue() {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.recurringDue(),
    queryFn: ({ signal }) => client.listRecurringDue({ signal }),
    enabled: isReady,
  });
}

// ── 공유 가계부 ──────────────────────────────────────

/**
 * 공유 가계부 조회에 얹는 선택.
 *
 * 다시 읽는 주기는 화면이 정한다(`features/books/useBookLive`). 우리 집 화면이 떠 있는 동안만
 * 짧게 읽고, 다른 화면은 전역 기본값을 따른다.
 */
export interface BookQueryOptions {
  enabled?: boolean;
  staleTime?: number;
  refetchOnWindowFocus?: boolean | 'always';
  refetchInterval?: number | false | (() => number | false);
  refetchIntervalInBackground?: boolean;
}

/**
 * 준 값만 옵션에 싣는다.
 *
 * `staleTime: undefined` 를 그대로 넘기면 전역 기본값(60초)을 덮어 0 이 된다. react-query 가
 * 기본값 위에 옵션을 펼쳐 얹기 때문이다. 그러면 공유 조회가 화면마다 매번 다시 나간다.
 */
function liveOptions(options?: BookQueryOptions) {
  const picked: Omit<BookQueryOptions, 'enabled'> = {};
  if (options?.staleTime !== undefined) picked.staleTime = options.staleTime;
  if (options?.refetchOnWindowFocus !== undefined) {
    picked.refetchOnWindowFocus = options.refetchOnWindowFocus;
  }
  if (options?.refetchInterval !== undefined) picked.refetchInterval = options.refetchInterval;
  if (options?.refetchIntervalInBackground !== undefined) {
    picked.refetchIntervalInBackground = options.refetchIntervalInBackground;
  }
  return picked;
}

function requireId(value: string | null): string {
  // enabled 가 막아 여기까지 안 온다. 오면 부르는 쪽이 enabled 를 잘못 건 것이다.
  if (value == null || value === '') throw new Error('가계부 id 없이 조회했어요.');
  return value;
}

/**
 * 이 서버가 공유 가계부를 여는가.
 *
 * 꺼진 서버에 묻지 않으려고 둔다. 내 계정 응답에 스위치가 함께 오고, 모르는 동안은 꺼진 것으로 본다.
 */
export function useSharedBooksEnabled(): boolean {
  const me = useMe();
  return me.data?.shared_books_enabled === true;
}

/**
 * 내가 지금 멤버인 가계부. 끝난 것도 온다.
 *
 * 스위치가 꺼져 있으면 묻지 않고 `data` 가 비어 있다. 부르는 쪽은 그때를 「가계부 없음」 으로 본다.
 * 앱으로 돌아올 때마다 다시 읽는다. 그 사이 내보내졌거나 가계부가 지워졌을 수 있다.
 */
export function useBooks() {
  const client = useApiClient();
  const isReady = useApiReady();
  const enabled = useSharedBooksEnabled();

  return useQuery({
    queryKey: queryKeys.books(),
    queryFn: ({ signal }) => client.listBooks({ signal }),
    enabled: isReady && enabled,
    refetchOnWindowFocus: 'always',
  });
}

/**
 * 가계부 하나. 멤버·분류·초대 링크까지 온다.
 *
 * 목록에 이미 있으면 그 값을 먼저 보여 주고 뒤에서 다시 받는다. 홈에서 가계부를 바꾸는 순간
 * 빈 화면이 한 번 깜빡이지 않게 한다.
 */
export function useBook(bookId: string | null, options?: BookQueryOptions) {
  const client = useApiClient();
  const isReady = useApiReady();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.book(bookId ?? ''),
    queryFn: ({ signal }): Promise<BookOut> => client.getBook(requireId(bookId), { signal }),
    enabled: isReady && bookId != null && (options?.enabled ?? true),
    placeholderData: () =>
      queryClient
        .getQueryData<BookListOut>(queryKeys.books())
        ?.items.find((book) => book.id === bookId),
    ...liveOptions(options),
  });
}

/**
 * 그 달 공유 기록.
 *
 * 다시 읽었더니 모르던 기록이 있으면 누군가 방금 적은 것이다. 그때부터 잠깐 더 자주 읽는다.
 * 달이나 가계부를 바꿔 받은 목록은 견주지 않는다. 그건 새로 들어온 것이 아니다.
 */
export function useBookEntries(
  bookId: string | null,
  month?: MonthParams,
  options?: BookQueryOptions,
) {
  const client = useApiClient();
  const isReady = useApiReady();
  const queryKey = queryKeys.bookEntries(bookId ?? '', month);

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => client.listBookEntries(requireId(bookId), month, { signal }),
    enabled: isReady && bookId != null && (options?.enabled ?? true),
    ...liveOptions(options),
  });

  const keyText = queryKey.join('|');
  const seen = useRef<{ key: string; ids: Set<string> } | null>(null);
  useEffect(() => {
    const items = query.data?.items;
    if (items == null) return;
    const ids = new Set(items.map((entry) => entry.id));
    const previous = seen.current;
    seen.current = { key: keyText, ids };
    if (previous == null || previous.key !== keyText) return;
    for (const id of ids) {
      if (!previous.ids.has(id)) {
        markBookActivity();
        return;
      }
    }
  }, [query.data, keyText]);

  return query;
}

/** 그 달 공유 리포트. 기본 리포트와 자세히 보기가 한 응답으로 온다. */
export function useBookReport(
  bookId: string | null,
  month?: MonthParams,
  options?: BookQueryOptions,
) {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.bookReport(bookId ?? '', month),
    queryFn: ({ signal }) => client.getBookReport(requireId(bookId), month, { signal }),
    enabled: isReady && bookId != null && (options?.enabled ?? true),
    ...liveOptions(options),
  });
}

/**
 * 정산. 달을 주거나, 여행 가계부면 `'all'` 로 기간 전체를 본다.
 *
 * 같이 모은 돈(`none`) 가계부도 200 으로 온다. 그때는 보낼 돈이 비어 있고 합계만 있다.
 */
export function useBookSettlement(
  bookId: string | null,
  period?: SettlementPeriod,
  options?: BookQueryOptions,
) {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.bookSettlement(bookId ?? '', period),
    queryFn: ({ signal }) => client.getSettlement(requireId(bookId), period, { signal }),
    enabled: isReady && bookId != null && (options?.enabled ?? true),
    ...liveOptions(options),
  });
}

/**
 * 초대 미리보기. 코드가 없거나 비어 있으면 묻지 않는다.
 *
 * 모르는 코드, 지운 가계부, 스위치가 꺼진 서버는 모두 404 로 온다. 화면은 셋을 같은 말로 안내한다.
 */
export function useInvitePreview(code: string | null) {
  const client = useApiClient();
  const isReady = useApiReady();

  return useQuery({
    queryKey: queryKeys.invite(code ?? ''),
    queryFn: ({ signal }) => client.getInvitePreview(requireId(code), { signal }),
    enabled: isReady && code != null && code !== '',
  });
}
