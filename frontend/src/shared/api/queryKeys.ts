/**
 * queryKey 규약을 한 곳에 모은다.
 *
 * 거래를 하나 저장하면 예산·요약·목록이 한꺼번에 낡는다. 무효화 대상이 feature 경계를
 * 넘으므로 키를 각자 만들면 반드시 어긋난다.
 *
 * 모양은 `['pocket', <자원>, <달>]` 이다. 앞부분만 넘기면 그 아래가 전부 걸린다.
 */

import type { MonthParams, TransactionListParams } from './client';

const ROOT = 'pocket';

/**
 * 달을 키 한 조각으로 만든다.
 *
 * 달을 안 넘기면 서버가 사용자 시간대의 이번 달로 정하므로 `'current'` 로 둔다.
 * 같은 달을 `'current'` 와 `'2026-09'` 두 가지로 부르면 캐시가 두 벌이 된다.
 * 화면 하나는 한 가지 방식만 쓴다.
 */
function monthPart(params?: MonthParams): string {
  if (params == null) return 'current';
  return `${params.year}-${String(params.month).padStart(2, '0')}`;
}

export const queryKeys = {
  /** 이 앱이 만든 캐시 전부. */
  all: () => [ROOT] as const,

  categories: () => [ROOT, 'categories'] as const,

  /** 기억한 분류 규칙. 달과 무관하다. */
  merchantRules: () => [ROOT, 'merchant-rules'] as const,

  /** 앱 설정. 달과 무관하다. */
  preferences: () => [ROOT, 'preferences'] as const,

  /** 달을 가리지 않는 예산 전부. 무효화할 때 쓴다. */
  budgets: () => [ROOT, 'budget'] as const,
  budget: (params?: MonthParams) => [ROOT, 'budget', monthPart(params)] as const,

  summaries: () => [ROOT, 'summary'] as const,
  summary: (params?: MonthParams) => [ROOT, 'summary', monthPart(params)] as const,

  calendars: () => [ROOT, 'calendar'] as const,
  calendar: (params?: MonthParams) => [ROOT, 'calendar', monthPart(params)] as const,

  transactionLists: () => [ROOT, 'transactions'] as const,
  transactions: (params?: TransactionListParams) =>
    [
      ROOT,
      'transactions',
      monthPart(
        params?.year != null && params.month != null
          ? { year: params.year, month: params.month }
          : undefined,
      ),
      params?.limit ?? 'default',
      // 날짜와 검색어가 키에 없으면 하루 목록과 검색 결과가 같은 자리를 서로 덮는다.
      params?.day ?? '',
      params?.q ?? '',
    ] as const,
};

/**
 * 거래를 저장·수정·삭제·되돌리기 했을 때 다시 맞춰야 하는 것들.
 *
 * 카테고리는 여기 없다. 거래를 저장해도 카테고리 목록은 달라지지 않는다.
 */
export function moneyQueryKeys(): ReadonlyArray<readonly string[]> {
  return [
    queryKeys.budgets(),
    queryKeys.summaries(),
    queryKeys.transactionLists(),
    queryKeys.calendars(),
  ];
}
