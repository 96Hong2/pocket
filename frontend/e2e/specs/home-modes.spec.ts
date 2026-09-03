import { formatCurrency } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 홈이 상황에 따라 다른 얼굴로 뜬다.
 *
 * 며칠 비운 상태는 화면으로 만들 수 없어 사전 조건만 API 로 심는다.
 * 행동과 단언은 화면으로 한다.
 */

test('며칠 비우면 복구 카드가 뜨고, 오늘 기록하면 사라진다', async ({
  home,
  recordSheet,
  prep,
}) => {
  await test.step('나흘 전 기록만 있는 상태를 만든다', async () => {
    const foodId = await prep.categoryIdByName('식비');
    await prep.addExpense({ amount: 9_000, daysAgo: 4, categoryId: foodId });
  });

  await test.step('복구 카드가 뜬다', async () => {
    await home.open();
    await home.waitReady();
    await expect(home.catchUpButton).toBeVisible();
  });

  await test.step('오늘 기록하면 카드가 사라진다', async () => {
    await home.catchUpButton.click();
    await recordSheet.waitOpen();
    await recordSheet.enterAmount(5_000);
    await recordSheet.pickCategory('식비');
    await recordSheet.waitSaved();
    await recordSheet.confirmButton.click();
    await recordSheet.waitClosed();

    await expect(home.catchUpButton).toHaveCount(0);
  });
});

test('예산이 있으면 남은 예산이 먼저 보인다', async ({ home, prep }) => {
  await prep.setBudget(300_000);
  await prep.addExpense({ amount: 20_000, daysAgo: 0 });

  await home.open();
  await home.waitReady();

  await expect(home.remainingBudget).toHaveText(formatCurrency(280_000));
  // 예산을 정한 뒤에는 예산을 다시 묻지 않는다.
  await expect(home.saveBudgetButton).toHaveCount(0);
});

test('광고가 붙지 않으면 빈 자리를 남기지 않는다', async ({ home }) => {
  await home.open();
  await home.waitReady();

  // 슬롯 자체는 항상 DOM 에 있다. 홈이 모드를 바꿀 때 다시 붙는 것을 막으려고 최상위에 둔 자리다.
  await expect(home.adSlot).toHaveCount(1);

  const box = await home.adSlot.boundingBox();
  const height = box?.height ?? 0;

  // 목 환경에서는 배너가 안 채워진다. 그때 높이가 남으면 화면에 빈 칸이 생긴다.
  // 채워졌다면 규격대로 96px 여야 한다.
  expect(height === 0 || height === 96, `광고 자리 높이가 ${height}px 다`).toBe(true);
});
