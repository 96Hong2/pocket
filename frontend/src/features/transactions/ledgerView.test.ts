import { describe, expect, it } from 'vitest';

import { dayCellLabel, dayIso, monthGrid } from './ledgerView';

describe('monthGrid', () => {
  it('달마다 날짜 수가 다르다', () => {
    expect(monthGrid('2026-09').days).toHaveLength(30);
    expect(monthGrid('2026-10').days).toHaveLength(31);
    expect(monthGrid('2026-02').days).toHaveLength(28);
  });

  it('윤년 2월은 29일까지다', () => {
    expect(monthGrid('2028-02').days).toHaveLength(29);
  });

  it('1일이 무슨 요일인지에 따라 앞을 비운다', () => {
    // 2026-09-01 은 화요일이라 일·월 두 칸을 비운다.
    expect(monthGrid('2026-09').leadingBlanks).toBe(2);
    // 2026-11-01 은 일요일이라 비우지 않는다.
    expect(monthGrid('2026-11').leadingBlanks).toBe(0);
  });

  it('날짜는 1부터 이어진다', () => {
    const { days } = monthGrid('2026-09');
    expect(days[0]).toBe(1);
    expect(days.at(-1)).toBe(30);
  });
});

describe('dayIso', () => {
  it('한 자리 날짜에 0 을 붙인다', () => {
    expect(dayIso('2026-09', 4)).toBe('2026-09-04');
    expect(dayIso('2026-09', 30)).toBe('2026-09-30');
  });
});

describe('dayCellLabel', () => {
  it('기록이 없으면 없다고 말한다', () => {
    expect(dayCellLabel('2026-09-04')).toBe('9월 4일, 기록 없음');
    expect(dayCellLabel('2026-09-04', { expense: 0, income: 0 })).toBe('9월 4일, 기록 없음');
  });

  it('있는 것만 읽는다', () => {
    expect(dayCellLabel('2026-09-04', { expense: 5000, income: 0 })).toBe(
      '9월 4일, 지출 5,000원',
    );
    expect(dayCellLabel('2026-09-04', { expense: 0, income: 500000 })).toBe(
      '9월 4일, 수입 500,000원',
    );
    expect(dayCellLabel('2026-09-04', { expense: 5000, income: 500000 })).toBe(
      '9월 4일, 지출 5,000원, 수입 500,000원',
    );
  });

  it('환불이 더 많은 날은 음수로 읽는다', () => {
    // 0 으로 눌러 버리면 그날 무슨 일이 있었는지가 사라진다.
    expect(dayCellLabel('2026-09-04', { expense: -2000, income: 0 })).toBe(
      '9월 4일, 지출 -2,000원',
    );
  });
});
