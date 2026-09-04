/**
 * 엔드포인트 하나에 메서드 하나. `docs/openapi.json` 의 경로와 1:1 이다.
 *
 * 화면은 경로 문자열을 몰라도 되고, 경로가 바뀌면 고칠 자리가 여기뿐이다.
 */

import {
  createTransport,
  type RequestSpec,
  type Transport,
  type TransportOptions,
} from './transport';
import type {
  BudgetOut,
  BudgetUpsert,
  CalendarMonthOut,
  CategoryListOut,
  PeriodSummaryOut,
  PreferencesOut,
  PreferencesPatch,
  TransactionCreate,
  TransactionCreated,
  TransactionListOut,
  TransactionUpdate,
  TransactionUpdated,
} from './types';

/**
 * 조회할 달. 안 넘기면 서버가 사용자 시간대의 이번 달로 정한다.
 * 월 경계는 서버가 정한다. 화면이 자기 시계로 달을 계산하지 않는다.
 */
export interface MonthParams {
  year: number;
  month: number;
}

export interface TransactionListParams extends Partial<MonthParams> {
  /** 1~200. 안 넘기면 서버 기본값 50. */
  limit?: number;
  /** `2026-09-10`. 이 날 하루만. 달 필터와 함께 걸린다. */
  day?: string;
  /** 상호나 카테고리 이름 부분일치. 대소문자를 가리지 않는다. */
  q?: string;
  /** 앞 응답의 `next_cursor`. 페이지 번호가 아니라 "여기 다음" 이다. */
  cursor?: string;
}

/** 요청 하나에 붙이는 것. 지금은 취소 신호뿐이다. */
export interface CallOptions {
  signal?: AbortSignal;
}

const PATHS = {
  transactions: '/api/v1/transactions',
  summary: '/api/v1/transactions/summary',
  calendar: '/api/v1/transactions/calendar',
  categories: '/api/v1/categories',
  budgets: '/api/v1/budgets',
  categoryBudgets: '/api/v1/budgets/categories',
  preferences: '/api/v1/preferences',
} as const;

function transactionPath(id: string): string {
  return `${PATHS.transactions}/${encodeURIComponent(id)}`;
}

function categoryBudgetPath(categoryId: string): string {
  return `${PATHS.categoryBudgets}/${encodeURIComponent(categoryId)}`;
}

function monthQuery(params?: MonthParams): RequestSpec['query'] {
  return { year: params?.year, month: params?.month };
}

export interface ApiClient extends Transport {
  /** 저장. 응답에 피드백 판정·예산 상태·되돌리기 창이 함께 온다. */
  createTransaction(body: TransactionCreate, options?: CallOptions): Promise<TransactionCreated>;
  listTransactions(
    params?: TransactionListParams,
    options?: CallOptions,
  ): Promise<TransactionListOut>;
  updateTransaction(
    id: string,
    body: TransactionUpdate,
    options?: CallOptions,
  ): Promise<TransactionUpdated>;
  deleteTransaction(id: string, options?: CallOptions): Promise<void>;
  /** 방금 저장한 것 되돌리기. 본문 없는 204 로 온다. */
  undoTransaction(id: string, options?: CallOptions): Promise<void>;
  getSummary(params?: MonthParams, options?: CallOptions): Promise<PeriodSummaryOut>;
  /** 달력 격자용 날짜별 합계. 기록이 있는 날만 온다. */
  getCalendar(params?: MonthParams, options?: CallOptions): Promise<CalendarMonthOut>;
  listCategories(options?: CallOptions): Promise<CategoryListOut>;
  getBudget(params?: MonthParams, options?: CallOptions): Promise<BudgetOut>;
  /** 예산 저장. 같은 기간에 몇 번을 보내도 결과가 같다. */
  saveBudget(body: BudgetUpsert, params?: MonthParams, options?: CallOptions): Promise<BudgetOut>;
  /** 예산 지우기. 카테고리 예산도 함께 사라진다. 예산이 없어도 204 다. */
  deleteBudget(params?: MonthParams, options?: CallOptions): Promise<void>;
  /** 카테고리 한도 저장. 응답은 조회와 같은 `BudgetOut` 이라 그대로 캐시에 넣는다. */
  saveCategoryBudget(
    categoryId: string,
    body: BudgetUpsert,
    params?: MonthParams,
    options?: CallOptions,
  ): Promise<BudgetOut>;
  /** 카테고리 한도 지우기. 없어도 204 다. */
  deleteCategoryBudget(
    categoryId: string,
    params?: MonthParams,
    options?: CallOptions,
  ): Promise<void>;
  getPreferences(options?: CallOptions): Promise<PreferencesOut>;
  /** 보낸 필드만 고친다. 응답은 고친 뒤 전체 설정이다. */
  savePreferences(body: PreferencesPatch, options?: CallOptions): Promise<PreferencesOut>;
}

