/**
 * 변경 훅.
 *
 * 저장·되돌리기·예산 저장 뒤에 홈이 **즉시** 맞아야 한다. `staleTime` 이 60초라
 * 그냥 두면 방금 쓴 12,000원이 1분 동안 화면에 안 나타난다.
 *
 * 맞추는 방법은 두 단계다.
 * 1. 응답이 실제로 들고 온 값은 캐시에 바로 쓴다(왕복 없이 히어로 숫자가 바뀐다).
 * 2. 응답에 없는 값(이번 달 지출, 첫 기록 여부 같은 것)은 무효화해 다시 받는다.
 *
 * 저장 응답이 주는 것은 `budget` 블록뿐이다. `month_expense` 나 `has_any_transaction` 은
 * 오지 않으므로 1번만으로는 홈이 반만 맞는다. 그래서 둘 다 한다.
 */

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { toLedgerDate } from '../lib/format';

import { markBookActivity } from './bookActivity';
import type { MonthParams, SettlementPeriod } from './client';
import { useApiClient } from './context';
import { moneyQueryKeys, queryKeys } from './queryKeys';
import type {
  AssetCaptureOut,
  AssetsOut,
  AssetSnapshotPut,
  BookCategoryOut,
  BookCreate,
  BookEntryCreate,
  BookEntryUpdate,
  BookInviteOut,
  BookListOut,
  BookOut,
  BookUpdate,
  SettlementOut,
  BudgetOut,
  BudgetStateOut,
  BudgetUpsert,
  CategoryCreate,
  CategoryUpdate,
  GoalContributionCreate,
  GoalCreate,
  GoalPatch,
  GoalStateOut,
  NotificationSettingsOut,
  NotificationSettingsPatch,
  PeriodSummaryOut,
  PreferencesOut,
  RecurringCreate,
  RecurringListOut,
  RecurringUpdate,
  TagCreate,
  TagListOut,
  TagUpdate,
  ImportBatchOut,
  ImportCandidatePatch,
  ImportCommitIn,
  ImportCommitOut,
  MeOut,
  MerchantRuleCreate,
  PreferencesPatch,
  ProfilePatch,
  TransactionCreate,
  TransactionUpdate,
} from './types';

/**
 * 예산 블록만 캐시에 덮어쓴다.
 *
 * **값이 없으면 아무것도 하지 않는다.** 판정이 실패해 서버가 흡수한 응답은 `budget` 이 null 인데,
 * 그걸 그대로 쓰면 멀쩡하던 남은 예산과 게이지가 빈다.
 * 캐시가 아직 없을 때도 만들지 않는다. 저장 응답만으로는 온전한 조회 응답을 지어낼 수 없다.
 */
function writeBudgetState(
  queryClient: QueryClient,
  next: BudgetStateOut | null | undefined,
  params?: MonthParams,
): void {
  if (next == null) return;
  /*
    **응답이 말하는 달과 보고 있는 달이 다르면 쓰지 않는다.**

    수정 시트에서 날짜를 다른 달로 옮기면 서버는 **옮겨 간 달**의 예산으로 답한다.
    그것을 보고 있던 달 자리에 그대로 넣으면, 홈 히어로에 지난달 남은 돈과 남은 날이
    박힌 채로 재조회가 올 때까지 서 있는다. 무효화는 이미 뒤따라 돈다.
  */
  if (!sameMonth(next, params)) return;

  queryClient.setQueryData<BudgetOut>(queryKeys.budget(params), (prev) =>
    prev == null ? prev : { ...prev, budget: next },
  );
  queryClient.setQueryData<PeriodSummaryOut>(queryKeys.summary(params), (prev) =>
    prev == null ? prev : { ...prev, budget: next },
  );
}

/**
 * 서버가 답한 예산이 지금 보고 있는 달의 것인가.
 *
 * `params` 가 없으면 보고 있는 것은 이번 달이다. 응답의 `period_start` 는 그 달 1일이라
 * 앞 일곱 글자(`2026-09`)만 견준다. 기간이 달이 아닌 판이 오면 그때 이 함수를 고친다.
 */
function sameMonth(next: BudgetStateOut, params?: MonthParams): boolean {
  const answered = next.period_start.slice(0, 7);
  if (params == null) return answered === toLedgerDate(new Date()).slice(0, 7);
  return answered === `${params.year}-${String(params.month).padStart(2, '0')}`;
}

/** 돈에 얽힌 캐시를 전부 낡은 것으로 표시한다. 화면에 떠 있는 것은 바로 다시 받는다. */
function invalidateMoney(queryClient: QueryClient): Promise<void> {
  return Promise.all(
    moneyQueryKeys().map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  ).then(() => undefined);
}

/**
 * 거래 저장.
 *
 * 응답에 되돌리기 창(`undo_window_seconds`)이 함께 온다. 카운트다운은 **응답을 받은 시각**부터
 * 센다. 서버는 기기 시계를 보지 않는다. 그 계산은 화면이 한다.
 */
