import { describe, expect, it } from 'vitest';

import {
  RECOVERY_AFTER_DAYS,
  resolveHeroLayout,
  resolveHomeView,
  type HomeViewInput,
} from './homeMode';

function input(overrides: Partial<HomeViewInput> = {}): HomeViewInput {
  return {
    hasAnyTransaction: false,
    daysSinceLastTransaction: null,
    budgetAmount: null,
    ...overrides,
  };
}

describe('resolveHomeView', () => {
  it('처음 연 사람에게 예산을 묻지 않는다', () => {
    const view = resolveHomeView(input());

    expect(view.mode).toBe('firstUse');
    expect(view.hasBudget).toBe(false);
    expect(view.showBudgetSuggestion).toBe(false);
    expect(view.showFirstLead).toBe(true);
  });

  it('기록이 생기고 예산이 없으면 그때 예산 제안 카드를 띄운다', () => {
    const view = resolveHomeView(input({ hasAnyTransaction: true, daysSinceLastTransaction: 0 }));

    expect(view.mode).toBe('firstUse');
    expect(view.showBudgetSuggestion).toBe(true);
    expect(view.showFirstLead).toBe(false);
  });

  it('예산을 정하면 남은 예산 히어로로 바뀌고 제안 카드가 사라진다', () => {
    const view = resolveHomeView(
      input({
        hasAnyTransaction: true,
        daysSinceLastTransaction: 0,
        budgetAmount: '1000000',
      }),
    );

    expect(view.mode).toBe('default');
    expect(view.hasBudget).toBe(true);
    expect(view.showBudgetSuggestion).toBe(false);
  });

  it(`${RECOVERY_AFTER_DAYS - 1}일 비어 있는 것은 복귀로 보지 않는다`, () => {
    const view = resolveHomeView(
      input({
        hasAnyTransaction: true,
        daysSinceLastTransaction: RECOVERY_AFTER_DAYS - 1,
        budgetAmount: '1000000',
      }),
    );

    expect(view.mode).toBe('default');
  });

  it(`${RECOVERY_AFTER_DAYS}일부터 복귀 카드를 띄운다`, () => {
    const view = resolveHomeView(
      input({
        hasAnyTransaction: true,
        daysSinceLastTransaction: RECOVERY_AFTER_DAYS,
        budgetAmount: '1000000',
      }),
    );

    expect(view.mode).toBe('recovery');
    // 예산은 그대로 살아 있다. 복귀라고 해서 히어로가 사라지지 않는다.
    expect(view.hasBudget).toBe(true);
  });

  // 위 두 검사는 입력과 기대값을 같은 상수로 쓴다. 그래서 상수가 3 에서 4 로 바뀌어도
  // 둘 다 통과한다. 경계가 정확히 사흘이라는 것은 여기서 숫자로 못 박는다.
  it('경계는 사흘이다', () => {
    expect(RECOVERY_AFTER_DAYS).toBe(3);

    const away = (days: number) =>
      resolveHomeView(
        input({ hasAnyTransaction: true, daysSinceLastTransaction: days, budgetAmount: '1000000' }),
      ).mode;

    expect(away(2)).toBe('default');
    expect(away(3)).toBe('recovery');
  });

  it('기록이 하나도 없으면 오래 비었어도 복귀가 아니다', () => {
    const view = resolveHomeView(input({ hasAnyTransaction: false, daysSinceLastTransaction: 30 }));

    expect(view.mode).toBe('firstUse');
  });

  it('예산 금액이 0 이거나 읽히지 않으면 예산이 없는 것으로 본다', () => {
    expect(resolveHomeView(input({ budgetAmount: '0' })).hasBudget).toBe(false);
    expect(resolveHomeView(input({ budgetAmount: '' })).hasBudget).toBe(false);
  });
});

describe('resolveHeroLayout', () => {
  it('남은 예산 설정에 예산이 있으면 남은 예산을 크게 보여준다', () => {
    expect(resolveHeroLayout('remaining_budget', true)).toBe('remainingBudget');
  });

  it('남은 예산 설정인데 예산이 없으면 이번 달 쓴 돈으로 떨어진다', () => {
    expect(resolveHeroLayout('remaining_budget', false)).toBe('monthSpent');
  });

  it('번 돈과 쓴 돈은 예산이 있든 없든 같은 화면이다', () => {
    expect(resolveHeroLayout('income_expense', true)).toBe('incomeAndSpent');
    expect(resolveHeroLayout('income_expense', false)).toBe('incomeAndSpent');
  });

  it('번 돈과 남은 예산은 예산을 정했을 때만 그 모양이다', () => {
    expect(resolveHeroLayout('income_and_budget', true)).toBe('incomeAndBudget');
  });

  it('번 돈과 남은 예산인데 예산이 없으면 번 돈과 쓴 돈으로 떨어진다', () => {
    expect(resolveHeroLayout('income_and_budget', false)).toBe('incomeAndSpent');
  });

  it('설정을 아직 못 받았으면 남은 예산 설정과 같게 떨어진다', () => {
    expect(resolveHeroLayout(undefined, true)).toBe(resolveHeroLayout('remaining_budget', true));
    expect(resolveHeroLayout(undefined, false)).toBe(resolveHeroLayout('remaining_budget', false));
  });
});
