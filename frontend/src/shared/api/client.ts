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
  AssetsOut,
  AssetSnapshotPut,
  BudgetOut,
  BudgetUpsert,
  CalendarMonthOut,
  CategoryCreate,
  CategoryListOut,
  CategoryOut,
  CategoryUpdate,
  GoalContributionCreate,
  GoalCreate,
  GoalPatch,
  GoalStateOut,
  ImportBatchOut,
  ImportCandidatePatch,
  ImportCommitOut,
  MerchantRuleListOut,
  MonthlyReportOut,
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

/**
 * 사진 한 장을 읽는 요청에만 주는 제한 시간. 캡처와 영수증이 함께 쓴다.
 *
 * 사진을 실어 보내고 모델이 읽을 때까지라 전역 10초로는 정상 응답도 끊긴다.
 */
const IMAGE_TIMEOUT_MS = 30_000;

/** 요청 하나에 붙이는 것. 지금은 취소 신호뿐이다. */
export interface CallOptions {
  signal?: AbortSignal;
}

const PATHS = {
  transactions: '/api/v1/transactions',
  summary: '/api/v1/transactions/summary',
  monthlyReport: '/api/v1/reports/monthly',
  calendar: '/api/v1/transactions/calendar',
  categories: '/api/v1/categories',
  budgets: '/api/v1/budgets',
  categoryBudgets: '/api/v1/budgets/categories',
  preferences: '/api/v1/preferences',
  imports: '/api/v1/imports',
  merchantRules: '/api/v1/merchant-rules',
  assets: '/api/v1/assets',
  goals: '/api/v1/goals',
} as const;

function transactionPath(id: string): string {
  return `${PATHS.transactions}/${encodeURIComponent(id)}`;
}

function categoryPath(id: string): string {
  return `${PATHS.categories}/${encodeURIComponent(id)}`;
}

function categoryBudgetPath(categoryId: string): string {
  return `${PATHS.categoryBudgets}/${encodeURIComponent(categoryId)}`;
}

function importPath(batchId: string): string {
  return `${PATHS.imports}/${encodeURIComponent(batchId)}`;
}

function candidatePath(batchId: string, candidateId: string): string {
  return `${importPath(batchId)}/candidates/${encodeURIComponent(candidateId)}`;
}

function goalPath(goalId: string): string {
  return `${PATHS.goals}/${encodeURIComponent(goalId)}`;
}

