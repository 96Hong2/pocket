/**
 * 저장 응답의 피드백을 읽기 전에 확인해야 하는 것.
 *
 * 문장 조립은 화면 몫이라 여기 없다. 여기 있는 것은 "이 응답의 숫자를 믿어도 되는가" 하나다.
 */

import type { BudgetStateOut, FeedbackOut } from './types';

export interface FeedbackResult {
  feedback: FeedbackOut;
  budget?: BudgetStateOut | null;
}

/**
 * 저장은 됐는데 그 뒤 판정이 실패해 서버가 흡수한 응답인지 본다.
 *
 * 그때 `kind` 는 `month_fact` 로 떨어지고 숫자 필드가 전부 비며 `budget` 블록도 없다.
 * 예산을 정하지 않은 정상 `month_fact` 와는 `month_expense` 에 숫자가 있느냐로 갈린다.
 *
 * 이 조합에서 값을 그대로 화면이나 캐시에 넣으면 멀쩡하던 숫자가 빈다.
 * 저장은 성공한 것이므로 되돌리지 말고 요약을 다시 받아 채운다.
 */
export function isFeedbackFallback(result: FeedbackResult): boolean {
  return (
    result.budget == null &&
    result.feedback.kind === 'month_fact' &&
    result.feedback.month_expense == null
  );
}
