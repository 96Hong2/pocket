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
  ClosingOut,
  BudgetSuggestionOut,
  BudgetUpsert,
  CalendarMonthOut,
  CategoryCreate,
  CategoryListOut,
  CategoryOut,
  CategoryUpdate,
  GoalContributionCreate,
  GoalCreate,
  GoalHistoryOut,
  EmailVerifyOut,
  MeOut,
  ProfilePatch,
  GoalPatch,
  GoalStateOut,
  ImportBatchOut,
  ImportCandidatePatch,
  ImportCommitOut,
  MerchantRuleCreate,
  MerchantRuleListOut,
  MerchantRuleOut,
  MonthlyReportOut,
  NotificationSettingsOut,
  NotificationSettingsPatch,
  PeriodSummaryOut,
  PreferencesOut,
  PreferencesPatch,
  RecurringCreate,
  RecurringDueOut,
  RecurringListOut,
  RecurringUpdate,
  TagCreate,
  TagListOut,
  TagUpdate,
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

/**
 * 생활비 제안을 물을 때 함께 보내는 것.
 *
 * 실수령·고정비를 안 보내면 서버가 지난달에서 어림한다. 화면에서 고친 값만 실어 보낸다.
 * 원 단위 정수여야 한다. 소수를 보내면 서버가 422 로 막는다.
 */
