/**
 * queryKey 규약을 한 곳에 모은다.
 *
 * 거래를 하나 저장하면 예산·요약·목록이 한꺼번에 낡는다. 무효화 대상이 feature 경계를
 * 넘으므로 키를 각자 만들면 반드시 어긋난다.
 *
 * 모양은 `['pocket', <자원>, <달>]` 이다. 앞부분만 넘기면 그 아래가 전부 걸린다.
 */

import type { BudgetSuggestionParams, MonthParams, TransactionListParams } from './client';

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

  /**
   * 기록 알림 설정. 달과 무관하다.
   *
   * `moneyQueryKeys` 에 넣지 않는다. 거래를 저장해도 알림 시각은 달라지지 않는다.
   * 앱 설정과 따로 두는 이유는 알림 화면 하나만 이 값을 읽기 때문이다. 함께 묶으면
   * 홈이 설정을 받을 때마다 안 쓸 알림 값까지 받는다.
   */
  notificationSettings: () => [ROOT, 'notification-settings'] as const,

  /**
   * 자산 목록과 순자산. 달과 무관하다.
   *
   * `moneyQueryKeys` 에 **일부러** 넣지 않는다. 거래를 저장해도 자산은 달라지지 않고,
   * 자산을 고쳐도 남은 예산은 달라지지 않는다. 순자산은 그 둘과 다른 개념이다.
   */
  assets: () => [ROOT, 'assets'] as const,

  /**
   * 진행 중인 목표 하나. 달과 무관하다.
   *
   * 자산과 같은 이유로 `moneyQueryKeys` 에 넣지 않는다. 거래를 저장해도 목표는 달라지지
   * 않고, 목표에 돈을 더해도 남은 예산은 달라지지 않는다. 모은 돈은 거래가 아니다.
   */
  goal: () => [ROOT, 'goal'] as const,

  /** 달을 가리지 않는 예산 전부. 무효화할 때 쓴다. 아래 제안까지 함께 걸린다. */
  budgets: () => [ROOT, 'budget'] as const,
  budget: (params?: MonthParams) => [ROOT, 'budget', monthPart(params)] as const,

  /** 달을 가리지 않는 생활비 제안 전부. 목표를 고치면 이 아래를 무효화한다. */
  budgetSuggestions: () => [ROOT, 'budget', 'suggestion'] as const,
  /**
   * 목표 기반 생활비 제안.
   *
   * 화면에서 고친 실수령·고정비가 키에 들어간다. 빼면 값을 고쳐도 같은 자리를 보아
   * 옛 제안액이 그대로 남는다. 계산은 서버가 하므로 값이 바뀌면 다시 물어야 한다.
   */
  budgetSuggestion: (params?: BudgetSuggestionParams) =>
    [
      ROOT,
      'budget',
      'suggestion',
      monthPart(
        params?.year != null && params.month != null
          ? { year: params.year, month: params.month }
          : undefined,
      ),
      params?.takeHome ?? '',
      params?.fixedCosts ?? '',
    ] as const,

  summaries: () => [ROOT, 'summary'] as const,
  summary: (params?: MonthParams) => [ROOT, 'summary', monthPart(params)] as const,

  reports: () => [ROOT, 'report'] as const,
  report: (params?: MonthParams) => [ROOT, 'report', monthPart(params)] as const,

  /**
   * 그 달의 결산.
   *
   * 리포트 아래에 둔다. 지난달 거래를 하나 고치면 그 달 결산도 함께 낡으므로,
   * `queryKeys.reports()` 무효화에 같이 걸려야 한다.
   */
  closing: (params?: MonthParams) => [ROOT, 'report', 'closing', monthPart(params)] as const,

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
    // 리포트도 거래를 세는 화면이다. 빼면 저장 뒤 리포트만 옛 숫자를 보여준다.
    queryKeys.reports(),
  ];
}
