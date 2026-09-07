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

  it('속도가 빨라도 달 말 예상액으로 겁주지 않는다', () => {
    // 며칠치로 남은 달 전체를 늘린 값이라 초반일수록 크게 튄다.
    // 적는 사람은 그 숫자를 사실로 읽으므로, 적을 때마다 보여 주면 안 적게 된다.
    const message = buildFeedbackMessage(
      feedback('pace_warning', {
        projected_month_end: '3836571',
        daily_allowance: '25200',
        remaining_days: 24,
      }),
    );

    expect(message.headline).toBe('남은 24일 하루 25,200원이면 예산 안에서 지낼 수 있어요.');
    expect(message.tone).toBe('calm');
    expect(message.badge).toBeUndefined();
    expect(`${message.headline}${message.detail ?? ''}`).not.toContain('3,836,571');
  });

  describe('성취는 근거마다 다른 말을 한다', () => {
    // 셋에 같은 문장을 쓰면 근거 없는 칭찬과 구분되지 않는다.
    it('지난주보다 덜 쓴 것', () => {
      const message = buildFeedbackMessage(
        feedback('achievement', {
          achievement_kind: 'weekly_decrease',
          achievement_decreased_amount: '32000',
          remaining_budget: '340000',
        }),
      );
      expect(message.badge).toBe('잘 하고 있어요');
      expect(message.headline).toContain('32,000원');
      expect(message.headline).toContain('지난주');
    });

    it('무지출 연속', () => {
      const message = buildFeedbackMessage(
        feedback('achievement', {
          achievement_kind: 'no_spend_streak',
          achievement_no_spend_days: 2,
        }),
      );
      expect(message.headline).toBe('2일 연속 안 쓴 날이에요.');
    });

    it('월말 예상이 예산 안', () => {
      const message = buildFeedbackMessage(
        feedback('achievement', { achievement_kind: 'projected_within_budget' }),
      );
      expect(message.headline).toContain('예산 안에서');
    });

    // 근거를 안 주면 칭찬하지 않는다. 배지가 붙으면 억지 칭찬이 된다.
    it('근거가 없으면 칭찬하지 않는다', () => {
      const message = buildFeedbackMessage(feedback('achievement', { month_expense: '340000' }));
      expect(message.badge).toBeUndefined();
      expect(message.headline).not.toContain('잘');
    });

    it('무지출 연속인데 날 수가 0이면 칭찬하지 않는다', () => {
      const message = buildFeedbackMessage(
        feedback('achievement', {
          achievement_kind: 'no_spend_streak',
          achievement_no_spend_days: 0,
        }),
      );
      expect(message.badge).toBeUndefined();
    });
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