function contributionPath(goalId: string, contributionId: string): string {
  return `${goalPath(goalId)}/contributions/${encodeURIComponent(contributionId)}`;
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

  /** 리포트 화면이 그리는 것 전부. 조회 하나로 끝낸다. */
  getMonthlyReport(params?: MonthParams, options?: CallOptions): Promise<MonthlyReportOut>;
  /** 달력 격자용 날짜별 합계. 기록이 있는 날만 온다. */
  getCalendar(params?: MonthParams, options?: CallOptions): Promise<CalendarMonthOut>;
  listCategories(options?: CallOptions): Promise<CategoryListOut>;
  /** 내 카테고리 만들기. 이름이 겹치면 409 로 막힌다. */
  createCategory(body: CategoryCreate, options?: CallOptions): Promise<CategoryOut>;
  /** 내 카테고리 고치기. 보낸 필드만 바뀐다. 기본 카테고리는 422 다. */
  updateCategory(id: string, body: CategoryUpdate, options?: CallOptions): Promise<CategoryOut>;
  /** 내 카테고리 지우기. 그 카테고리를 쓰던 거래는 남는다. 두 번 눌러도 204 다. */
  deleteCategory(id: string, options?: CallOptions): Promise<void>;
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
  /** 줄글 분석. 거래를 만들지 않고 검토 단위만 만든다. */
  analyzeText(text: string, options?: CallOptions): Promise<ImportBatchOut>;
  /**
   * 캡처 분석. 줄글과 같은 검토 단위를 돌려준다.
   *
   * `dataUri` 는 `data:image/png;base64,...` 통째로 보낸다. 멀티파트를 쓰지 않는 이유는
   * 이 계층이 JSON 한 길만 알기 때문이다.
   */
  analyzeCapture(dataUri: string, options?: CallOptions): Promise<ImportBatchOut>;

  /** 영수증 한 장 분석. 캡처와 같은 배관이고 경로와 지시만 다르다. */
  analyzeReceipt(dataUri: string, options?: CallOptions): Promise<ImportBatchOut>;
  /** 후보 한 줄 고치기. 보낸 항목만 바뀌고, 응답은 묶음 전체다. */
  patchImportCandidate(
    batchId: string,
    candidateId: string,
    body: ImportCandidatePatch,
    options?: CallOptions,
  ): Promise<ImportBatchOut>;
  /** 고른 후보를 실제 거래로 저장한다. */
  commitImport(batchId: string, options?: CallOptions): Promise<ImportCommitOut>;
  /** 검토를 접는다. 없어도 204 다. */
  deleteImport(batchId: string, options?: CallOptions): Promise<void>;
  listMerchantRules(options?: CallOptions): Promise<MerchantRuleListOut>;
  deleteMerchantRule(ruleId: string, options?: CallOptions): Promise<void>;
  /** 자산 목록과 순자산. 한 번도 안 적었으면 `snapshot` 이 null 이다. */
  getAssets(options?: CallOptions): Promise<AssetsOut>;
  /**
   * 자산 목록을 통째로 바꾼다. 항목 하나만 고치는 경로는 없다.
   *
   * 보낸 목록이 오늘 스냅샷이 되므로 **지금 목록에 새 줄만 얹어 보내야 한다.**
   * 목록을 못 받은 상태에서 부르면 나머지 줄이 사라진다.
   */
  saveAssets(body: AssetSnapshotPut, options?: CallOptions): Promise<AssetsOut>;

  /** 진행 중인 목표 하나. 없으면 `goal` 이 null 이다. 오류가 아니다. */
  getGoal(options?: CallOptions): Promise<GoalStateOut>;
  /** 목표 만들기. 진행 중인 목표가 이미 있으면 422 `GOAL_ALREADY_ACTIVE` 다. */
  createGoal(body: GoalCreate, options?: CallOptions): Promise<GoalStateOut>;
  /**
   * 목표 고치기. 보낸 필드만 바뀐다.
   *
   * `target_date: null` 을 보내면 기한이 없어진다. 필드를 빼는 것과 다르다.
   */
  updateGoal(goalId: string, body: GoalPatch, options?: CallOptions): Promise<GoalStateOut>;
  /** 목표 접기. 접고 나면 새 목표를 만들 수 있다. 없어도 404 라 두 번 부르지 않는다. */
  deleteGoal(goalId: string, options?: CallOptions): Promise<void>;
  /** 모은 돈 한 번 남기기. 응답은 조회와 같은 모양이라 그대로 캐시에 넣는다. */
  addGoalContribution(
    goalId: string,
    body: GoalContributionCreate,
    options?: CallOptions,
  ): Promise<GoalStateOut>;
  /** 모은 돈 한 줄 지우기. 본문 없는 204 로 온다. */
  deleteGoalContribution(
    goalId: string,
    contributionId: string,
    options?: CallOptions,
  ): Promise<void>;
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

    getMonthlyReport(params, call) {
      return transport.request<MonthlyReportOut>({
        method: 'GET',
        path: PATHS.monthlyReport,
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

    createCategory(body, call) {
      return transport.request<CategoryOut>({
        method: 'POST',
        path: PATHS.categories,
        body,
        signal: call?.signal,
      });
    },

    updateCategory(id, body, call) {
      return transport.request<CategoryOut>({
        method: 'PATCH',
        path: categoryPath(id),
        body,
        signal: call?.signal,
      });
    },

    deleteCategory(id, call) {
      return transport.request<void>({
        method: 'DELETE',
        path: categoryPath(id),
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

    analyzeText(text, call) {
      return transport.request<ImportBatchOut>({
        method: 'POST',
        path: `${PATHS.imports}/text`,
        body: { text },
        signal: call?.signal,
      });
    },

    analyzeCapture(dataUri, call) {
      return transport.request<ImportBatchOut>({
        method: 'POST',
        path: `${PATHS.imports}/capture`,
        body: { image: dataUri },
        signal: call?.signal,
        timeoutMs: IMAGE_TIMEOUT_MS,
      });
    },

    analyzeReceipt(dataUri, call) {
      return transport.request<ImportBatchOut>({
        method: 'POST',
        path: `${PATHS.imports}/receipt`,
        body: { image: dataUri },
        signal: call?.signal,
        timeoutMs: IMAGE_TIMEOUT_MS,
      });
    },

    patchImportCandidate(batchId, candidateId, body, call) {
      return transport.request<ImportBatchOut>({
        method: 'PATCH',
        path: candidatePath(batchId, candidateId),
        body,
        signal: call?.signal,
      });
    },

    commitImport(batchId, call) {
      return transport.request<ImportCommitOut>({
        method: 'POST',
        path: `${importPath(batchId)}/commit`,
        signal: call?.signal,
      });
    },

    deleteImport(batchId, call) {
      return transport.request<void>({
        method: 'DELETE',
        path: importPath(batchId),
        signal: call?.signal,
      });
    },

    listMerchantRules(call) {
      return transport.request<MerchantRuleListOut>({
        method: 'GET',
        path: PATHS.merchantRules,
        signal: call?.signal,
      });
    },

    deleteMerchantRule(ruleId, call) {
      return transport.request<void>({
        method: 'DELETE',
        path: `${PATHS.merchantRules}/${encodeURIComponent(ruleId)}`,
        signal: call?.signal,
      });
    },

    getAssets(call) {
      return transport.request<AssetsOut>({
        method: 'GET',
        path: PATHS.assets,
        signal: call?.signal,
      });
    },

    saveAssets(body, call) {
      return transport.request<AssetsOut>({
        method: 'PUT',
        path: PATHS.assets,
        body,
        signal: call?.signal,
      });
    },

    getGoal(call) {
      return transport.request<GoalStateOut>({
        method: 'GET',
        path: PATHS.goals,
        signal: call?.signal,
      });
    },

    createGoal(body, call) {
      return transport.request<GoalStateOut>({
        method: 'POST',
        path: PATHS.goals,
        body,
        signal: call?.signal,
      });
    },

    updateGoal(goalId, body, call) {
      return transport.request<GoalStateOut>({
        method: 'PATCH',
        path: goalPath(goalId),
        body,
        signal: call?.signal,
      });
    },

    deleteGoal(goalId, call) {
      return transport.request<void>({
        method: 'DELETE',
        path: goalPath(goalId),
        signal: call?.signal,
      });
    },

    addGoalContribution(goalId, body, call) {
      return transport.request<GoalStateOut>({
        method: 'POST',
        path: `${goalPath(goalId)}/contributions`,
        body,
        signal: call?.signal,
      });
    },

    deleteGoalContribution(goalId, contributionId, call) {
      return transport.request<void>({
        method: 'DELETE',
        path: contributionPath(goalId, contributionId),
        signal: call?.signal,
      });
    },
  };
}
