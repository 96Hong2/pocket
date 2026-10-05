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

/** 저장 뒤 화면에서 걷은 판정. 서버는 계속 보내지만 화면은 아무 줄도 안 세운다. */
const SILENT_KINDS = ALL_KINDS.filter((kind) => kind !== 'over_budget');

function feedback(kind: FeedbackKind, fields: Partial<FeedbackOut> = {}): FeedbackOut {
  return { kind, ...fields };
}

/** 숫자를 다 채운 응답. 문장이 남아 있다면 이 값들이 어딘가에 새어 나온다. */
const FULL: Partial<FeedbackOut> = {
  remaining_budget: '604800',
  daily_allowance: '25200',
  remaining_days: 24,
  saved_amount: '120000',
  month_expense: '340000',
  projected_month_end: '3836571',
  achievement_kind: 'weekly_decrease',
  achievement_decreased_amount: '32000',
};

describe('buildFeedbackMessage', () => {
  it('예산 초과가 아니면 판정 줄을 세우지 않는다', () => {
    for (const kind of SILENT_KINDS) {
      expect(buildFeedbackMessage(feedback(kind)), kind).toBeNull();
      expect(buildFeedbackMessage(feedback(kind, FULL)), kind).toBeNull();
    }
  });

  it('남은 예산이 있어도 남은 예산 문장을 만들지 않는다', () => {
    // 남은 돈은 홈이 늘 들고 있다. 저장 뒤 화면은 어디에 적혔는지가 주인공이다.
    for (const kind of ALL_KINDS) {
      const message = buildFeedbackMessage(feedback(kind, { ...FULL, over_amount: '18400' }));
      const text = message == null ? '' : `${message.badge} ${message.headline}`;
      expect(text, kind).not.toContain('남은 예산');
      expect(text, kind).not.toContain('604,800원');
    }
  });

  it('수입을 적었으면 예산을 넘었다는 응답이어도 줄을 세우지 않는다', () => {
    const message = buildFeedbackMessage(feedback('over_budget', { over_amount: '18400' }), {
      savedIncome: 3000000,
    });
    expect(message).toBeNull();
  });

  it('숫자가 전부 비어 있어도 예산 초과 줄은 나온다', () => {
    // 저장 뒤 판정이 실패하면 서버가 흡수해 kind 만 오고 나머지는 전부 null 이다.
    const message = buildFeedbackMessage(
      feedback('over_budget', {
        remaining_budget: null,
        over_amount: null,
        over_category_id: null,
        remaining_days: null,
      }),
    );
    expect(message).toEqual({ badge: '예산 초과', headline: '이번 달 예산을 넘었어요.' });
  });

  it('넘은 금액을 그대로 말하고 남은 날은 세지 않는다', () => {
    const message = buildFeedbackMessage(
      feedback('over_budget', { over_amount: '18400', remaining_days: 12 }),
    );

    expect(message?.headline).toBe('이번 달 예산을 18,400원 넘었어요.');
    expect(message?.headline).not.toContain('12일');
  });

  it('카테고리 이름을 알면 어디서 넘었는지까지 말한다', () => {
    const message = buildFeedbackMessage(
      feedback('over_budget', {
        over_amount: '18400',
        over_category_id: '11111111-1111-1111-1111-111111111111',
      }),
      { overCategoryName: '쇼핑' },
    );

    expect(message).toEqual({ badge: '예산 초과', headline: '쇼핑에서 예산을 18,400원 넘었어요.' });
  });

  it('카테고리 id 가 없으면 이름을 받아도 달 전체로 말한다', () => {
    const message = buildFeedbackMessage(feedback('over_budget', { over_amount: '18400' }), {
      overCategoryName: '쇼핑',
    });

    expect(message?.headline).toBe('이번 달 예산을 18,400원 넘었어요.');
  });

  it('금지어를 쓰지 않는다', () => {
    const samples: Partial<FeedbackOut>[] = [
      {},
      { over_amount: '18400', remaining_days: 12 },
      { over_amount: '18400', over_category_id: '11111111-1111-1111-1111-111111111111' },
    ];

    for (const fields of samples) {
      const message = buildFeedbackMessage(feedback('over_budget', fields), {
        overCategoryName: '쇼핑',
      });
      expect(message).not.toBeNull();
      expect(findForbiddenWords(`${message?.badge} ${message?.headline}`)).toEqual([]);
    }
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
