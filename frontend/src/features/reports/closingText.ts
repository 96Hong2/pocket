/**
 * 결산 카드의 문장을 만든다.
 *
 * 서버는 종류와 숫자만 준다. 문장은 여기서 조립하고, 숫자를 새로 만들지 않는다.
 * 받은 값을 표기만 바꿔 끼운다.
 *
 * **없는 값은 문장에서 통째로 뺀다.** 근거가 없으면 그 줄을 안 만들고, 0 으로 채워
 * 아무 뜻도 없는 칭찬을 하지 않는다. 탓하는 말은 쓰지 않는다(`FORBIDDEN_WORDS`).
 */

import type { ChangeOut, HighlightOut, NextOut } from '../../shared/api';
import { parseDecimalOr } from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';

/**
 * 카드 순서. **배열 상수로 못 박는다.**
 *
 * 잘한 것을 맨 앞에 둔다. 늘어난 지출을 먼저 보여주면 그 뒤 문장을 아무도 안 읽는다.
 * 순서가 흔들리면 매달 다른 카드로 결산이 시작되어, 같은 화면이라고 못 알아본다.
 */
export const CLOSING_CARDS = [
  { key: 'highlights', title: '잘한 것' },
  { key: 'flow', title: '돈 흐름' },
  { key: 'change', title: '살펴볼 변화' },
  { key: 'next', title: '다음 달 하나만' },
] as const;

export type ClosingCardKey = (typeof CLOSING_CARDS)[number]['key'];

/** 늘어난 분류 카드 끝에 붙는 한 줄. 변화를 잘못으로 읽지 않게 못 박아 둔다. */
export const CHANGE_NOTE = '나쁜 게 아니라, 그냥 알아두면 좋은 변화예요.';

/** 지난달과 견줄 것이 없을 때. 숫자를 지어내지 않는다. */
export const NO_CHANGE_LINE = '지난달과 견줘 크게 달라진 분류는 없어요';

/** 권할 것이 없을 때. 굳이 숙제를 만들지 않는다. */
export const NO_NEXT_LINE = '지금처럼 하면 돼요';

/**
 * 잘한 것이 하나도 없을 때.
 *
 * 억지 칭찬을 만들지 않는다. 대신 그 달을 가리켜 적는다. 결산은 늘 끝난 달을 보므로
 * "이번 달" 이라고 적으면 화면이 보고 있는 달과 다른 말이 된다.
 */
export function enoughLine(month: string): string {
  return `${monthNumber(month)}월은 기록한 것만으로도 충분해요`;
}

/** 그 달에 돈이 얼마나 드나들었는지 적는 줄의 라벨. 지난달을 보면서 '이번 달' 이라 하지 않는다. */
export function deltaLabel(month: string): string {
  return `${monthNumber(month)}월 차액`;
}

/** `31일 중 12일 적었어요`. 빠진 날 수는 세지 않는다. */
export function recordedDaysLine(recordedDays: number, totalDays: number): string {
  return `${totalDays}일 중 ${recordedDays}일 적었어요`;
}

/**
 * 잘한 것 한 줄.
 *
 * `amount` 는 그 종류의 문장이 그대로 읽을 숫자다. 두 금액을 빼서 만들지 않는다.
 * 분류 이름을 모르면 그 줄을 만들지 않는다(null). 이름 없이 "그 분류를 줄였어요" 는
 * 무엇을 줄였다는 말인지 알 수 없다.
 */
export function highlightLine(highlight: HighlightOut, categoryName?: string): string | null {
  const amount = formatCurrency(parseDecimalOr(highlight.amount, 0));

  switch (highlight.kind) {
    case 'within_budget':
      return `예산 안에서 마쳤어요 · ${amount} 남겼어요`;
    case 'category_decrease':
      // 분류 이름 뒤에 조사를 붙이지 않는다. '쇼핑를' 처럼 받침에 따라 틀리는 자리가 생긴다.
      return categoryName == null ? null : `지난달보다 ${categoryName} 지출을 ${amount} 줄였어요`;
    case 'no_spend_days':
      return highlight.count == null ? null : `안 쓴 날이 ${highlight.count}일 있었어요`;
    case 'goal_contribution':
      return `목표에 ${amount} 옮겼어요`;
  }
}

/** 늘어난 분류 한 줄. 늘어난 금액은 서버가 센 값이다. */
export function changeLine(change: ChangeOut, categoryName?: string): string {
  const grown = formatCurrency(parseDecimalOr(change.delta, 0));
  // 이름을 못 받았어도 얼마나 늘었는지는 말한다. 카드 자체를 비우면 변화가 없었던 달과 같아진다.
  const name = categoryName ?? '어떤 분류';
  return `지난달보다 ${name} 지출이 ${grown} 늘었어요`;
}

/** 지난달과 이번 달 금액을 나란히. 늘어난 금액을 어디서 어디로 왔는지와 함께 읽게 한다. */
export function changeWindow(change: ChangeOut): string {
  const previous = formatCurrency(parseDecimalOr(change.previous, 0));
  const current = formatCurrency(parseDecimalOr(change.current, 0));
  return `지난달 ${previous} → ${current}`;
}

/** 다음 달에 해 볼 것 한 줄. 한도 하나면 된다고 말한다. */
export function nextLine(next: NextOut, categoryName?: string): string {
  const cap = formatCurrency(parseDecimalOr(next.suggested_cap, 0));
  const name = categoryName ?? '늘어난 분류';
  return `${name} 예산 ${cap}, 이거 하나면 충분해요`;
}

/** `2026-08` → `8` */
function monthNumber(month: string): number {
  return Number(month.slice(5, 7));
}
