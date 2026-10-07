import { formatCurrency } from '../../../src/shared/lib/format';
import { expect, test } from '../support/director';

/**
 * 관리 탭 예산 카드와 수정 시트 안 「예산 지우기」.
 *
 * 카드는 쓴 돈 / 예산, 막대, 상태 한 줄(남은 돈과 하루 쓸 돈)만 둔다. 지우기는 카드에서 빠져
 * 수정 시트 맨 아래로 갔고, 누르면 시트를 겹치지 않고 그 자리에서 한 번 묻는다.
 */

const BUDGET = 600_000;
const SEEDS = [
  { amount: 46_000, merchant: '이마트', category: '식비' },
  { amount: 89_000, merchant: '무신사', category: '쇼핑' },
  { amount: 32_900, merchant: '쿠팡', category: '쇼핑' },
  { amount: 23_000, merchant: '배달의민족', category: '식비' },
  { amount: 4_500, merchant: '스타벅스', category: '카페·간식' },
] as const;
const SPENT = SEEDS.reduce((sum, seed) => sum + seed.amount, 0);

test('69 예산 카드는 한 줄로 말하고, 지우기는 수정 시트 안에 있다', async ({
  appShell,
  demo,
  home,
  manage,
  prep,
}) => {
  await prep.setBudget(BUDGET);
  for (const seed of SEEDS) {
    await prep.addTransaction({
      amount: seed.amount,
      merchant: seed.merchant,
      categoryId: await prep.categoryIdByName(seed.category),
    });
  }

  await manage.open();
  await manage.waitReady();
  await demo.open('예산 카드', '쓴 돈과 예산, 막대 하나, 남은 돈 한 줄');

  await demo.step('카드 머리에 쓴 돈 / 예산, 아래에 막대 하나');
  await expect(manage.total.used).toHaveText(formatCurrency(SPENT));
  await expect(manage.total.amount).toHaveText(formatCurrency(BUDGET));
  await expect(manage.total.gauge).toBeVisible();
  await demo.beat(3);

  await demo.step('상태 한 줄에 남은 돈과 하루에 쓸 수 있는 돈이 선다');
  await expect(manage.total.caption).toHaveText(`${formatCurrency(BUDGET - SPENT)} 남았어요`);
  await expect(manage.total.daily).toBeVisible();
  await demo.beat(3);

  await demo.step('카드에는 지우기가 없다. 수정을 누르면 지금 금액이 담긴 시트가 열린다');
  await expect(manage.total.deleteButton).toHaveCount(0);
  await manage.total.openEdit();
  await expect(manage.total.sheet.amountField).toHaveValue('600,000');
  await demo.beat(2);

  await demo.step('맨 아래 작은 예산 지우기를 누르면 그 자리에서 한 번 묻는다');
  await manage.total.sheet.deleteButton.click();
  await expect(manage.total.sheet.deleteConfirm).toBeVisible();
  await expect(manage.total.sheet.keepButton).toBeVisible();
  await demo.beat(3);

  await demo.step('지울게요를 누르면 이번 달 예산이 없는 처음 카드로 돌아간다');
  await manage.total.sheet.confirmDeleteButton.click();
  await manage.total.sheet.waitClosed();
  await expect(manage.total.emptyTitle).toBeVisible();
  await expect(manage.total.startButton).toBeVisible();
  await demo.beat(3);

  await demo.step('홈은 예산 없이 이번 달 쓴 돈을 보여 준다');
  await appShell.goToTab('홈');
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveCount(0);
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SPENT));
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