export function useCreateTransaction(params?: MonthParams) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: TransactionCreate) => client.createTransaction(body),
    onSuccess: (created) => {
      writeBudgetState(queryClient, created.budget, params);
      // 무효화를 기다리지 않는다. 여기서 return 하면 mutation 이 pending 인 채로 남아
      // 피드백 패널이 '저장 응답' 이 아니라 '홈 다시 받기' 가 끝날 때까지 안 뜬다.
      // 10초 안에 끝나야 하는 흐름에서 그 왕복만큼이 그대로 체감된다.
      void invalidateMoney(queryClient);
    },
  });
}

/**
 * 거래 수정.
 *
 * 저장 직후 카테고리를 다시 고르는 자리가 이걸 쓴다. 카테고리가 바뀌면 판정과 예산 상태가
 * 함께 달라지므로 응답이 저장 때와 같은 모양으로 온다.
 */
export function useUpdateTransaction(params?: MonthParams) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: string; body: TransactionUpdate }) =>
      client.updateTransaction(input.id, input.body),
    onSuccess: (updated) => {
      writeBudgetState(queryClient, updated.budget, params);
      // 저장 경로와 같다. 무효화를 기다리면 그동안 버튼이 잠기고 옛 금액이 남아,
      // 그 왕복이 8초 되돌리기 창을 그대로 갉아먹는다.
      // 패널이 보여주는 금액·판정·예산은 수정 응답과 바로 위 캐시 쓰기에서 온다.
      void invalidateMoney(queryClient);
    },
  });
}

/**
 * 거래 삭제.
 *
 * 서버는 행을 남기고 표시만 지운다. 204 라 돌려받는 값이 없어 무효화로 화면을 맞춘다.
 */
export function useDeleteTransaction() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (transactionId: string) => client.deleteTransaction(transactionId),
    onSuccess: () => invalidateMoney(queryClient),
  });
}

/** 응답이 조회와 같은 모양인 예산 저장들이 화면을 맞추는 방법. 저장·카테고리 저장이 함께 쓴다. */
function writeBudget(queryClient: QueryClient, budget: BudgetOut, params?: MonthParams): void {
  // 조회와 같은 모양이라 통째로 넣는다. 요약 쪽은 예산 블록만 갈아 끼우면 된다.
  queryClient.setQueryData<BudgetOut>(queryKeys.budget(params), budget);
  writeBudgetState(queryClient, budget.budget, params);
}

/** 예산 저장. 응답이 조회와 같은 모양이라 그대로 캐시에 넣는다. */
export function useSaveBudget(params?: MonthParams) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: BudgetUpsert) => client.saveBudget(body, params),
    onSuccess: (budget) => {
      writeBudget(queryClient, budget, params);
      return invalidateMoney(queryClient);
    },
  });
}

/**
 * 예산 지우기.
 *
 * 204 라 돌려받는 값이 없다. 카테고리 예산까지 한꺼번에 사라지므로 캐시를 손보지 않고
 * 다시 받는다. 지운 자리는 다음 기간으로 이어쓰지 않겠다는 표시로도 남는다.
 */
export function useDeleteBudget(params?: MonthParams) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => client.deleteBudget(params),
    onSuccess: () => invalidateMoney(queryClient),
  });
}

/** 카테고리 한도 저장. 응답이 예산 조회 전체라 예산 저장과 같은 방식으로 넣는다. */
export function useSaveCategoryBudget(params?: MonthParams) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { categoryId: string; body: BudgetUpsert }) =>
      client.saveCategoryBudget(input.categoryId, input.body, params),
    onSuccess: (budget) => {
      writeBudget(queryClient, budget, params);
      return invalidateMoney(queryClient);
    },
  });
}

/** 카테고리 한도 지우기. 204 라 다시 받아 맞춘다. */
export function useDeleteCategoryBudget(params?: MonthParams) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (categoryId: string) => client.deleteCategoryBudget(categoryId, params),
    onSuccess: () => invalidateMoney(queryClient),
  });
}

/**
 * 카테고리 목록 무효화.
 *
 * `moneyQueryKeys` 에 카테고리가 **일부러** 빠져 있다. 거래를 저장해도 카테고리는 안 변한다.
 * 그래서 카테고리를 직접 만든·고친·지운 이 자리에서만 무효화해 준다. 여기서 빠뜨리면
 * `staleTime` 30분 동안 기록 시트 칩이 방금 만든 것을 모른다.
 */
function invalidateCategories(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: queryKeys.categories() });
}

export function useCreateCategory() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CategoryCreate) => client.createCategory(body),
    onSuccess: () => invalidateCategories(queryClient),
  });
}

export function useUpdateCategory() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CategoryUpdate }) =>
      client.updateCategory(id, body),
    onSuccess: () => invalidateCategories(queryClient),
  });
}

/**
 * 카테고리 지우기.
 *
 * 서버가 그 카테고리에 딸린 한도와 기억한 분류까지 함께 지운다. 세 캐시가 같이 낡으므로
 * 셋 다 무효화한다. 기억한 분류를 빼먹으면 카테고리 관리에 이미 없는 규칙 줄이 남고,
 * 그 줄의 지우기가 서버에 없는 것을 지우려 든다.
 */
