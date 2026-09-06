import { describe, expect, it } from 'vitest';

import { formatCompactCurrency } from './format';

/**
 * 짧게 적는 자리의 규칙.
 *
 * 이 함수가 있는 이유는 폭이다. 히어로의 `남은 예산 / 예산` 이 원 단위로 다 적히면
 * 억대 예산에서 412px 화면을 밀어내고, 그러면 브라우저가 화면을 축소해 탭바가 안 눌린다.
 * 그래서 경계마다 실제로 짧아지는지를 본다.
 */
describe('formatCompactCurrency', () => {
  it('만 단위 아래는 그대로 적는다', () => {
    expect(formatCompactCurrency(0)).toBe('0원');
    expect(formatCompactCurrency(9_000)).toBe('9,000원');
    // 경계 바로 아래. 여기까지는 줄일 것이 없다.
    expect(formatCompactCurrency(9_999)).toBe('9,999원');
  });

  it('만 단위부터 만으로 접는다', () => {
    expect(formatCompactCurrency(10_000)).toBe('1만');
    expect(formatCompactCurrency(2_850_000)).toBe('285만');
    // 딱 떨어지지 않으면 소수 한 자리까지만 남긴다. 두 자리면 다시 계산해야 한다.
    expect(formatCompactCurrency(1_234_000)).toBe('123.4만');
  });

  it('억 단위부터 억으로 접는다', () => {
    expect(formatCompactCurrency(100_000_000)).toBe('1억');
    expect(formatCompactCurrency(1_000_000_000)).toBe('10억');
    expect(formatCompactCurrency(1_250_000_000)).toBe('12.5억');
  });

  it('음수는 부호를 앞에 붙인다', () => {
    expect(formatCompactCurrency(-2_850_000)).toBe('-285만');
    expect(formatCompactCurrency(-3_000)).toBe('-3,000원');
  });

  it('어떤 값에서도 원 단위 표기보다 짧다', () => {
    // 이 함수의 존재 이유가 폭이다. 접었는데 더 길어지면 아무 의미가 없다.
    for (const value of [10_000, 2_850_000, 99_999_999, 100_000_000, 1_000_000_000]) {
      expect(formatCompactCurrency(value).length).toBeLessThan(
        `${value.toLocaleString('ko-KR')}원`.length,
      );
    }
  });
});
