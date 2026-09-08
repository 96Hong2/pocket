import { describe, expect, it } from 'vitest';

import type { ChangeOut, HighlightOut, NextOut } from '../../shared/api';
// 금지어 정본은 한 곳이다. 저장 직후 피드백도 e2e 도 같은 것을 본다.
import { findForbiddenWords } from '../../shared/lib/forbiddenWords';

import {
  CHANGE_NOTE,
  CLOSING_CARDS,
  NO_CHANGE_LINE,
  NO_NEXT_LINE,
  changeLine,
  changeWindow,
  deltaLabel,
  enoughLine,
  highlightLine,
  nextLine,
  recordedDaysLine,
} from './closingText';

const CATEGORY = '쇼핑';

function highlight(partial: Partial<HighlightOut> & Pick<HighlightOut, 'kind'>): HighlightOut {
  return {
    amount: null,
    category_id: null,
    count: null,
    previous: null,
    ...partial,
  };
}

const CHANGE: ChangeOut = {
  category_id: 'c1',
  current: '90000',
  previous: '47300',
  delta: '42700',
};

const NEXT: NextOut = { kind: 'category_cap', category_id: 'c1', suggested_cap: '48000' };

/** 결산이 화면에 낼 수 있는 문장 전부. 하나를 더하면 여기에도 더한다. */
function everySentence(): string[] {
  return [
    ...CLOSING_CARDS.map((card) => card.title),
    enoughLine('2026-08'),
    deltaLabel('2026-08'),
    recordedDaysLine(12, 31),
    highlightLine(highlight({ kind: 'within_budget', amount: '60000' })) ?? '',
    highlightLine(
      highlight({ kind: 'category_decrease', amount: '100000', previous: '300000' }),
      CATEGORY,
    ) ?? '',
    highlightLine(highlight({ kind: 'no_spend_days', count: 3 })) ?? '',
    highlightLine(highlight({ kind: 'goal_contribution', amount: '300000' })) ?? '',
    changeLine(CHANGE, CATEGORY),
    changeWindow(CHANGE),
    CHANGE_NOTE,
    NO_CHANGE_LINE,
    nextLine(NEXT, CATEGORY),
    NO_NEXT_LINE,
  ];
}

describe('결산 문장', () => {
  it('어느 문장에도 탓하는 말이 없다', () => {
    for (const sentence of everySentence()) {
      expect(findForbiddenWords(sentence), sentence).toEqual([]);
    }
  });

  it('카드 순서는 잘한 것부터 고정이다', () => {
    // 늘어난 지출을 먼저 보여주면 그 뒤 문장을 아무도 안 읽는다.
    expect(CLOSING_CARDS.map((card) => card.key)).toEqual(['highlights', 'flow', 'change', 'next']);
  });

  it('끝난 달을 가리켜 적는다. 결산에 "이번 달" 은 늘 거짓이다', () => {
    expect(enoughLine('2026-08')).toBe('8월은 기록한 것만으로도 충분해요');
    expect(deltaLabel('2026-08')).toBe('8월 차액');
  });

  it('숫자는 서버가 준 값을 표기만 바꿔 넣는다', () => {
    expect(highlightLine(highlight({ kind: 'within_budget', amount: '60000' }))).toBe(
      '예산 안에서 마쳤어요 · 60,000원 남겼어요',
    );
    expect(changeLine(CHANGE, CATEGORY)).toBe('지난달보다 쇼핑 지출이 42,700원 늘었어요');
    expect(changeWindow(CHANGE)).toBe('지난달 47,300원 → 90,000원');
    expect(nextLine(NEXT, CATEGORY)).toBe('쇼핑 예산 48,000원, 이거 하나면 충분해요');
  });

  it('분류 이름을 모르면 줄인 것을 말하지 않는다', () => {
    // 이름 없이 "그 분류를 줄였어요" 는 무엇을 줄였다는 말인지 알 수 없다.
    expect(highlightLine(highlight({ kind: 'category_decrease', amount: '100000' }))).toBeNull();
    expect(highlightLine(highlight({ kind: 'no_spend_days' }))).toBeNull();
  });
});
