/**
 * 백엔드와 이야기하는 유일한 창구.
 *
 * 화면은 여기서만 가져다 쓴다. `fetch` 를 직접 부르거나 경로 문자열을 적지 않는다.
 * 타입 정본은 `docs/openapi.json` 이고, `schema.gen.ts` 가 거기서 뽑은 것이다.
 */

export { resolveApiBaseUrl, API_BASE_URL_ENV } from './baseUrl';
export {
  BOOK_ACTIVE_WINDOW_MS,
  BOOK_POLL_FAST_MS,
  BOOK_POLL_SLOW_MS,
  bookRefetchInterval,
  markBookActivity,
} from './bookActivity';
export { createApiClient } from './client';
export type {
  AnalyzeTarget,
  ApiClient,
  BudgetSuggestionParams,
  CallOptions,
  CategoryReportParams,
  MonthParams,
  SettlementPeriod,
  TransactionListParams,
} from './client';
export { ApiContext, useApi, useApiClient, useApiReady } from './context';
export type { ApiContextValue } from './context';
export { parseDecimal, parseDecimalOr } from './decimal';
export { ApiError, apiErrorMessage, CLIENT_ERROR_CODES, parseErrorEnvelope } from './errors';
export type { ApiErrorCode, ApiErrorInit, ClientErrorCode, ParsedErrorBody } from './errors';
export { moneyQueryKeys, queryKeys } from './queryKeys';
export {
  useAssetAnalysis,
  useAssetHistory,
  useAssets,
  useBook,
  useBookEntries,
  useBookReport,
  useBooks,
  useBookSettlement,
  useBudget,
  useBudgetSuggestion,
  useCalendar,
  useCategories,
  useCategoryReport,
  useClosing,
  useCurrentPeriod,
  useGoal,
  useGoalHistory,
  useInvitePreview,
  useMe,
  useMerchantRules,
  useMonthStartDay,
  useNotificationSettings,
  usePreferences,
  useRecurring,
  useRecurringDue,
  useSharedBooksEnabled,
  useTags,
  useMonthlyReport,
  useSummary,
  useFetchTransaction,
  useTransactionPages,
  useTransactions,
} from './queries';
export type { BookQueryOptions } from './queries';
export {
  useAddGoalContribution,
  useAnalyzeImage,
  useAnalyzeText,
  useCommitImport,
  useCreateBook,
  useCreateBookCategory,
  useCreateBookEntry,
  useCreateCategory,
  useCreateGoal,
  useCreateInvite,
  useCreateMerchantRule,
  useCreateRecurring,
  useCreateTag,
  useCreateTransaction,
  useDeleteBook,
  useDeleteBookEntry,
  useDeleteBudget,
  useDeleteCategory,
  useDeleteCategoryBudget,
  useDeleteGoal,
  useDeleteGoalContribution,
  useFinishGoal,
  useDeleteImport,
  useDeleteMerchantRule,
  useDeleteRecurring,
  useDeleteTag,
  useDeleteTransaction,
  useDismissRecurring,
  useJoinBook,
  useLeaveBook,
  useMoveEntryIn,
  useMoveEntryOut,
  useRecordRecurring,
  usePatchImportCandidate,
  useRemoveMember,
  useResetAccountData,
  useRestoreBook,
  useRestoreBookEntry,
  useCaptureAssets,
  useCaptureAssetsText,
  useCheckinAssets,
  useSaveAssets,
  useSaveProfile,
  useSettleDone,
  useSettleUndo,
  useStartEmailLogin,
  useUndoMoveIn,
  useUndoMoveOut,
  useVerifyEmailLogin,
  useSaveBudget,
  useSaveCategoryBudget,
  useSaveCategoryOrder,
  useSaveNotificationSettings,
  useSavePreferences,
  useUpdateBook,
  useUpdateBookEntry,
  useUpdateCategory,
  useUpdateGoal,
  useUpdateRecurring,
  useUpdateTag,
  useUpdateTransaction,
} from './mutations';
export { createTransport } from './transport';
export type {
  AnonKeyState,
  QueryParams,
  RequestSpec,
  Transport,
  TransportOptions,
} from './transport';
export type * from './types';