export interface BudgetSuggestionParams extends Partial<MonthParams> {
  takeHome?: number;
  fixedCosts?: number;
  /** 매달 모을 돈을 직접 준다. 주면 목표 대신 이 값을 뺀다. */
  saving?: number;
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

/**
 * 줄글 한 덩이를 읽는 요청에 주는 제한 시간.
 *
 * 서버는 모델을 한 번 부르는 데 20초까지 기다리고, 줄이 홀수로 끊기면 **한 번 더** 부른다.
 * 전역 10초로 끊으면 정상 응답이 오는 중에 화면만 「응답이 늦어요」 로 바뀌고, 그 호출은
 * 값을 치른 채 버려진다. 서버가 포기하는 지점보다 뒤에 서 있어야 한다.
 */
const TEXT_TIMEOUT_MS = 45_000;

/** 요청 하나에 붙이는 것. 지금은 취소 신호뿐이다. */
export interface CallOptions {
  signal?: AbortSignal;
}

const PATHS = {
  transactions: '/api/v1/transactions',
  summary: '/api/v1/transactions/summary',
  monthlyReport: '/api/v1/reports/monthly',
  closing: '/api/v1/reports/closing',
  calendar: '/api/v1/transactions/calendar',
  categories: '/api/v1/categories',
  budgets: '/api/v1/budgets',
  budgetSuggestion: '/api/v1/budgets/suggestion',
  categoryBudgets: '/api/v1/budgets/categories',
  preferences: '/api/v1/preferences',
  notificationSettings: '/api/v1/notifications/settings',
  imports: '/api/v1/imports',
  merchantRules: '/api/v1/merchant-rules',
  assets: '/api/v1/assets',
  goals: '/api/v1/goals',
  tags: '/api/v1/tags',
  recurring: '/api/v1/recurring',
  categoryOrder: '/api/v1/categories/order',
  accountReset: '/api/v1/account/reset',
  accountMe: '/api/v1/account/me',
  accountEmailStart: '/api/v1/account/email/start',
  accountEmailVerify: '/api/v1/account/email/verify',
  accountProfile: '/api/v1/account/profile',
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

function tagPath(id: string): string {
  return `${PATHS.tags}/${encodeURIComponent(id)}`;
}

function recurringPath(id: string): string {
  return `${PATHS.recurring}/${encodeURIComponent(id)}`;
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
  getSummary(params?: MonthParams, options?: CallOptions): Promise<PeriodSummaryOut>;

  /** 리포트 화면이 그리는 것 전부. 조회 하나로 끝낸다. */
  getMonthlyReport(params?: MonthParams, options?: CallOptions): Promise<MonthlyReportOut>;
  /**
   * 그 달의 결산. **부르는 것만으로는 아무것도 저장되지 않는다.**
   *
   * 아직 지나는 중인 달이나 기록이 없는 달도 200 으로 오고, 그때는 `is_closed`·
   * `has_any_transaction` 이 false 라 화면이 입구를 아예 그리지 않는다.
   */
  getClosing(params?: MonthParams, options?: CallOptions): Promise<ClosingOut>;
  /** 달력 격자용 날짜별 합계. 기록이 있는 날만 온다. */
  getCalendar(params?: MonthParams, options?: CallOptions): Promise<CalendarMonthOut>;
  /**
   * 태그 목록. 지출 태그와 수입 태그가 한 목록에 섞여 오고 화면이 `kind` 로 갈라 쓴다.
   *
   * 쓰기 응답도 전부 같은 목록 모양이라, 화면이 받은 것을 그대로 캐시에 넣는다.
   */
  listTags(options?: CallOptions): Promise<TagListOut>;
  createTag(body: TagCreate, options?: CallOptions): Promise<TagListOut>;
  updateTag(id: string, body: TagUpdate, options?: CallOptions): Promise<TagListOut>;
  /** 태그만 지운다. 그 태그로 적어 둔 기록은 남는다. 두 번 눌러도 204 다. */
  deleteTag(id: string, options?: CallOptions): Promise<void>;

  /** 반복 지출 설정 목록. 꺼 둔 것도 함께 온다. */
  listRecurring(options?: CallOptions): Promise<RecurringListOut>;
  /** 오늘 물어볼 것. **빈 목록이 정상이다.** */
  listRecurringDue(options?: CallOptions): Promise<RecurringDueOut[]>;
  createRecurring(body: RecurringCreate, options?: CallOptions): Promise<RecurringListOut>;
  updateRecurring(
    id: string,
    body: RecurringUpdate,
    options?: CallOptions,
  ): Promise<RecurringListOut>;
  deleteRecurring(id: string, options?: CallOptions): Promise<void>;
  /** 예고를 기록으로 옮긴다. 응답은 키패드 저장과 같은 모양이다. */
  recordRecurring(id: string, options?: CallOptions): Promise<TransactionCreated>;
  /** 이번 회차는 묻지 않는다. 다음 달에는 다시 묻는다. */
  dismissRecurring(id: string, options?: CallOptions): Promise<RecurringListOut>;

  listCategories(options?: CallOptions): Promise<CategoryListOut>;
  /** 내 카테고리 만들기. 이름이 겹치면 409 로 막힌다. */
  createCategory(body: CategoryCreate, options?: CallOptions): Promise<CategoryOut>;
  /** 내 카테고리 고치기. 보낸 필드만 바뀐다. 기본 카테고리는 422 다. */
  updateCategory(id: string, body: CategoryUpdate, options?: CallOptions): Promise<CategoryOut>;
  /** 내 카테고리 지우기. 그 카테고리를 쓰던 거래는 남는다. 두 번 눌러도 204 다. */
  deleteCategory(id: string, options?: CallOptions): Promise<void>;
  /**
   * 칩이 설 순서. 화면이 보고 있는 목록 전체를 그대로 보낸다.
   *
   * **문서가 사라져도 끝까지 보낸다.** 화살표를 누르고 곧바로 화면을 떠나거나 앱을 닫는
   * 것이 오히려 흔한 손짓인데, 보통 요청은 그때 브라우저가 끊어 방금 옮긴 순서를 잃는다.
   * 순서 배열은 작아 `keepalive` 의 64KB 상한에 걸리지 않는다.
   */
  saveCategoryOrder(ids: string[], options?: CallOptions): Promise<void>;
  getBudget(params?: MonthParams, options?: CallOptions): Promise<BudgetOut>;
  /**
   * 목표에서 거꾸로 낸 생활비 제안. **부르는 것만으로는 아무것도 저장되지 않는다.**
   *
   * 목표가 없거나 기한이 없으면 `available` 이 false 로 오고 그때 카드를 그리지 않는다.
   */
  getBudgetSuggestion(
    params?: BudgetSuggestionParams,
    options?: CallOptions,
  ): Promise<BudgetSuggestionOut>;
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
  /**
   * 앱에 넣은 것을 전부 지운다. **되돌릴 수 없다.**
   *
   * 본문의 `confirm` 은 서버가 요구하는 값이다. 화면의 동의 체크와 별개로,
   * 잘못 만들어진 요청 하나가 몇 달치를 지우지 못하게 한 겹 더 둔다.
   */
  resetAccountData(options?: CallOptions): Promise<void>;
  /** 내 계정. 연결 전에는 email 이 null 이고 그것이 정상이다. */
  getMe(options?: CallOptions): Promise<MeOut>;
  /** 여섯 자리 코드를 메일로 보낸다. 보낼 수단이 없으면 503 `EMAIL_LOGIN_UNAVAILABLE`. */
  startEmailLogin(email: string, options?: CallOptions): Promise<void>;
  /** 코드를 확인하고 이 기기를 그 이메일의 사람에게 붙인다. */
  verifyEmailLogin(email: string, code: string, options?: CallOptions): Promise<EmailVerifyOut>;
  /** 연령대·성별. 빈 본문을 보내면 건너뛴 것으로 남는다. */
  saveProfile(body: ProfilePatch, options?: CallOptions): Promise<MeOut>;
  getPreferences(options?: CallOptions): Promise<PreferencesOut>;
  /** 보낸 필드만 고친다. 응답은 고친 뒤 전체 설정이다. */
  savePreferences(body: PreferencesPatch, options?: CallOptions): Promise<PreferencesOut>;
  /** 기록 알림 설정. 행이 없으면 서버가 꺼진 기본값으로 만들어 준다. */
  getNotificationSettings(options?: CallOptions): Promise<NotificationSettingsOut>;
  /**
   * 알림 설정 고치기. 보낸 필드만 바뀐다.
   *
   * `remind_at: null` 을 보내면 정해 둔 시각이 지워진다. 필드를 빼는 것과 다르다.
   * 켜면서 시각을 안 주면 서버가 기본 시각을 넣어 준다.
   */
  saveNotificationSettings(
    body: NotificationSettingsPatch,
    options?: CallOptions,
  ): Promise<NotificationSettingsOut>;
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
  createMerchantRule(body: MerchantRuleCreate, options?: CallOptions): Promise<MerchantRuleOut>;
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
  /**
   * 다 모은 목표를 마친다. 마치고 나면 새 목표를 만들 수 있다.
   *
   * 지우기와 다르다. 마친 것은 「지난 목표」에 남고, 지운 것은 어디에도 안 남는다.
   * 아직 다 못 모았으면 422 `GOAL_NOT_ACHIEVED` 다.
   */
  finishGoal(goalId: string, options?: CallOptions): Promise<GoalStateOut>;
  /** 다 모으고 마친 목표들. 접은 것은 오지 않는다. */
  getGoalHistory(options?: CallOptions): Promise<GoalHistoryOut>;
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

    getClosing(params, call) {
      return transport.request<ClosingOut>({
        method: 'GET',
        path: PATHS.closing,
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

    listTags(call) {
      return transport.request<TagListOut>({
        method: 'GET',
        path: PATHS.tags,
        signal: call?.signal,
      });
    },

    createTag(body, call) {
      return transport.request<TagListOut>({
        method: 'POST',
        path: PATHS.tags,
        body,
        signal: call?.signal,
      });
    },

    updateTag(id, body, call) {
      return transport.request<TagListOut>({
        method: 'PATCH',
        path: tagPath(id),
        body,
        signal: call?.signal,
      });
    },

    deleteTag(id, call) {
      return transport.request<void>({
        method: 'DELETE',
        path: tagPath(id),
        signal: call?.signal,
      });
    },

    listRecurring(call) {
      return transport.request<RecurringListOut>({
        method: 'GET',
        path: PATHS.recurring,
        signal: call?.signal,
      });
    },

    listRecurringDue(call) {
      return transport.request<RecurringDueOut[]>({
        method: 'GET',
        path: `${PATHS.recurring}/due`,
        signal: call?.signal,
      });
    },

    createRecurring(body, call) {
      return transport.request<RecurringListOut>({
        method: 'POST',
        path: PATHS.recurring,
        body,
        signal: call?.signal,
      });
    },

    updateRecurring(id, body, call) {
      return transport.request<RecurringListOut>({
        method: 'PATCH',
        path: recurringPath(id),
        body,
        signal: call?.signal,
      });
    },

    deleteRecurring(id, call) {
      return transport.request<void>({
        method: 'DELETE',
        path: recurringPath(id),
        signal: call?.signal,
      });
    },

    recordRecurring(id, call) {
      return transport.request<TransactionCreated>({
        method: 'POST',
        path: `${recurringPath(id)}/record`,
        signal: call?.signal,
      });
    },

    dismissRecurring(id, call) {
      return transport.request<RecurringListOut>({
        method: 'POST',
        path: `${recurringPath(id)}/dismiss`,
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

    saveCategoryOrder(ids, call) {
      return transport.request<void>({
        method: 'PUT',
        path: PATHS.categoryOrder,
        body: { ids },
        signal: call?.signal,
        keepalive: true,
      });
    },

    resetAccountData(call) {
      return transport.request<void>({
        method: 'POST',
        path: PATHS.accountReset,
        body: { confirm: true },
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

    getBudgetSuggestion(params, call) {
      return transport.request<BudgetSuggestionOut>({
        method: 'GET',
        path: PATHS.budgetSuggestion,
        query: {
          year: params?.year,
          month: params?.month,
          take_home: params?.takeHome,
          fixed_costs: params?.fixedCosts,
          saving: params?.saving,
        },
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

    getMe(call) {
      return transport.request<MeOut>({
        method: 'GET',
        path: PATHS.accountMe,
        signal: call?.signal,
      });
    },

    startEmailLogin(email, call) {
      return transport.request<void>({
        method: 'POST',
        path: PATHS.accountEmailStart,
        body: { email },
        signal: call?.signal,
      });
    },

    verifyEmailLogin(email, code, call) {
      return transport.request<EmailVerifyOut>({
        method: 'POST',
        path: PATHS.accountEmailVerify,
        body: { email, code },
        signal: call?.signal,
      });
    },

    saveProfile(body, call) {
      return transport.request<MeOut>({
        method: 'PATCH',
        path: PATHS.accountProfile,
        body,
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

    getNotificationSettings(call) {
      return transport.request<NotificationSettingsOut>({
        method: 'GET',
        path: PATHS.notificationSettings,
        signal: call?.signal,
      });
    },

    saveNotificationSettings(body, call) {
      return transport.request<NotificationSettingsOut>({
        method: 'PATCH',
        path: PATHS.notificationSettings,
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
        timeoutMs: TEXT_TIMEOUT_MS,
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

    createMerchantRule(body, call) {
      return transport.request<MerchantRuleOut>({
        method: 'POST',
        path: PATHS.merchantRules,
        body,
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

    finishGoal(goalId, call) {
      return transport.request<GoalStateOut>({
        method: 'POST',
        path: `${goalPath(goalId)}/finish`,
        signal: call?.signal,
      });
    },

    getGoalHistory(call) {
      return transport.request<GoalHistoryOut>({
        method: 'GET',
        path: `${PATHS.goals}/history`,
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
