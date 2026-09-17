import { describe, expect, it } from 'vitest';

import { appLine, budgetLine, closingLine, goalDoneLine, goalLine, trimTitle } from './shareText';

/**
 * 공유 문구.
 *
 * 여기서 지키는 것은 둘이다. **금액이 나가지 않는 것**과, 사용자가 적은 이름이 문장을
 * 망가뜨리지 않는 것. 앞엣것은 한 번 새면 되돌릴 수 없어 문구마다 못 박는다.
 */

/** `12,000원` 같은 금액 표기. 문구 어디에도 있으면 안 된다. */
const MONEY = /[\d,]+\s*원/;

const ALL = [
  appLine(),
  goalLine('제주도 여행', 62),
  goalDoneLine('제주도 여행'),
  budgetLine('2026-09'),
  closingLine('2026-08', true),
  closingLine('2026-08', false),
];

describe('공유 문구', () => {
  it('어느 문구에도 금액이 들어가지 않는다', () => {
    for (const line of ALL) {
      expect(line, line).not.toMatch(MONEY);
    }
  });

  it('모두 앱 이름으로 끝난다. 받는 사람이 무슨 앱인지 알아야 누른다', () => {
    for (const line of ALL) {
      expect(line, line).toContain('10초 가계부');
    }
  });

  it('줄바꿈이 없다. 링크는 문구 다음 줄에 붙는다', () => {
    for (const line of ALL) {
      expect(line, line).not.toContain('\n');
    }
  });
});

describe('목표 문구', () => {
  it('진행률만 말한다', () => {
    expect(goalLine('제주도 여행', 62)).toBe(
      '「제주도 여행」 모으는 중이에요 · 62%까지 왔어요 · 10초 가계부',
    );
  });

  it('진행률이 범위를 벗어나도 0~100 안으로 붙인다', () => {
    expect(goalLine('여행', -3)).toContain('0%');
    expect(goalLine('여행', 140)).toContain('100%');
  });

  it('다 모았으면 진행률 대신 축하를 말한다', () => {
    expect(goalDoneLine('제주도 여행')).toBe('「제주도 여행」 다 모았어요! · 10초 가계부');
  });
});

describe('목표 이름 다듬기', () => {
  it('줄바꿈을 한 칸으로 바꾼다. 그대로 나가면 링크가 아래로 밀린다', () => {
    expect(trimTitle('제주도\n여행')).toBe('제주도 여행');
  });

  it('너무 길면 뒤를 줄인다. 미리보기가 두 줄 남짓만 보여 준다', () => {
    const long = '가'.repeat(40);
    expect(trimTitle(long)).toHaveLength(25);
    expect(trimTitle(long).endsWith('…')).toBe(true);
  });
});

describe('결산 문구', () => {
  it('예산을 지킨 달이면 그것부터 말한다', () => {
    expect(closingLine('2026-08', true)).toBe('8월은 예산 안에서 마쳤어요 · 10초 가계부');
  });

  it('지키지 못한 달을 탓하지 않는다. 정리했다는 사실만 말한다', () => {
    expect(closingLine('2026-08', false)).toBe('8월 가계부를 정리했어요 · 10초 가계부');
  });
});

describe('예산 문구', () => {
  it('몇 월 예산인지만 말한다', () => {
    expect(budgetLine('2026-09')).toBe('9월 예산을 정했어요 · 이번 달은 계획대로 · 10초 가계부');
  });
});
