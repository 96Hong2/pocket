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
 *
 * 목록과 판정은 `shared/lib/forbiddenWords` 에 있다. 결산 문구와 e2e 도 같은 것을 본다.
 * 여기서 다시 내보내는 것은 저장 직후 피드백을 다루는 자리에서 함께 읽히게 하려는 것뿐이다.
 */
export { FORBIDDEN_WORDS, findForbiddenWords } from '../../shared/lib/forbiddenWords';

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
  /** 방금 저장한 것이 수입이면 그 금액. 지출 판정 문장을 그대로 쓰면 안 된다. */
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

  return { badge: '예산 초과', tone: 'caution', headline };
}

/**
 * 속도가 예산보다 빠를 때.
 *
 * 달 말 예상액도, 남은 날 수도 앞세우지 않는다. 예상액은 며칠치로 남은 달 전체를 늘린
 * 값이라 초반일수록 크게 튀고, 남은 날 수는 적을 때마다 시간을 세게 만든다.
 * 지금 얼마 남았는지 한 줄이면 된다. 판정 자체는 서버가 그대로 하고 홈이 쓴다.
 */
function paceWarning(feedback: FeedbackOut): FeedbackMessage {
  const remaining = won(feedback.remaining_budget);
  return {
    tone: 'calm',
    headline: remaining ? `남은 예산은 ${remaining}이에요.` : '잘 기록했어요.',
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

/**
 * 성취 한 줄.
 *
 * 서버가 **무엇을 보고 성취라고 했는지**를 함께 준다. 셋이 서로 다른 사실이라
 * 같은 문장을 쓰면 근거 없는 칭찬과 구분되지 않는다. 근거를 안 주면 아무 말도 안 한다.
 */
function achievementHeadline(feedback: FeedbackOut): string | null {
  switch (feedback.achievement_kind) {
    case 'weekly_decrease': {
      const less = won(feedback.achievement_decreased_amount);
      return less ? `지난주 같은 기간보다 ${less} 덜 썼어요.` : '지난주 같은 기간보다 덜 썼어요.';
    }
    case 'no_spend_streak': {
      const days = feedback.achievement_no_spend_days;
      return days != null && days > 0 ? `${days}일 연속 안 쓴 날이에요.` : null;
    }
    case 'projected_within_budget':
      return '이 속도면 이번 달 예산 안에서 끝나요.';
    default:
      return null;
  }
}

function achievement(feedback: FeedbackOut): FeedbackMessage {
  const remaining = won(feedback.remaining_budget);
  const month = won(feedback.month_expense);

  let detail: string | undefined;
  if (remaining) detail = `이번 달 남은 예산은 ${remaining}이에요.`;
  else if (month) detail = `이번 달 쓴 돈은 ${month}이에요.`;

  // 근거가 안 실려 오면 성취라고 말하지 않는다. 그때는 사실만 남긴다.
  const headline = achievementHeadline(feedback);
  if (headline == null) return { tone: 'calm', headline: detail ?? '저장했어요.' };

  return { badge: '잘 하고 있어요', tone: 'calm', headline, detail };
}

/** 저장 직후 카드는 한 줄이다. 남은 날 수와 하루 가용액은 홈이 늘 보여 준다. */
function onTrack(feedback: FeedbackOut): FeedbackMessage {
  const remaining = won(feedback.remaining_budget);
  return {
    tone: 'calm',
    headline: remaining ? `남은 예산은 ${remaining}이에요.` : '잘 기록했어요.',
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

/**
 * 수입을 적은 직후.
 *
 * 서버 판정은 지출을 보고 만든 것이라 그대로 쓰면 "이번 달 12,000원 썼어요" 가
 * 수입을 적은 자리에 나온다. 사실이긴 해도 방금 한 일과 어긋난다.
 * 예산 경고도 세우지 않는다. 들어온 돈을 적었는데 붉은 카드가 뜨면 앞뒤가 안 맞는다.
 */
function income(feedback: FeedbackOut, amount: number): FeedbackMessage {
  const remaining = won(feedback.remaining_budget);
  const month = won(feedback.month_expense);

  let detail: string | undefined;
  if (remaining) detail = `이번 달 남은 예산은 ${remaining}이에요.`;
  else if (month) detail = `이번 달 쓴 돈은 ${month}이에요.`;

  return { tone: 'calm', headline: `수입 ${formatCurrency(amount)}을 적었어요.`, detail };
}

export function buildFeedbackMessage(
  feedback: FeedbackOut,
  options: FeedbackMessageOptions = {},
): FeedbackMessage {
  if (options.savedIncome != null) return income(feedback, options.savedIncome);

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
