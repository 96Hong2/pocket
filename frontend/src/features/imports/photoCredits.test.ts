import { describe, expect, it } from 'vitest';

import {
  AD_GRANT,
  DAILY_FREE,
  earned,
  formatCredits,
  parseCredits,
  refilled,
  spent,
} from './photoCredits';

describe('parseCredits', () => {
  it('저장해 둔 줄을 날짜와 장수로 읽는다', () => {
    expect(parseCredits('2026-09-22:2')).toEqual({ day: '2026-09-22', count: 2 });
  });

  it('없거나 모양이 어긋나면 없는 것으로 친다', () => {
    expect(parseCredits(null)).toBeNull();
    expect(parseCredits('')).toBeNull();
    expect(parseCredits('2026-09-22')).toBeNull();
    expect(parseCredits('어제:1')).toBeNull();
    expect(parseCredits('2026-09-22:많이')).toBeNull();
    expect(parseCredits('2026-09-22:-1')).toBeNull();
    expect(parseCredits('2026-09-22:1.5')).toBeNull();
  });

  it('쓴 것을 그대로 다시 읽는다', () => {
    const value = { day: '2026-01-02', count: 7 };
    expect(parseCredits(formatCredits(value))).toEqual(value);
  });
});

describe('refilled', () => {
  it('처음 쓰는 사람은 오늘치를 받는다', () => {
    expect(refilled(null, '2026-09-22')).toEqual({ day: '2026-09-22', count: DAILY_FREE });
  });

  it('같은 날에는 손대지 않는다', () => {
    const today = { day: '2026-09-22', count: 1 };
    expect(refilled(today, '2026-09-22')).toEqual(today);
  });

  it('날이 바뀌면 오늘치까지 채운다', () => {
    expect(refilled({ day: '2026-09-21', count: 0 }, '2026-09-22')).toEqual({
      day: '2026-09-22',
      count: DAILY_FREE,
    });
  });

  it('모아 둔 것이 오늘치보다 많으면 깎지 않는다', () => {
    expect(refilled({ day: '2026-09-21', count: 9 }, '2026-09-22')).toEqual({
      day: '2026-09-22',
      count: 9,
    });
  });

  it('며칠을 건너뛰어도 오늘치까지만 채운다', () => {
    expect(refilled({ day: '2026-08-01', count: 0 }, '2026-09-22')).toEqual({
      day: '2026-09-22',
      count: DAILY_FREE,
    });
  });
});

describe('spent', () => {
  it('한 장을 뺀다', () => {
    expect(spent({ day: '2026-09-22', count: 3 })).toEqual({ day: '2026-09-22', count: 2 });
  });

  it('0 아래로 내려가지 않는다', () => {
    expect(spent({ day: '2026-09-22', count: 0 })).toEqual({ day: '2026-09-22', count: 0 });
  });
});

describe('earned', () => {
  it('광고 한 편에 한 장을 더한다', () => {
    expect(earned({ day: '2026-09-22', count: 0 })).toEqual({
      day: '2026-09-22',
      count: AD_GRANT,
    });
  });

  it('모으는 데 상한이 없다', () => {
    let value = { day: '2026-09-22', count: 0 };
    for (let i = 0; i < 20; i += 1) value = earned(value);
    expect(value.count).toBe(20 * AD_GRANT);
  });
});
