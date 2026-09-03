/**
 * 서버가 준 금액·비율 문자열을 숫자로 바꾼다. **변환은 여기 한 곳에서만 한다.**
 *
 * 금액과 비율은 부동소수 오차를 만들지 않으려고 서버가 Decimal 로 다루고 JSON 에서는
 * 문자열로 온다(`"12000"`, `"0.0240"`). 화면 컴포넌트는 `number` 를 받으므로 그 사이를 여기서 잇는다.
 *
 * 금액 상한은 14자리(99,999,999,999,999)라 `Number` 의 안전 정수 범위(약 9.0e15) 안에 있다.
 * 즉 `Number()` 변환 자체는 안전하다. 위험한 것은 없는 값이다.
 * `Number(null)` 은 0, `Number(undefined)` 는 NaN 이고, `Amount` 컴포넌트는 NaN 방어가 없어
 * 화면에 `NaN원` 이 그대로 찍힌다. 그래서 값이 없으면 0 으로 뭉개지 않고 null 을 돌려준다.
 */

/** 값이 없거나 숫자로 읽히지 않으면 null. 0 과 '없음'을 구분해서 돌려준다. */
export function parseDecimal(value: string | null | undefined): number | null {
  if (value == null) return null;

  const trimmed = value.trim();
  if (trimmed === '') return null;

  const parsed = Number(trimmed);
  // NaN 과 Infinity 를 여기서 끊는다. 화면까지 흘러가면 'NaN원' 으로 그려진다.
  return Number.isFinite(parsed) ? parsed : null;
}

/** 없으면 대신 쓸 값을 정해 받는다. 숫자를 반드시 그려야 하는 자리에서 쓴다. */
export function parseDecimalOr(value: string | null | undefined, fallback: number): number {
  return parseDecimal(value) ?? fallback;
}
