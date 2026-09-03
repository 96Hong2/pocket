import { describe, expect, it } from 'vitest';

import type { FeedbackKind, FeedbackOut } from '../../shared/api';

import { buildFeedbackMessage, findForbiddenWords } from './feedbackMessage';

const ALL_KINDS: FeedbackKind[] = [
  'over_budget',
  'pace_warning',
  'large_expense',
  'achievement',
  'on_track',
  'month_fact',
];

function feedback(kind: FeedbackKind, fields: Partial<FeedbackOut> = {}): FeedbackOut {
  return { kind, ...fields };
}

function fullText(kind: FeedbackKind, fields?: Partial<FeedbackOut>): string {
  const message = buildFeedbackMessage(feedback(kind, fields));
  return [message.badge, message.headline, message.detail].filter(Boolean).join(' ');
}

describe('buildFeedbackMessage', () => {
  it('여섯 판정 모두 빈 문장을 만들지 않는다', () => {
    for (const kind of ALL_KINDS) {
      const message = buildFeedbackMessage(feedback(kind));
      expect(message.headline.trim(), kind).not.toBe('');
    }
  });

  it('숫자가 전부 비어 있어도 죽지 않는다', () => {
    // 저장 뒤 판정이 실패하면 서버가 흡수해 kind 만 오고 나머지는 전부 null 이다.
    for (const kind of ALL_KINDS) {
      const message = buildFeedbackMessage(
        feedback(kind, {
          remaining_budget: null,
          daily_allowance: null,
          remaining_days: null,
          over_amount: null,
          saved_amount: null,
          month_expense: null,
          projected_month_end: null,
        }),
      );
      expect(message.headline, kind).not.toContain('null');
      expect(message.headline, kind).not.toContain('NaN');
      expect(message.detail ?? '', kind).not.toContain('NaN');
    }
  });

  it('금지어를 쓰지 않는다', () => {
    const samples: [FeedbackKind, Partial<FeedbackOut>][] = [
      ['over_budget', { over_amount: '18400', remaining_days: 12 }],
      [
        'pace_warning',
        { projected_month_end: '1240000', daily_allowance: '6000', remaining_days: 12 },
      ],
      ['large_expense', { saved_amount: '120000', remaining_budget: '340000' }],
      ['achievement', { month_expense: '340000' }],
      ['on_track', { remaining_budget: '340000', daily_allowance: '48000', remaining_days: 7 }],
      ['month_fact', { month_expense: '12000' }],
    ];

    for (const [kind, fields] of samples) {
      expect(findForbiddenWords(fullText(kind, fields)), kind).toEqual([]);
      expect(findForbiddenWords(fullText(kind)), kind).toEqual([]);
    }
  });

  it('서버가 준 숫자를 그대로 문장에 넣는다', () => {
    const text = fullText('on_track', {
      remaining_budget: '340000',
      daily_allowance: '48000',
      remaining_days: 7,
    });

    expect(text).toContain('340,000원');
    expect(text).toContain('48,000원');
    expect(text).toContain('남은 7일');
  });

  it('카테고리 이름을 알면 어디서 넘었는지까지 말한다', () => {
    const message = buildFeedbackMessage(
      feedback('over_budget', {
        over_amount: '18400',
        over_category_id: '11111111-1111-1111-1111-111111111111',
      }),
      { overCategoryName: '쇼핑' },
    );

    expect(message.headline).toContain('쇼핑');
    expect(message.headline).toContain('18,400원');
    expect(message.tone).toBe('caution');
  });
});

describe('findForbiddenWords', () => {
  it('탓하는 말을 잡아낸다', () => {
    expect(findForbiddenWords('이번 달 과소비예요')).toEqual(['과소비']);
    expect(findForbiddenWords('또 썼어요')).toEqual(['또']);
  });

  it('또는·또한 은 접속사라 걸지 않는다', () => {
    expect(findForbiddenWords('현금 또는 카드')).toEqual([]);
    expect(findForbiddenWords('또한 좋아요')).toEqual([]);
  });
});
