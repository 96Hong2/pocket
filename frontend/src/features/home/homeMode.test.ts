import { describe, expect, it } from 'vitest';

import {
  RATING_AFTER_RECORDS,
  RECOVERY_AFTER_DAYS,
  SECOND_CHANCE_AFTER_RECORDS,
  SHARE_AFTER_RECORDS,
  resolveHeroLayout,
  resolveHomeView,
  type HomeViewInput,
} from './homeMode';

function input(overrides: Partial<HomeViewInput> = {}): HomeViewInput {
  return {
    hasAnyTransaction: false,
    transactionCount: 0,
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

  /*
    예전에는 「이번 달 쓴 돈」 으로 떨어졌다. 그런데 앱 설정에는 그런 갈래가 아예 없어서,
    「남은 예산」 이 눌려 있는데 홈은 다른 것을 보여 주는 상태가 됐다. 고를 수 있는 것
    중 가장 가까운 쪽으로 떨어뜨린다.
  */
  it('남은 예산 설정인데 예산이 없으면 고를 수 있는 수입·지출로 떨어진다', () => {
    expect(resolveHeroLayout('remaining_budget', false)).toBe('incomeAndSpent');
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

describe('공유 권유', () => {
  it('몇 번 안 적어 본 사람에게는 앱을 알리라고 하지 않는다', () => {
    const view = resolveHomeView(
      input({ hasAnyTransaction: true, transactionCount: SHARE_AFTER_RECORDS - 1 }),
    );

    expect(view.showShareInvite).toBe(false);
  });

  it('충분히 써 본 사람에게만 묻는다', () => {
    const view = resolveHomeView(
      input({ hasAnyTransaction: true, transactionCount: SHARE_AFTER_RECORDS }),
    );

    expect(view.showShareInvite).toBe(true);
  });
});

describe('한 번뿐인 안내를 다시 묻는 때', () => {
  it('첫 기록만으로도 홈 추가와 저녁 알림을 함께 묻는다', () => {
    const view = resolveHomeView(input({ hasAnyTransaction: true, transactionCount: 1 }));

    expect(view.showHomeAdd).toBe(true);
    expect(view.showRemind).toBe(true);
    // 아직 두 번째 기회가 아니다. 이때 닫으면 첫 번째 표가 남는다.
    expect(view.secondChance).toBe(false);
  });

  it('한 번도 안 적은 사람에게는 둘 다 안 묻는다', () => {
    const view = resolveHomeView(input({ hasAnyTransaction: false, transactionCount: 0 }));

    expect(view.showHomeAdd).toBe(false);
    expect(view.showRemind).toBe(false);
  });

  it('다섯 번째 기록부터 두 번째 기회다', () => {
    const before = resolveHomeView(
      input({ hasAnyTransaction: true, transactionCount: SECOND_CHANCE_AFTER_RECORDS - 1 }),
    );
    const at = resolveHomeView(
      input({ hasAnyTransaction: true, transactionCount: SECOND_CHANCE_AFTER_RECORDS }),
    );

    expect(before.secondChance).toBe(false);
    expect(at.secondChance).toBe(true);
  });
});

describe('별점 권유', () => {
  it('별점은 공유보다 한참 뒤에 묻는다', () => {
    expect(RATING_AFTER_RECORDS).toBeGreaterThan(SHARE_AFTER_RECORDS);
    const few = resolveHomeView(
      input({ hasAnyTransaction: true, transactionCount: SHARE_AFTER_RECORDS }),
    );
    expect(few.showShareInvite).toBe(true);
    expect(few.showRatingAsk).toBe(false);
    const many = resolveHomeView(
      input({ hasAnyTransaction: true, transactionCount: RATING_AFTER_RECORDS }),
    );
    expect(many.showRatingAsk).toBe(true);
  });
});
