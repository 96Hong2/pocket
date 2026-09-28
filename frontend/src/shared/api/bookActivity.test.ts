import { afterEach, describe, expect, it } from 'vitest';

import { bookRefetchInterval, markBookActivity, resetBookActivity } from './bookActivity';

afterEach(() => {
  resetBookActivity();
});

describe('공유 가계부 다시 읽기 주기', () => {
  it('아무 일도 없으면 30초마다 읽는다', () => {
    expect(bookRefetchInterval(1_000_000)).toBe(30_000);
  });

  it('움직임이 있은 뒤 2분 동안은 10초마다 읽는다', () => {
    markBookActivity(1_000_000);
    expect(bookRefetchInterval(1_000_000 + 119_000)).toBe(10_000);
    expect(bookRefetchInterval(1_000_000 + 120_000)).toBe(30_000);
  });
});
