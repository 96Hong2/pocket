import { describe, expect, it } from 'vitest';

import { monthsEndingAt } from './analysisFormat';

describe('monthsEndingAt', () => {
  it('해를 넘겨 오래된 달부터 잇는다', () => {
    expect(monthsEndingAt('2026-02', 6)).toEqual([
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('하나면 그 달만', () => {
    expect(monthsEndingAt('2026-10', 1)).toEqual(['2026-10']);
  });
});
