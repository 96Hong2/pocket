/**
 * 저장 직후 보여줄 문장을 만든다.
 *
 * 서버는 판정 종류(`kind`)와 숫자만 준다. 문장은 여기서 조립한다.
 * 숫자를 새로 만들지 않는다. 받은 값을 표기만 바꿔 끼운다.
 *
 * 값이 하나도 없는 응답이 정상적으로 온다. 저장은 됐는데 그 뒤 판정이 실패하면
 * 서버가 그것을 흡수해 `month_fact` + 전부 null 로 돌려준다. 그때도 문장은 나와야 한다.
 */

import { parseDecimal, type FeedbackOut } from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';

/**
 * 사용자를 탓하는 말은 쓰지 않는다.
 * 정본은 백엔드 `app/domain/feedback.py` 의 `FORBIDDEN_WORDS` 다.
 */
export const FORBIDDEN_WORDS = ['과소비', '낭비', '실패', '벌써', '또', '망함'] as const;

/** `또는`·`또한` 은 접속사라 걸지 않는다. 백엔드 판정과 같은 규칙이다. */
const WORD_PATTERNS: Record<string, RegExp> = { 또: /또(?!는|한)/ };

export function findForbiddenWords(text: string): string[] {
  return FORBIDDEN_WORDS.filter((word) => {
    const pattern = WORD_PATTERNS[word];
    return pattern ? pattern.test(text) : text.includes(word);
  });
}

export interface FeedbackMessage {
  /** 카드 위 작은 배지. 없을 수도 있다. */
  badge?: string;
  /** 항상 한 줄은 나온다. */
  headline: string;
  /** 숫자가 있을 때만 붙는 둘째 줄. */
  detail?: string;
  /** 카드 색. 지금 조심할 것이 있을 때만 caution. */
  tone: 'calm' | 'caution';
}

export interface FeedbackMessageOptions {
  /** 카테고리 예산을 넘겼을 때 그 카테고리 이름. 모르면 넘기지 않는다. */
  overCategoryName?: string;
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

  return {
    badge: '예산 초과',
    tone: 'caution',
    headline,
    detail:
      feedback.remaining_days != null
        ? `남은 ${feedback.remaining_days}일은 조금 천천히 가도 괜찮아요.`
        : undefined,
  };
}

function paceWarning(feedback: FeedbackOut): FeedbackMessage {
  const projected = won(feedback.projected_month_end);
  const daily = won(feedback.daily_allowance);
  const remaining = won(feedback.remaining_budget);

  let detail: string | undefined;
  if (feedback.remaining_days != null && daily) {
    detail = `남은 ${feedback.remaining_days}일 하루 ${daily}이면 예산 안에서 지낼 수 있어요.`;
  } else if (remaining) {
    detail = `남은 예산은 ${remaining}이에요.`;
  }

  return {
    badge: '주의',
    tone: 'caution',
    headline: projected
      ? `지금 속도면 이번 달 ${projected}쯤 쓰게 돼요.`
      : '지금 속도가 예산보다 조금 빨라요.',
    detail,
  };
}

function largeExpense(feedback: FeedbackOut): FeedbackMessage {
  const saved = won(feedback.saved_amount);
  const remaining = won(feedback.remaining_budget);
  const month = won(feedback.month_expense);

  let detail: string | undefined;
  if (remaining) detail = `이번 달 남은 예산은 ${remaining}이에요.`;
  else if (month) detail = `이번 달 쓴 돈은 ${month}이에요.`;

  return {
    tone: 'calm',
    headline: saved ? `${saved}, 평소보다 큰 지출이에요.` : '평소보다 큰 지출이에요.',
    detail,
  };
}

function achievement(feedback: FeedbackOut): FeedbackMessage {
  const remaining = won(feedback.remaining_budget);
  const month = won(feedback.month_expense);

  let detail: string | undefined;
  if (remaining) detail = `이번 달 남은 예산은 ${remaining}이에요.`;
  else if (month) detail = `이번 달 쓴 돈은 ${month}이에요.`;

  return {
    badge: '잘 하고 있어요',
    tone: 'calm',
    headline: '계획대로 잘 가고 있어요.',
    detail,
  };
}

function onTrack(feedback: FeedbackOut): FeedbackMessage {
  const remaining = won(feedback.remaining_budget);
  const daily = won(feedback.daily_allowance);

  return {
    tone: 'calm',
    headline: remaining ? `남은 예산은 ${remaining}이에요.` : '잘 기록했어요.',
    detail:
      feedback.remaining_days != null && daily
        ? `남은 ${feedback.remaining_days}일 동안 하루 ${daily}씩 쓸 수 있어요.`
        : undefined,
  };
}

function monthFact(feedback: FeedbackOut): FeedbackMessage {
  const month = won(feedback.month_expense);

  return {
    tone: 'calm',
    headline: month ? `이번 달 ${month} 썼어요.` : '기록했어요.',
    detail: month ? undefined : '지금 상태는 홈에서 볼 수 있어요.',
  };
}

export function buildFeedbackMessage(
  feedback: FeedbackOut,
  options: FeedbackMessageOptions = {},
): FeedbackMessage {
  switch (feedback.kind) {
    case 'over_budget':
      return overBudget(feedback, options);
    case 'pace_warning':
      return paceWarning(feedback);
    case 'large_expense':
      return largeExpense(feedback);
    case 'achievement':
      return achievement(feedback);
    case 'on_track':
      return onTrack(feedback);
    case 'month_fact':
      return monthFact(feedback);
    default: {
      // 서버가 kind 를 하나 늘렸을 때다. 여기서 undefined 를 돌려주면 저장 직후
      // 앱 전체가 크래시 화면으로 떨어진다. 사실만 말하는 문장으로 내려앉힌다.
      // 소진 검사는 남겨 둔다. 값을 늘리면 타입 검사가 이 자리를 가리킨다.
      const unknown: never = feedback.kind;
      void unknown;
      return monthFact(feedback);
    }
  }
}
