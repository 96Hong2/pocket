/**
 * 저장 뒤 화면에 붙는 판정 한 줄.
 *
 * **예산을 넘었을 때만 말한다.** 남은 예산, 속도, 큰 지출, 성취 문장은 걷었다. 저장 뒤
 * 화면은 「어디에 적혔나」 가 주인공이고, 남은 돈은 홈이 늘 들고 있다. 넘은 것은 사실 경고라
 * 그 자리에서 한 번 알린다.
 *
 * 서버는 판정 종류(`kind`)와 숫자를 지금처럼 준다(옛 번들이 그 문장을 쓴다). 문장은 여기서
 * 조립하고, 숫자를 새로 만들지 않는다.
 */

import { parseDecimal, type FeedbackOut } from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';

/**
 * 사용자를 탓하는 말은 쓰지 않는다.
 *
 * 목록과 판정은 `shared/lib/forbiddenWords` 에 있다. 결산 문구와 e2e 도 같은 것을 본다.
 * 여기서 다시 내보내는 것은 저장 직후 피드백을 다루는 자리에서 함께 읽히게 하려는 것뿐이다.
 */
export { FORBIDDEN_WORDS, findForbiddenWords } from '../../shared/lib/forbiddenWords';

export interface FeedbackMessage {
  /** 줄 앞 작은 배지. */
  badge: string;
  headline: string;
}

export interface FeedbackMessageOptions {
  /** 카테고리 예산을 넘겼을 때 그 카테고리 이름. 모르면 넘기지 않는다. */
  overCategoryName?: string;
  /** 방금 저장한 것이 수입이면 그 금액. 들어온 돈에 예산 경고를 붙이지 않는다. */
  savedIncome?: number;
}

/** 금액 문자열을 `12,000원` 으로. 값이 없으면 null 이라 문장에서 통째로 빠진다. */
function won(value: string | null | undefined): string | null {
  const parsed = parseDecimal(value);
  return parsed == null ? null : formatCurrency(parsed);
}

function overBudget(feedback: FeedbackOut, options: FeedbackMessageOptions): FeedbackMessage {
  const over = won(feedback.over_amount);
  const name = feedback.over_category_id ? options.overCategoryName : undefined;

  let headline = '이번 달 예산을 넘었어요.';
  if (name && over) headline = `${name}에서 예산을 ${over} 넘었어요.`;
  else if (name) headline = `${name}에서 예산을 넘었어요.`;
  else if (over) headline = `이번 달 예산을 ${over} 넘었어요.`;

  return { badge: '예산 초과', headline };
}

/** 예산을 넘은 지출이면 그 한 줄, 아니면 null(아무 줄도 안 세운다). */
export function buildFeedbackMessage(
  feedback: FeedbackOut,
  options: FeedbackMessageOptions = {},
): FeedbackMessage | null {
  if (options.savedIncome != null) return null;
  return feedback.kind === 'over_budget' ? overBudget(feedback, options) : null;
}
