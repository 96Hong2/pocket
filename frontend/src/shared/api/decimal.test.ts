import { describe, expect, it } from 'vitest';

import { parseDecimal, parseDecimalOr } from './decimal';

describe('parseDecimal', () => {
  it('금액 문자열을 숫자로 바꾼다', () => {
    expect(parseDecimal('12000')).toBe(12000);
    expect(parseDecimal('0')).toBe(0);
    expect(parseDecimal('-3000')).toBe(-3000);
  });

  it('비율은 소수점 넷째 자리까지 그대로 읽는다', () => {
    expect(parseDecimal('0.0240')).toBe(0.024);
    expect(parseDecimal('0.0000')).toBe(0);
  });

  it('금액 상한 14자리까지 정확하다', () => {
    expect(parseDecimal('99999999999999')).toBe(99_999_999_999_999);
    expect(Number.isSafeInteger(parseDecimal('99999999999999'))).toBe(true);
  });

  it('값이 없으면 0 으로 뭉개지 않고 null 을 준다', () => {
    // 예산을 정하지 않으면 remaining_budget 이 null 로 온다. 0원과 구분돼야 한다.
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
  });

  it('숫자로 읽히지 않는 값은 NaN 대신 null 을 준다', () => {
    // 화면까지 NaN 이 흘러가면 Amount 가 'NaN원' 을 그대로 그린다.
    expect(parseDecimal('NaN')).toBeNull();
    expect(parseDecimal('사만원')).toBeNull();
    expect(parseDecimal('Infinity')).toBeNull();
  });
});

describe('parseDecimalOr', () => {
  it('없을 때 쓸 값을 정해 받는다', () => {
    expect(parseDecimalOr(null, 0)).toBe(0);
    expect(parseDecimalOr('12000', 0)).toBe(12000);
    expect(parseDecimalOr('0', 999)).toBe(0);
  });
});
