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

import type { MonthParams } from './client';
import { useApiClient } from './context';
import { moneyQueryKeys, queryKeys } from './queryKeys';
import type {
  BudgetOut,
  BudgetStateOut,
  BudgetUpsert,
  CategoryCreate,
  CategoryUpdate,
  PeriodSummaryOut,
  PreferencesOut,
  ImportBatchOut,
  ImportCandidatePatch,
  ImportCommitOut,
  PreferencesPatch,
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

  queryClient.setQueryData<BudgetOut>(queryKeys.budget(params), (prev) =>
    prev == null ? prev : { ...prev, budget: next },
  );
  queryClient.setQueryData<PeriodSummaryOut>(queryKeys.summary(params), (prev) =>
    prev == null ? prev : { ...prev, budget: next },
  );
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
      return invalidateMoney(queryClient);
    },
  });
}

/**
 * 되돌리기.
 *
 * 204 라 돌려받는 값이 없다. 홈 숫자를 되돌리려면 다시 받는 수밖에 없다.
 * 무효화가 끝날 때까지 `isPending` 이 유지되므로, 버튼이 먼저 사라지고 숫자가 나중에 바뀌는 일이 없다.
 */
export function useUndoTransaction() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (transactionId: string) => client.undoTransaction(transactionId),
    onSuccess: () => invalidateMoney(queryClient),
  });
}

/**
 * 거래 삭제.
 *
 * 되돌리기와 다르다. 되돌리기는 저장 직후 짧은 시간에만 되고, 이건 수정 시트에서 언제든 된다.
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
 * 셋 다 무효화한다. 기억한 분류를 빼먹으면 관리 탭에 이미 없는 규칙 줄이 남고,
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
 * 줄글 분석.
 *
 * 여기서는 캐시를 건드리지 않는다. 분석은 아직 거래를 만들지 않아 돈이 움직이지 않는다.
 */
export function useAnalyzeText() {
  const client = useApiClient();

  return useMutation({
    mutationFn: (text: string) => client.analyzeText(text),
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
    mutationFn: (dataUri: string): Promise<ImportBatchOut> =>
      kind === 'receipt' ? client.analyzeReceipt(dataUri) : client.analyzeCapture(dataUri),
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
 */
export function useCommitImport() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (batchId: string): Promise<ImportCommitOut> => client.commitImport(batchId),
    onSuccess: () => {
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

/** 기억한 분류 지우기. 다음 분석부터 그 상호는 다시 모델이 정한다. */
export function useDeleteMerchantRule() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ruleId: string) => client.deleteMerchantRule(ruleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.merchantRules() }),
  });
}
