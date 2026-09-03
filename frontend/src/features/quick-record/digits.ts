/** 키패드가 다루는 숫자 문자열 규칙. 화면 두 곳이 같은 규칙을 봐야 해서 여기 모은다. */

/** 원 단위 12자리까지만 받는다. 서버 상한(14자리)보다 앞에서 끊는다. */
export const MAX_DIGITS = 12;

/** 눌린 숫자를 금액으로 읽는다. 아무것도 안 눌렀으면 0. */
export function toAmount(digits: string): number {
  if (digits === '') return 0;
  const amount = Number(digits);
  return Number.isFinite(amount) ? amount : 0;
}

/** 앞자리 0 은 남기지 않는다. `0` 만 눌러서는 금액이 되지 않는다. */
export function appendDigit(digits: string, key: string): string {
  return (digits + key).replace(/^0+/, '').slice(0, MAX_DIGITS);
}
