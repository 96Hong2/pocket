import { describe, expect, it } from 'vitest';

import {
  dayOfPeriod,
  describePeriod,
  formatPeriodRange,
  periodContaining,
  periodOfMonth,
} from './monthPeriod';

function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

// 서버 `backend/tests/domain/test_period.py` 의 표를 그대로 옮겼다. 한쪽이 바뀌면 둘 다 바꾼다.

describe('이름 달과 시작일로 기간을 만든다', () => {
  it.each([
    ['2026-10', 1, '2026-10-01', '2026-10-31'],
    ['2026-10', 2, '2026-10-02', '2026-11-01'],
    ['2026-10', 5, '2026-10-05', '2026-11-04'],
    ['2026-10', 15, '2026-10-15', '2026-11-14'],
    ['2026-10', 16, '2026-09-16', '2026-10-15'],
    ['2026-10', 25, '2026-09-25', '2026-10-24'],
    ['2026-10', 28, '2026-09-28', '2026-10-27'],
    // 2월 평년
    ['2026-02', 1, '2026-02-01', '2026-02-28'],
    ['2026-02', 5, '2026-02-05', '2026-03-04'],
    ['2026-02', 15, '2026-02-15', '2026-03-14'],
    ['2026-02', 16, '2026-01-16', '2026-02-15'],
    ['2026-02', 25, '2026-01-25', '2026-02-24'],
    ['2026-02', 28, '2026-01-28', '2026-02-27'],
    ['2026-03', 28, '2026-02-28', '2026-03-27'],
    // 2월 윤년
    ['2024-02', 1, '2024-02-01', '2024-02-29'],
    ['2024-02', 5, '2024-02-05', '2024-03-04'],
    ['2024-03', 25, '2024-02-25', '2024-03-24'],
    ['2024-03', 28, '2024-02-28', '2024-03-27'],
    // 12월 → 1월, 1월 → 지난해 12월
    ['2026-12', 5, '2026-12-05', '2027-01-04'],
    ['2026-12', 15, '2026-12-15', '2027-01-14'],
    ['2027-01', 16, '2026-12-16', '2027-01-15'],
    ['2027-01', 25, '2026-12-25', '2027-01-24'],
    ['2027-01', 1, '2027-01-01', '2027-01-31'],
  ])('%s 시작일 %i → %s ~ %s', (month, startDay, start, end) => {
    expect(periodOfMonth(month, startDay)).toEqual({ key: month, start, end });
  });
});

describe('날짜가 든 기간과 이름', () => {
  it.each([
    // 시작일을 25 로 바꾼 10월 5일에도 화면은 「10월」 이다. 지난달로 돌아가지 않는다.
    ['2026-10-05', 25, '2026-10', '2026-09-25', '2026-10-24'],
    ['2026-10-24', 25, '2026-10', '2026-09-25', '2026-10-24'],
    ['2026-10-25', 25, '2026-11', '2026-10-25', '2026-11-24'],
    ['2026-12-25', 25, '2027-01', '2026-12-25', '2027-01-24'],
    ['2026-10-04', 5, '2026-09', '2026-09-05', '2026-10-04'],
    ['2026-10-05', 5, '2026-10', '2026-10-05', '2026-11-04'],
    ['2027-01-03', 5, '2026-12', '2026-12-05', '2027-01-04'],
    ['2026-10-15', 16, '2026-10', '2026-09-16', '2026-10-15'],
    ['2026-10-16', 16, '2026-11', '2026-10-16', '2026-11-15'],
    ['2026-10-05', 1, '2026-10', '2026-10-01', '2026-10-31'],
    ['2024-02-29', 1, '2024-02', '2024-02-01', '2024-02-29'],
    // 새해 첫날은 지난해 12월에 시작한 기간에 든다.
    ['2027-01-01', 25, '2027-01', '2026-12-25', '2027-01-24'],
    ['2026-12-31', 16, '2027-01', '2026-12-16', '2027-01-15'],
    // 2월 28일이 시작일이면 3월 27일까지다.
    ['2026-02-28', 28, '2026-03', '2026-02-28', '2026-03-27'],
  ])('%s 시작일 %i → %s', (day, startDay, key, start, end) => {
    expect(periodContaining(day, startDay)).toEqual({ key, start, end });
  });
});

describe('어느 시작일이든 기간이 빈틈없이 이어진다', () => {
  it.each(Array.from({ length: 28 }, (_, index) => index + 1))('시작일 %i', (startDay) => {
    let month = '2023-11';
    let previous = periodOfMonth(month, startDay);
    for (let step = 0; step < 30; step += 1) {
      const [year, number] = month.split('-').map(Number);
      month = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`;
      const period = periodOfMonth(month, startDay);
      expect(nextDay(previous.end)).toBe(period.start);
      expect(dayOfPeriod(period.start, startDay)).toBe(1);
      expect(dayOfPeriod(previous.end, startDay)).toBeGreaterThanOrEqual(28);
      expect(dayOfPeriod(previous.end, startDay)).toBeLessThanOrEqual(31);
      expect(periodContaining(period.start, startDay)).toEqual(period);
      expect(periodContaining(period.end, startDay)).toEqual(period);
      expect(periodContaining(previous.end, startDay)).toEqual(previous);
      previous = period;
    }
  });
});

describe('결산 카드 창은 기간의 며칠째로 센다', () => {
  it.each([
    ['2026-10-01', 1, 1],
    ['2026-10-07', 1, 7],
    ['2026-10-08', 1, 8],
    // 시작일 25: 9월 25일이 첫날, 10월 1일이 이레째, 10월 5일이 열하루째다.
    ['2026-09-25', 25, 1],
    ['2026-10-01', 25, 7],
    ['2026-10-05', 25, 11],
    ['2027-01-03', 5, 30],
  ])('%s 시작일 %i → %i일째', (day, startDay, nth) => {
    expect(dayOfPeriod(day, startDay)).toBe(nth);
  });
});

describe('기간을 적는 말', () => {
  it('시작일이 1 이면 끝 쪽 달을 안 적는다', () => {
    expect(describePeriod(periodOfMonth('2026-10', 1))).toBe('10월은 10월 1일부터 31일까지예요');
  });

  it('달을 넘기면 두 달을 다 적는다', () => {
    expect(describePeriod(periodOfMonth('2026-10', 25))).toBe(
      '10월은 9월 25일부터 10월 24일까지예요',
    );
    expect(describePeriod(periodOfMonth('2027-01', 25))).toBe(
      '1월은 12월 25일부터 1월 24일까지예요',
    );
  });

  it('기간 줄은 점으로 적는다', () => {
    expect(formatPeriodRange(periodOfMonth('2026-10', 25))).toBe('9.25 ~ 10.24');
  });
});