export function useDeleteCategory() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => client.deleteCategory(id),
    onSuccess: async () => {
      await invalidateCategories(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.budgets() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.merchantRules() });
    },
  });
}

/**
 * 칩이 설 순서 저장.
 *
 * 응답이 없어서 캐시를 무효화한다. 순서는 목록 응답에 실려 오므로 다시 받아야 화면이 맞는다.
 */
export function useSaveCategoryOrder() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => client.saveCategoryOrder(ids),
    onSuccess: () => invalidateCategories(queryClient),
  });
}

/**
 * 앱 데이터 초기화.
 *
 * 남는 것이 없으므로 **캐시를 통째로 버린다.** 표를 하나씩 무효화하면 다음에 표가 늘었을 때
 * 여기를 함께 고치지 않아, 지운 뒤에도 옛 숫자를 들고 있는 화면이 생긴다.
 */
export function useResetAccountData() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => client.resetAccountData(),
    onSuccess: async () => {
      queryClient.removeQueries();
      await queryClient.invalidateQueries();
    },
  });
}

/** 로그인 코드 보내기. 화면은 보낸 뒤 코드 칸을 연다. */
export function useStartEmailLogin() {
  const client = useApiClient();
  return useMutation({ mutationFn: (email: string) => client.startEmailLogin(email) });
}

/**
 * 코드 확인.
 *
 * 다른 사람에게 옮겨 갔을 수 있다(`switched`·`merged`). 그러면 지금 캐시는 전부 남의 것이라
 * 통째로 비운다. 붙이기만 한 것(`linked`)도 me 는 바뀌었으니 같이 새로 받는다.
 */
export function useVerifyEmailLogin() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { email: string; code: string }) =>
      client.verifyEmailLogin(input.email, input.code),
    onSuccess: (result) => {
      if (result.result === 'linked') {
        queryClient.setQueryData<MeOut>(queryKeys.me(), result.me);
        return;
      }
      queryClient.removeQueries();
      void queryClient.invalidateQueries();
    },
  });
}

/** 연령대·성별. 응답이 고친 뒤 전체 계정이라 그대로 캐시에 넣는다. */
export function useSaveProfile() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ProfilePatch) => client.saveProfile(body),
    onSuccess: (me) => {
      queryClient.setQueryData<MeOut>(queryKeys.me(), me);
    },
  });
}

/**
 * 앱 설정 저장.
 *
 * 이어쓰기를 끄고 켜는 것이 다음 기간에 예산이 생기는지를 바꾼다. 그래서 그 값을 보냈을 때만
 * 예산 캐시를 함께 무효화한다. 홈 표시 방식만 바꿨는데 예산을 다시 받을 이유가 없다.
 */
export function useSavePreferences() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: PreferencesPatch) => client.savePreferences(body),
    onSuccess: (preferences, body) => {
      queryClient.setQueryData<PreferencesOut>(queryKeys.preferences(), preferences);
      if (body.budget_auto_carryover == null) return;
      return queryClient.invalidateQueries({ queryKey: queryKeys.budgets() });
    },
  });
}

/**
 * 알림 설정 저장.
 *
 * 응답이 고친 뒤 전체 설정이라 그대로 캐시에 넣는다. 무효화하지 않는다. 돈에 얽힌 값이
 * 아니라서 다른 화면이 이 값을 보고 있지 않다.
 */
export function useSaveNotificationSettings() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: NotificationSettingsPatch) => client.saveNotificationSettings(body),
    onSuccess: (settings) => {
      queryClient.setQueryData<NotificationSettingsOut>(queryKeys.notificationSettings(), settings);
    },
  });
}

/**
 * 분석 요청에 싣는 것. 읽을 것과 고른 날을 함께 넘긴다.
 *
 * 인자를 스칼라 하나로 두면 날짜가 낄 자리가 없어, 지난 날을 고르고 줄글로 적으면
 * 고른 날이 조용히 버려졌다. 그래서 세 방식이 아예 잠겨 있었다.
 */
export interface AnalyzeInput<T> {
  value: T;
  /** 화면에서 고른 「적을 날」. 오늘이면 `null` 이다. */
  baseDay: string | null;
  /** 적을 공유 가계부. 비우면 내 가계부다. 주면 분류가 그 가계부 것으로 오고 지출만 켜진다. */
  bookId?: string | null;
}

/**
 * 줄글 분석.
 *
 * 여기서는 캐시를 건드리지 않는다. 분석은 아직 거래를 만들지 않아 돈이 움직이지 않는다.
 */
export function useAnalyzeText() {
  const client = useApiClient();

  return useMutation({
    mutationFn: (input: AnalyzeInput<string>) =>
      client.analyzeText(input.value, { baseDay: input.baseDay, bookId: input.bookId }),
  });
}

