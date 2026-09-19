import { describe, expect, it } from 'vitest';

import { DAILY_CAP, allowedToday, countedToday, formatDayCount, parseDayCount } from './adFrequency';

describe('parseDayCount', () => {
  it('저장해 둔 줄을 날짜와 횟수로 읽는다', () => {
    expect(parseDayCount('2026-09-19:2')).toEqual({ day: '2026-09-19', count: 2 });
  });

  it('없거나 모양이 어긋나면 없는 것으로 친다', () => {
    expect(parseDayCount(null)).toBeNull();
    expect(parseDayCount('')).toBeNull();
    expect(parseDayCount('2026-09-19')).toBeNull();
    expect(parseDayCount('어제:1')).toBeNull();
    expect(parseDayCount('2026-09-19:많이')).toBeNull();
    expect(parseDayCount('2026-09-19:-1')).toBeNull();
    expect(parseDayCount('2026-09-19:1.5')).toBeNull();
  });

  it('쓴 것을 그대로 다시 읽는다', () => {
    const value = { day: '2026-01-02', count: 1 };
    expect(parseDayCount(formatDayCount(value))).toEqual(value);
  });
});

describe('allowedToday', () => {
  it('기록이 없으면 본다', () => {
    expect(allowedToday(null, '2026-09-19')).toBe(true);
  });

  it('어제 다 봤어도 오늘은 처음부터 다시 센다', () => {
    expect(allowedToday({ day: '2026-09-18', count: DAILY_CAP }, '2026-09-19')).toBe(true);
  });

  it('오늘 상한을 채웠으면 더 보지 않는다', () => {
    expect(allowedToday({ day: '2026-09-19', count: DAILY_CAP - 1 }, '2026-09-19')).toBe(true);
    expect(allowedToday({ day: '2026-09-19', count: DAILY_CAP }, '2026-09-19')).toBe(false);
  });
});

describe('countedToday', () => {
  it('처음 보는 날은 1 부터 센다', () => {
    expect(countedToday(null, '2026-09-19')).toEqual({ day: '2026-09-19', count: 1 });
    expect(countedToday({ day: '2026-09-18', count: 2 }, '2026-09-19')).toEqual({
      day: '2026-09-19',
      count: 1,
    });
  });

  it('같은 날이면 이어서 센다', () => {
    expect(countedToday({ day: '2026-09-19', count: 1 }, '2026-09-19')).toEqual({
      day: '2026-09-19',
      count: 2,
    });
  });
});
