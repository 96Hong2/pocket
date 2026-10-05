import { sanitizeQuantityInput } from '../assets';

/** 수량 칸을 칠 때 키패드 차례. 금액 키패드의 「00」 자리가 「.」 이다. */
export const QUANTITY_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'] as const;

/** 정수부 자리 상한. 서버 수량 칸(전체 20자리, 소수 8자리)에 맞춘다. */
export const QUANTITY_INT_DIGITS = 12;

/**
 * 수량 칸에 키 하나를 더한다. 「00」 이 와도 「.」 로 읽는다.
 * 소수점은 한 번만, 소수는 8자리까지, 앞의 0 은 하나만 남긴다. 못 받는 키면 그대로 돌려준다.
 */
export function appendQuantityKey(current: string, key: string): string {
  const typed = key === '00' ? '.' : key;
  if (!/^[0-9.]$/.test(typed)) return current;
  if (typed === '.' && current.includes('.')) return current;
  const next = sanitizeQuantityInput(current + typed);
  const whole = next.split('.')[0] ?? '';
  return whole.length > QUANTITY_INT_DIGITS ? current : next;
}

/** 한 자리 지우기. */
export function dropQuantityKey(current: string): string {
  return current.slice(0, -1);
}
