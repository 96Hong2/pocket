/**
 * 백엔드와 이야기하는 유일한 창구.
 *
 * 화면은 여기서만 가져다 쓴다. `fetch` 를 직접 부르거나 경로 문자열을 적지 않는다.
 * 타입 정본은 `docs/openapi.json` 이고, `schema.gen.ts` 가 거기서 뽑은 것이다.
 */

export { resolveApiBaseUrl, API_BASE_URL_ENV } from './baseUrl';
export { createApiClient } from './client';
export type { ApiClient, CallOptions, MonthParams, TransactionListParams } from './client';
export { ApiContext, useApi, useApiClient, useApiReady } from './context';
export type { ApiContextValue } from './context';
export { parseDecimal, parseDecimalOr } from './decimal';
export { ApiError, apiErrorMessage, CLIENT_ERROR_CODES, parseErrorEnvelope } from './errors';
export type { ApiErrorCode, ApiErrorInit, ClientErrorCode, ParsedErrorBody } from './errors';
export { moneyQueryKeys, queryKeys } from './queryKeys';
export {
  useBudget,
  useCalendar,
  useCategories,
  useSummary,
  useTransactionPages,
  useTransactions,
} from './queries';
export {
  useCreateTransaction,
  useDeleteTransaction,
  useSaveBudget,
  useUndoTransaction,
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