/**
 * 사진 한 장 분석. 캡처와 영수증이 나눠 쓴다.
 *
 * 줄글과 같은 이유로 캐시를 건드리지 않는다. 저장은 `useCommitImport` 가 하고,
 * 세 탭이 그 훅 하나를 함께 쓴다.
 */
export function useAnalyzeImage(kind: 'capture' | 'receipt') {
  const client = useApiClient();

  return useMutation({
    mutationFn: (input: AnalyzeInput<string[]>): Promise<ImportBatchOut> => {
      const target = { baseDay: input.baseDay, bookId: input.bookId };
      return kind === 'receipt'
        ? client.analyzeReceipt(input.value, target)
        : client.analyzeCapture(input.value, target);
    },
  });
}

/** 검토 화면에서 후보 한 줄 고치기. 응답이 묶음 전체라 화면이 그대로 갈아 끼운다. */
export function usePatchImportCandidate() {
  const client = useApiClient();

  return useMutation({
    mutationFn: (input: {
      batchId: string;
      candidateId: string;
      body: ImportCandidatePatch;
    }): Promise<ImportBatchOut> =>
      client.patchImportCandidate(input.batchId, input.candidateId, input.body),
  });
}

/**
 * 고른 후보 저장.
 *
 * 여러 건이 한꺼번에 생기므로 돈에 얽힌 캐시를 전부 다시 받는다.
 * 기억한 분류도 이때 늘어난다.
 *
 * **응답의 예산 블록을 캐시에 덮어쓰지 않는다.** 지난 달 날짜로 저장하면 서버가 그 달의
 * 예산 상태를 주는데, 그걸 이번 달 자리에 넣으면 홈이 남의 달 숫자를 보여준다.
 * 여기는 10초 루프가 아니라 검토를 마친 뒤라 왕복 한 번이 더 들어도 된다.
 *
 * 공유 가계부 묶음이면(응답 `book_id`) 그 가계부만 다시 받는다. 내 돈은 움직이지 않았다.
 */
export function useCommitImport() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      batchId,
      body,
    }: {
      batchId: string;
      body?: ImportCommitIn;
    }): Promise<ImportCommitOut> => client.commitImport(batchId, body),
    onSuccess: (result) => {
      if (result.book_id != null) {
        refreshBook(queryClient, result.book_id);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.merchantRules() });
      return invalidateMoney(queryClient);
    },
  });
}

/** 검토 접기. 저장한 거래는 남는다. */
export function useDeleteImport() {
  const client = useApiClient();

  return useMutation({
    mutationFn: (batchId: string) => client.deleteImport(batchId),
  });
}

/**
 * 기억한 분류 손으로 걸기.
 *
 * 같은 상호가 이미 있으면 서버가 분류만 바꾼다. 화면에서 "이미 있다" 를 따로 다루지 않는다.
 */
export function useCreateMerchantRule() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: MerchantRuleCreate) => client.createMerchantRule(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.merchantRules() }),
  });
}

/** 기억한 분류 지우기. 다음 분석부터 그 상호는 다시 모델이 정한다. */
export function useDeleteMerchantRule() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ruleId: string) => client.deleteMerchantRule(ruleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.merchantRules() }),
  });
}

/**
 * 자산 응답을 캐시에 넣고, 그 목록으로 센 추이와 분석을 낡게 한다.
 *
 * 응답이 조회와 같은 모양이라 목록은 다시 받지 않는다. 예산·거래는 자산과 무관하다.
 */
function applyAssets(queryClient: QueryClient, assets: AssetsOut): void {
  queryClient.setQueryData<AssetsOut>(queryKeys.assets(), assets);
  // 기다리지 않는다. 추이를 다시 받는 동안 저장 뒤 화면이 멈춰 있지 않게.
  void queryClient.invalidateQueries({ queryKey: queryKeys.assetHistories() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.assetAnalyses() });
}

/**
 * 자산 목록 저장. 캡처로 채운 목록이면 본문에 `source: 'screenshot'` 을 싣는다.
 *
 * 순자산과 그룹 소계는 응답으로 그 자리에서 맞는다.
 */
export function useSaveAssets() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: AssetSnapshotPut): Promise<AssetsOut> => client.saveAssets(body),
    onSuccess: (assets) => {
      applyAssets(queryClient, assets);
    },
  });
}

/** 「그대로예요」. `month` 는 `YYYY-MM`, 이번 달만 받는다. 응답은 조회와 같은 모양이다. */
export function useCheckinAssets() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (month: string): Promise<AssetsOut> => client.checkinAssets(month),
    onSuccess: (assets) => {
      applyAssets(queryClient, assets);
    },
  });
}

/**
 * 잔액 화면 캡처 한 장 읽기. 아무것도 저장하지 않아 캐시를 건드리지 않는다.
 * 저장은 `useSaveAssets` 에 `source: 'screenshot'` 으로 한다.
 */
export function useCaptureAssets() {
  const client = useApiClient();

  return useMutation({
    mutationFn: (dataUri: string): Promise<AssetCaptureOut> => client.captureAssets(dataUri),
  });
}

