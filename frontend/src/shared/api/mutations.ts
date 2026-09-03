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
  PeriodSummaryOut,
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
      return invalidateMoney(queryClient);
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

/** 예산 저장. 응답이 조회와 같은 모양이라 그대로 캐시에 넣는다. */
export function useSaveBudget(params?: MonthParams) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: BudgetUpsert) => client.saveBudget(body, params),
    onSuccess: (budget) => {
      // 조회와 같은 모양이라 통째로 넣는다. 요약 쪽은 예산 블록만 갈아 끼우면 된다.
      queryClient.setQueryData<BudgetOut>(queryKeys.budget(params), budget);
      writeBudgetState(queryClient, budget.budget, params);
      return invalidateMoney(queryClient);
    },
  });
}
