/**
 * 금액칸의 한 번 편집을 숫자 문자열과 커서 자리로 옮긴다.
 *
 * 콤마는 우리가 찍은 것이라 사용자가 지울 수 없다. 그대로 두면 콤마 위에서 Backspace 를
 * 눌러도 아무것도 안 지워지고, 다시 그린 문자열 때문에 커서만 맨 끝으로 튄다.
 * 앞자리를 고치려던 사람이 누른 숫자가 뒤에 붙는다.
 *
 * 화면으로 증명하기 어려운 계산이라 이 파일만 순수 함수로 떼어 두고 단위 테스트를 붙였다.
 */

import { formatNumber } from '../lib/format';

/** 서버도 1원 이상 원 단위 정수만 받는다. 자릿수 넘침을 여기서 끊는다. */
const MAX_DIGITS = 12;

/** 숫자 문자열을 칸에 보여 줄 문자열로 바꾼다. 빈 문자열이면 아직 안 적은 상태다. */
export function formatAmountInput(digits: string): string {
  const amount = Number(digits);
  if (digits === '' || !Number.isFinite(amount)) return '';
  return formatNumber(amount);
}

export interface AmountEditInput {
  /** 고치기 전에 칸에 있던 문자열. 콤마가 들어 있다. */
  previous: string;
  /** 브라우저가 만들어 준 고친 뒤 문자열. */
  next: string;
  /** 고친 뒤 커서 위치. */
  caret: number;
}

export interface AmountEditResult {
  /** 위로 올려 보낼 숫자 문자열. */
  digits: string;
  /** 콤마를 다시 찍은 문자열에서 커서를 둘 자리. */
  caret: number;
}

export function editAmount({ previous, next, caret }: AmountEditInput): AmountEditResult {
  const typedBefore = countDigits(next.slice(0, caret));
  let digits = onlyDigits(next);

  // 한 글자가 줄었는데 숫자는 그대로다. 지워진 것이 콤마 하나라는 뜻이다.
  // 사용자가 지우려던 것은 그 앞의 숫자 한 자리다.
  //
  // 자릿수만 세면 안 된다. 골라 둔 전체를 같은 자릿수로 붙여 넣은 것도 콤마 삭제로 읽혀
  // 멀쩡한 한 자리가 사라진다(`400,000` 에 `700000` 을 붙여 넣으면 `70,000` 이 됐다).
  const separatorOnly = next.length === previous.length - 1 && digits === onlyDigits(previous);
  let kept = typedBefore;
  if (separatorOnly && typedBefore > 0) {
    digits = digits.slice(0, typedBefore - 1) + digits.slice(typedBefore);
    kept = typedBefore - 1;
  }

  const capped = digits.slice(0, MAX_DIGITS);
  kept = Math.min(kept, capped.length);

  // 앞자리 0 은 버린다. 버린 만큼 커서도 함께 당겨진다.
  const trimmed = capped.replace(/^0+/, '');
  kept = Math.max(kept - (capped.length - trimmed.length), 0);

  return { digits: trimmed, caret: caretAfterDigits(formatAmountInput(trimmed), kept) };
}

function onlyDigits(text: string): string {
  return text.replace(/\D/g, '');
}

function countDigits(text: string): number {
  return onlyDigits(text).length;
}

/** 앞에서 `count` 번째 숫자 바로 뒤 자리. 0 이면 맨 앞이다. */
function caretAfterDigits(text: string, count: number): number {
  if (count <= 0) return 0;

  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char >= '0' && char <= '9') {
      seen += 1;
      if (seen === count) return index + 1;
    }
  }
  return text.length;
}