/**
 * 목표를 만들고 고치고 접는 것, 모은 돈을 더하고 지우는 것이 화면을 맞추는 방법.
 *
 * 응답이 조회와 같은 모양인 쪽은 그대로 캐시에 넣는다. 게이지와 남은 금액이 왕복 없이
 * 그 자리에서 맞는다. 204 로 오는 쪽(접기·기여 지우기)은 넣을 값이 없어 다시 받는다.
 *
 * `moneyQueryKeys` 는 건드리지 않는다. 목표에 돈을 더해도 남은 예산은 달라지지 않는다.
 * 모은 돈은 거래가 아니라 목표 안에서만 세는 값이다.
 *
 * 다만 **생활비 제안은 함께 낡는다.** 제안액이 목표의 '매달 모을 돈' 을 빼서 나온 값이라,
 * 목표를 고치거나 접으면 관리 탭 카드가 옛 목표로 계산한 금액을 그대로 들고 있게 된다.
 *
 * **결산도 함께 낡는다.** 서버가 그 달 목표에 옮긴 돈을 잘한 것 하나로 세므로, 모은 돈을
 * 더하거나 지우면 결산 카드가 옛 금액을 그대로 들고 있게 된다. 결산 키는 리포트 아래라
 * `queryKeys.reports()` 하나로 함께 걸린다.
 */
function writeGoal(queryClient: QueryClient, state: GoalStateOut): void {
  queryClient.setQueryData<GoalStateOut>(queryKeys.goal(), state);
  void invalidateBudgetSuggestions(queryClient);
  void queryClient.invalidateQueries({ queryKey: queryKeys.reports() });
}

/**
 * 목표가 바뀌었으니 걸린 조회를 다시 받는다.
 *
 * **기다리지 않는다.** `onSuccess` 가 Promise 를 돌려주면 react-query 는 그것이 끝날
 * 때까지 `mutate()` 의 콜백을 미룬다. 그러면 지우기를 눌렀는데 시트가 서버 왕복 몇 번이
 * 끝날 때까지 열려 있다. `queryKeys.goal()` 아래에 지난 목표 조회까지 들어와 왕복이
 * 하나 더 늘면서 CI 에서 실제로 5초를 넘겼다.
 *
 * 화면은 그 사이 잠깐 옛 값을 보여 주는데, 지운 뒤 빈 상태로 바뀌는 것은 곧 도착한다.
 */
function invalidateGoal(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.goal() });
  void invalidateBudgetSuggestions(queryClient);
  void queryClient.invalidateQueries({ queryKey: queryKeys.reports() });
}

function invalidateBudgetSuggestions(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: queryKeys.budgetSuggestions() });
}

/** 목표 만들기. 진행 중인 목표가 이미 있으면 서버가 422 로 막는다. */
export function useCreateGoal() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: GoalCreate): Promise<GoalStateOut> => client.createGoal(body),
    onSuccess: (state) => writeGoal(queryClient, state),
  });
}

/** 목표 고치기. 보낸 필드만 바뀐다. `target_date: null` 은 기한을 지운다는 뜻이다. */
export function useUpdateGoal() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { goalId: string; body: GoalPatch }): Promise<GoalStateOut> =>
      client.updateGoal(input.goalId, input.body),
    onSuccess: (state) => writeGoal(queryClient, state),
  });
}

/**
 * 다 모은 목표를 마친다.
 *
 * 마친 목표는 지난 목표 목록으로 옮겨 가므로 그쪽도 함께 무효화한다. 빠뜨리면 방금 마친
 * 것이 「지난 목표」에 없어, 사라진 것으로 보인다.
 */
export function useFinishGoal() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (goalId: string): Promise<GoalStateOut> => client.finishGoal(goalId),
    onSuccess: (state) => {
      writeGoal(queryClient, state);
      void queryClient.invalidateQueries({ queryKey: queryKeys.goalHistory() });
    },
  });
}

/** 목표 접기. 204 라 돌려받는 값이 없어 다시 받아 빈 상태로 돌아간다. */
export function useDeleteGoal() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (goalId: string) => client.deleteGoal(goalId),
    onSuccess: () => invalidateGoal(queryClient),
  });
}

/** 모은 돈 더하기. 응답이 조회와 같은 모양이라 그대로 캐시에 넣는다. */
export function useAddGoalContribution() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { goalId: string; body: GoalContributionCreate }): Promise<GoalStateOut> =>
      client.addGoalContribution(input.goalId, input.body),
    onSuccess: (state) => writeGoal(queryClient, state),
  });
}

/** 모은 돈 한 줄 지우기. 204 라 다시 받아 맞춘다. */
export function useDeleteGoalContribution() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { goalId: string; contributionId: string }) =>
      client.deleteGoalContribution(input.goalId, input.contributionId),
    onSuccess: () => invalidateGoal(queryClient),
  });
}

/**
 * 태그 쓰기.
 *
 * 만들기·고치기 응답이 **목록 전체**라 캐시에 그대로 쓴다. 왕복 없이 칩이 바뀐다.
 * 지우기만 응답이 없어 무효화한다.
 */
