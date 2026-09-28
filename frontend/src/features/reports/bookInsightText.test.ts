import { describe, expect, it } from 'vitest';

import type { BookCategoryChangeOut, BookInsightOut } from '../../shared/api';

import {
  compareSentence,
  detailChanges,
  insightTopics,
  projectionSentence,
} from './bookInsightText';

describe('compareSentence', () => {
  it('이번 달은 같은 기간끼리 견주고 더 쓴 만큼 적는다', () => {
    expect(compareSentence(20_000, true)).toBe('지난달 같은 기간보다 20,000원 더 썼어요');
  });

  it('덜 썼으면 부호를 떼고 「덜」 로 적는다', () => {
    expect(compareSentence(-3_500, true)).toBe('지난달 같은 기간보다 3,500원 덜 썼어요');
  });

  it('지난 달은 달 전체끼리 견준다', () => {
    expect(compareSentence(1_000, false)).toBe('지난달보다 1,000원 더 썼어요');
  });

  it('같으면 금액 없이 똑같다고 적는다', () => {
    expect(compareSentence(0, true)).toBe('지난달 같은 기간과 똑같이 썼어요');
  });
});

describe('projectionSentence', () => {
  it('믿을 만할 때만 금액을 적고, 천 원 단위로 반올림해 「약」 을 붙인다', () => {
    expect(projectionSentence(98_571, true)).toBe('이대로면 이번 달 약 99,000원 써요');
    expect(projectionSentence(364_200, true)).toBe('이대로면 이번 달 약 364,000원 써요');
    expect(projectionSentence(98_571, false)).toBe('월말 예상은 3일부터 보여 드려요');
  });
});

describe('insightTopics', () => {
  it('지난 달에는 월말 예상을 약속하지 않는다', () => {
    expect(insightTopics(true)).toHaveLength(4);
    expect(insightTopics(false)).not.toContain('월말 예상');
  });

  it('분류별로 더 말할 것이 없으면 그 칸도 약속하지 않는다', () => {
    expect(insightTopics(true, false)).toEqual([
      '지난달과 비교',
      '가장 많이 늘어난 소비',
      '월말 예상',
    ]);
  });
});

function change(categoryId: string | null, delta: string): BookCategoryChangeOut {
  return { category_id: categoryId, current: '0', previous: '0', delta };
}

function insight(overrides: Partial<BookInsightOut>): BookInsightOut {
  return {
    previous_spent_same_window: '0',
    compare_delta: '0',
    compare_window_end: '2026-09-28',
    largest_increase: null,
    category_changes: [],
    projected_month_end: null,
    is_projection_reliable: false,
    ...overrides,
  };
}

describe('detailChanges', () => {
  it('가장 많이 늘어난 분류는 분류별 자세히에서 뺀다', () => {
    const grown = change('groceries', '20000');
    const dining = change('dining', '12000');
    expect(
      detailChanges(insight({ largest_increase: grown, category_changes: [grown, dining] })),
    ).toEqual([dining]);
    // 늘어난 것이 없으면 그대로 다 선다.
    expect(detailChanges(insight({ category_changes: [dining] }))).toEqual([dining]);
    expect(detailChanges(insight({ largest_increase: grown, category_changes: [grown] }))).toEqual(
      [],
    );
  });
});