export function createApiClient(options: TransportOptions): ApiClient {
  const transport = createTransport(options);

  return {
    ...transport,

    createTransaction(body, call) {
      return transport.request<TransactionCreated>({
        method: 'POST',
        path: PATHS.transactions,
        body,
        signal: call?.signal,
      });
    },

    listTransactions(params, call) {
      return transport.request<TransactionListOut>({
        method: 'GET',
        path: PATHS.transactions,
        query: {
          year: params?.year,
          month: params?.month,
          day: params?.day,
          limit: params?.limit,
          q: params?.q,
          cursor: params?.cursor,
        },
        signal: call?.signal,
      });
    },

    updateTransaction(id, body, call) {
      return transport.request<TransactionUpdated>({
        method: 'PATCH',
        path: transactionPath(id),
        body,
        signal: call?.signal,
      });
    },

    deleteTransaction(id, call) {
      return transport.request<void>({
        method: 'DELETE',
        path: transactionPath(id),
        signal: call?.signal,
      });
    },

    undoTransaction(id, call) {
      return transport.request<void>({
        method: 'POST',
        path: `${transactionPath(id)}/undo`,
        signal: call?.signal,
      });
    },

    getSummary(params, call) {
      return transport.request<PeriodSummaryOut>({
        method: 'GET',
        path: PATHS.summary,
        query: monthQuery(params),
        signal: call?.signal,
      });
    },

    getCalendar(params, call) {
      return transport.request<CalendarMonthOut>({
        method: 'GET',
        path: PATHS.calendar,
        query: monthQuery(params),
        signal: call?.signal,
      });
    },

    listCategories(call) {
      return transport.request<CategoryListOut>({
        method: 'GET',
        path: PATHS.categories,
        signal: call?.signal,
      });
    },

    getBudget(params, call) {
      return transport.request<BudgetOut>({
        method: 'GET',
        path: PATHS.budgets,
        query: monthQuery(params),
        signal: call?.signal,
      });
    },

    saveBudget(body, params, call) {
      return transport.request<BudgetOut>({
        method: 'PUT',
        path: PATHS.budgets,
        query: monthQuery(params),
        body,
        signal: call?.signal,
      });
    },

    deleteBudget(params, call) {
      return transport.request<void>({
        method: 'DELETE',
        path: PATHS.budgets,
        query: monthQuery(params),
        signal: call?.signal,
      });
    },

    saveCategoryBudget(categoryId, body, params, call) {
      return transport.request<BudgetOut>({
        method: 'PUT',
        path: categoryBudgetPath(categoryId),
        query: monthQuery(params),
        body,
        signal: call?.signal,
      });
    },

    deleteCategoryBudget(categoryId, params, call) {
      return transport.request<void>({
        method: 'DELETE',
        path: categoryBudgetPath(categoryId),
        query: monthQuery(params),
        signal: call?.signal,
      });
    },

    getPreferences(call) {
      return transport.request<PreferencesOut>({
        method: 'GET',
        path: PATHS.preferences,
        signal: call?.signal,
      });
    },

    savePreferences(body, call) {
      return transport.request<PreferencesOut>({
        method: 'PATCH',
        path: PATHS.preferences,
        body,
        signal: call?.signal,
      });
    },
  };
}