function writeTags(queryClient: QueryClient, next: TagListOut): void {
  queryClient.setQueryData<TagListOut>(queryKeys.tags(), next);
}

export function useCreateTag() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: TagCreate) => client.createTag(body),
    onSuccess: (next) => writeTags(queryClient, next),
  });
}

export function useUpdateTag() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TagUpdate }) => client.updateTag(id, body),
    onSuccess: (next) => writeTags(queryClient, next),
  });
}

/**
 * 태그 지우기.
 *
 * 그 태그를 달아 둔 기록에서 태그만 떨어진다. 목록과 리포트가 함께 낡으므로 둘 다
 * 무효화한다. 리포트를 빼먹으면 이미 없는 태그의 조각이 링에 남는다.
 */
export function useDeleteTag() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => client.deleteTag(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tags() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.reports() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.transactionLists() });
    },
  });
}

/** 반복 지출 쓰기. 응답이 목록 전체라 캐시에 그대로 쓴다. */
function writeRecurring(queryClient: QueryClient, next: RecurringListOut): void {
  queryClient.setQueryData<RecurringListOut>(queryKeys.recurring(), next);
  // 「곧 나갈 돈」 은 목록이 아니라 판정 결과라 응답에 없다. 다시 물어야 한다.
  void queryClient.invalidateQueries({ queryKey: queryKeys.recurringDue() });
}

export function useCreateRecurring() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: RecurringCreate) => client.createRecurring(body),
    onSuccess: (next) => writeRecurring(queryClient, next),
  });
}

export function useUpdateRecurring() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RecurringUpdate }) =>
      client.updateRecurring(id, body),
    onSuccess: (next) => writeRecurring(queryClient, next),
  });
}

export function useDeleteRecurring() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => client.deleteRecurring(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.recurring() }),
  });
}

/**
 * 예고를 기록으로 옮긴다.
 *
 * 거래가 하나 생기므로 돈에 얽힌 캐시를 통째로 맞춘다(`moneyQueryKeys` 에 반복 지출도
 * 들어 있어 카드가 그 자리에서 사라진다).
 */
export function useRecordRecurring(params?: MonthParams) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => client.recordRecurring(id),
    onSuccess: (created) => {
      writeBudgetState(queryClient, created.budget, params);
      void invalidateMoney(queryClient);
    },
  });
}

export function useDismissRecurring() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => client.dismissRecurring(id),
    onSuccess: (next) => writeRecurring(queryClient, next),
  });
}

// ── 공유 가계부 ──────────────────────────────────────
//
// 쓰기가 성공하면 목록(`books`)과 그 가계부(`book(id)`) 아래를 다시 받는다. 가계부 하나 아래에
// 기록·리포트·정산이 있어 한 번에 걸린다. 무효화를 기다리지 않는다. 기다리면 버튼과 되돌리기
// 알림이 그 왕복만큼 늦게 뜬다. 쓰기가 성공할 때마다 잠깐 더 자주 다시 읽는다(`bookActivity`).

/** 목록 캐시에 가계부 하나를 넣거나 바꾼다. 목록이 아직 없으면 만들지 않는다. */
function upsertBookInList(queryClient: QueryClient, book: BookOut): void {
  queryClient.setQueryData<BookListOut>(queryKeys.books(), (prev) => {
    if (prev == null) return prev;
    const exists = prev.items.some((item) => item.id === book.id);
    return {
      items: exists
        ? prev.items.map((item) => (item.id === book.id ? book : item))
        : [book, ...prev.items],
    };
  });
}

/** 응답이 가계부 전체면 그대로 넣는다. 홈이 왕복 없이 새 이름·예산을 그린다. */
function writeBook(queryClient: QueryClient, book: BookOut): void {
  queryClient.setQueryData<BookOut>(queryKeys.book(book.id), book);
  upsertBookInList(queryClient, book);
}

function refreshBook(queryClient: QueryClient, bookId: string): void {
  markBookActivity();
  void queryClient.invalidateQueries({ queryKey: queryKeys.books() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.book(bookId) });
}

/** 가계부 만들기. 관리자 멤버, 기본 분류, 초대 링크가 함께 생긴다. */
export function useCreateBook() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: BookCreate) => client.createBook(body),
    onSuccess: (book) => {
      writeBook(queryClient, book);
      refreshBook(queryClient, book.id);
    },
  });
}

/**
 * 가계부 고치기. 이름·끝내기는 관리자만, 돈 나누기·예산은 멤버 누구나.
 *
 * 예산과 돈 나누기가 바뀌면 리포트와 정산도 함께 낡는다. 같은 뿌리라 한 번에 걸린다.
 */
export function useUpdateBook() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { bookId: string; body: BookUpdate }) =>
      client.updateBook(input.bookId, input.body),
    onSuccess: (book) => {
      writeBook(queryClient, book);
      refreshBook(queryClient, book.id);
    },
  });
}

/**
 * 가계부 지우기. 관리자만.
 *
 * 그 가계부 캐시는 지우지 않는다. 지운 화면이 아직 떠 있는 동안 다시 받으면 404 가 화면에
 * 한 번 비친다. 목록만 다시 받고, 떠난 화면의 캐시는 시간이 지나 저절로 비워진다.
 */
export function useDeleteBook() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookId: string) => client.deleteBook(bookId),
    onSuccess: () => {
      markBookActivity();
      void queryClient.invalidateQueries({ queryKey: queryKeys.books() });
    },
  });
}

/** 지운 가계부 되살리기. 「가계부를 지웠어요」 알림의 되돌리기가 부른다. */
export function useRestoreBook() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookId: string) => client.restoreBook(bookId),
    onSuccess: (book) => {
      writeBook(queryClient, book);
      refreshBook(queryClient, book.id);
    },
  });
}

/**
 * 새 초대 링크. 앞 링크는 서버가 닫는다.
 *
 * 응답을 그 가계부 캐시의 `invite` 에 바로 넣는다. 설정 화면의 「링크는 ~까지 쓸 수 있어요」 가
 * 왕복 없이 새 날짜가 된다.
 */
export function useCreateInvite() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookId: string): Promise<BookInviteOut> => client.createInvite(bookId),
    onSuccess: (invite, bookId) => {
      queryClient.setQueryData<BookOut>(queryKeys.book(bookId), (prev) =>
        prev == null ? prev : { ...prev, invite },
      );
      queryClient.setQueryData<BookListOut>(queryKeys.books(), (prev) =>
        prev == null
          ? prev
          : { items: prev.items.map((item) => (item.id === bookId ? { ...item, invite } : item)) },
      );
    },
  });
}

/** 초대받아 들어가기. 이미 멤버면 서버가 같은 가계부를 돌려준다. */
export function useJoinBook() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { code: string; name: string }) =>
      client.joinBook(input.code, { name: input.name }),
    onSuccess: (book, input) => {
      writeBook(queryClient, book);
      refreshBook(queryClient, book.id);
      // 떠 있는 초대 화면은 다시 받지 않는다. 받으면 「이미 같이 쓰고 있어요」 로 바뀌어 버린다.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.invite(input.code),
        refetchType: 'none',
      });
    },
  });
}

/**
 * 가계부에서 나가기. 그 가계부는 더 못 읽으므로 목록만 다시 받는다.
 * 떠난 화면이 아직 떠 있는 동안 404 가 비치지 않게 그 가계부는 건드리지 않는다.
 */
export function useLeaveBook() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookId: string) => client.leaveBook(bookId),
    onSuccess: () => {
      markBookActivity();
      void queryClient.invalidateQueries({ queryKey: queryKeys.books() });
    },
  });
}

/** 멤버 내보내기. 관리자만, 자기 자신은 안 된다. 그 멤버가 적은 기록은 남는다. */
export function useRemoveMember() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { bookId: string; memberId: string }) =>
      client.removeMember(input.bookId, input.memberId),
    onSuccess: (_, input) => refreshBook(queryClient, input.bookId),
  });
}

/**
 * 공유 기록 저장.
 *
 * 응답에 그 달의 쓴 돈과 남은 예산이 함께 온다. 저장 뒤 화면은 그 값으로 말하고, 목록과
 * 리포트는 뒤에서 다시 받는다.
 */
export function useCreateBookEntry() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { bookId: string; body: BookEntryCreate }) =>
      client.createBookEntry(input.bookId, input.body),
    onSuccess: (_, input) => refreshBook(queryClient, input.bookId),
  });
}

/** 공유 기록 고치기. 보낸 필드만 바뀐다. 금액과 날짜에 null 을 보내면 서버가 막는다. */
export function useUpdateBookEntry() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { bookId: string; entryId: string; body: BookEntryUpdate }) =>
      client.updateBookEntry(input.bookId, input.entryId, input.body),
    onSuccess: (_, input) => refreshBook(queryClient, input.bookId),
  });
}

/** 공유 기록 지우기. 적은 사람이나 관리자만. 표시만 지워 되돌릴 수 있다. */
export function useDeleteBookEntry() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { bookId: string; entryId: string }) =>
      client.deleteBookEntry(input.bookId, input.entryId),
    onSuccess: (_, input) => refreshBook(queryClient, input.bookId),
  });
}

/** 지운 공유 기록 되살리기. 「지웠어요」 알림의 되돌리기가 부른다. */
export function useRestoreBookEntry() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { bookId: string; entryId: string }) =>
      client.restoreBookEntry(input.bookId, input.entryId),
    onSuccess: (_, input) => refreshBook(queryClient, input.bookId),
  });
}

/**
 * 공유 기록을 내 가계부로 옮긴다. 적은 사람만.
 *
 * 내 가계부에 거래가 하나 생기므로 개인 쪽 돈 캐시도 함께 다시 받는다.
 */
export function useMoveEntryOut() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { bookId: string; entryId: string; categoryId?: string | null }) =>
      client.moveEntryOut(
        input.bookId,
        input.entryId,
        input.categoryId == null ? undefined : { category_id: input.categoryId },
      ),
    onSuccess: (_, input) => {
      refreshBook(queryClient, input.bookId);
      void invalidateMoney(queryClient);
    },
  });
}

/**
 * 내 지출 하나를 공유 가계부로 옮긴다.
 *
 * 내 거래가 지워지므로 개인 쪽 돈 캐시도 함께 다시 받는다.
 */
export function useMoveEntryIn() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { bookId: string; transactionId: string; categoryId?: string | null }) =>
      client.moveEntryIn(input.bookId, {
        transaction_id: input.transactionId,
        category_id: input.categoryId ?? null,
      }),
    onSuccess: (_, input) => {
      refreshBook(queryClient, input.bookId);
      void invalidateMoney(queryClient);
    },
  });
}

/**
 * 공유 가계부로 옮긴 것 되돌리기. 원래 내 거래가 태그·결제 수단째 살아난다.
 * 옮기기와 같이 가계부와 개인 쪽 돈 캐시를 함께 다시 받는다.
 */
export function useUndoMoveIn() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { bookId: string; entryId: string }) =>
      client.undoMoveIn(input.bookId, input.entryId),
    onSuccess: (_, input) => {
      refreshBook(queryClient, input.bookId);
      void invalidateMoney(queryClient);
    },
  });
}

/**
 * 내 가계부로 옮긴 것 되돌리기. 공유 기록이 낸 사람·분류째 살아나고 그때 생긴 거래는 지워진다.
 */
export function useUndoMoveOut() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { bookId: string; entryId: string }) =>
      client.undoMoveOut(input.bookId, input.entryId),
    onSuccess: (_, input) => {
      refreshBook(queryClient, input.bookId);
      void invalidateMoney(queryClient);
    },
  });
}

/** 새 분류를 「기타」 바로 앞에 끼운다. 서버가 세우는 자리와 같다. */
function withCategory(categories: BookCategoryOut[], created: BookCategoryOut): BookCategoryOut[] {
  const rest = categories.filter((row) => row.id !== created.id);
  const at = rest.findIndex((row) => row.name === '기타');
  return at < 0 ? [...rest, created] : [...rest.slice(0, at), created, ...rest.slice(at)];
}

/**
 * 공유 분류 만들기. 멤버 모두에게 보인다.
 *
 * 응답을 가계부 캐시에 바로 끼워 넣는다. 만들기 창을 닫자마자 격자에 새 분류가 서 있어야 한다.
 */
export function useCreateBookCategory() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { bookId: string; name: string; iconKey: string }) =>
      client.createBookCategory(input.bookId, { name: input.name, icon_key: input.iconKey }),
    onSuccess: (created, input) => {
      const insert = (book: BookOut): BookOut => ({
        ...book,
        categories: withCategory(book.categories, created),
      });
      queryClient.setQueryData<BookOut>(queryKeys.book(input.bookId), (prev) =>
        prev == null ? prev : insert(prev),
      );
      queryClient.setQueryData<BookListOut>(queryKeys.books(), (prev) =>
        prev == null
          ? prev
          : { ...prev, items: prev.items.map((b) => (b.id === input.bookId ? insert(b) : b)) },
      );
      refreshBook(queryClient, input.bookId);
    },
  });
}

/** 응답이 말하는 기간(`'2026-09'`·`'all'`)을 캐시 키 조각으로 되돌린다. */
function periodOf(settlement: SettlementOut): SettlementPeriod | null {
  if (settlement.period === 'all') return 'all';
  const [year, month] = settlement.period.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  return { year, month };
}

/** 정산 응답을 그 기간 캐시에 넣는다. 캐시가 아직 없으면 만들지 않는다. */
function writeSettlement(
  queryClient: QueryClient,
  bookId: string,
  settlement: SettlementOut,
): void {
  const period = periodOf(settlement);
  if (period == null) return;
  queryClient.setQueryData<SettlementOut>(queryKeys.bookSettlement(bookId, period), (prev) =>
    prev == null ? prev : settlement,
  );
}

/** 정산 끝내기. 여행 가계부는 달을 보지 않고 기간 전체를 끝낸다. */
export function useSettleDone() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { bookId: string; year: number; month: number }) =>
      client.markSettlementDone(input.bookId, { year: input.year, month: input.month }),
    onSuccess: (settlement, input) => {
      writeSettlement(queryClient, input.bookId, settlement);
      refreshBook(queryClient, input.bookId);
    },
  });
}

/** 끝낸 정산 되돌리기. 여행 가계부는 `'all'` 을 넘긴다. */
export function useSettleUndo() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { bookId: string; period?: SettlementPeriod }) =>
      client.undoSettlementDone(input.bookId, input.period),
    onSuccess: (settlement, input) => {
      writeSettlement(queryClient, input.bookId, settlement);
      refreshBook(queryClient, input.bookId);
    },
  });
}
