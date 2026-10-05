import { formatCurrency } from '../../src/shared/lib/format';
import { TEST_IDS } from '../../src/shared/testIds';
import { logsNamed } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 적금 안내.
 *
 * 「적금」 같은 지출 분류로 저장하면 저장 뒤 화면에 한 번 안내가 선다. 「저축·투자로 바꾸기」 로
 * 어디에 넣었는지 고르면 이번 기록이 저축·투자로 바뀌어 지출에서 빠진다. 「그냥 둘게요」 면
 * 그 기기에서 다시 묻지 않는다.
 */

const BUDGET = 1_000_000;
const SAVED = 300_000;

test('「적금」 분류로 저장하면 안내가 서고, 바꾸면 이번 기록이 저축·투자가 되어 지출에서 빠진다', async ({
  home,
  page,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([
    { group: 'cash', label: '청년도약계좌', amount: 1_000_000, monthly: SAVED },
  ]);
  await prep.addCategory('적금');
  await prep.setBudget(BUDGET);

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(SAVED);
  await recordSheet.input.pickCategory('적금');

  const hint = page.getByTestId(TEST_IDS.savingHint);
  await expect(hint).toContainText('「적금」 은 쓴 돈이 아니라 모은 돈이에요');

  await hint.getByRole('button', { name: '저축·투자로 바꾸기', exact: true }).click();
  await hint.getByRole('group', { name: '어디에' }).getByRole('button', { name: '청년도약계좌' }).click();

  await expect(page.getByText('저축·투자로 바꿨어요. 이번 달 지출에서 빠졌어요')).toBeVisible();
  await expect(recordSheet.feedback.headline).toHaveText(
    `청년도약계좌에 ${formatCurrency(SAVED)} 넣었어요`,
  );
  await expect(hint).toHaveCount(0);
  expect((await logsNamed(page, 'saving_hint_result')).map((log) => log.params.answer)).toEqual([
    'converted',
  ]);

  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET));
  await expect(home.today.row('저축·투자')).toBeVisible();
  await expect(home.today.row('적금')).toHaveCount(0);
});

test('「그냥 둘게요」 뒤에는 그 기기에서 다시 안 뜨고 기록은 지출로 남는다', async ({
  home,
  page,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([
    { group: 'cash', label: '청년도약계좌', amount: 1_000_000, monthly: SAVED },
  ]);
  await prep.addCategory('적금');
  await prep.setBudget(BUDGET);

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(SAVED);
  await recordSheet.input.pickCategory('적금');

  const hint = page.getByTestId(TEST_IDS.savingHint);
  await expect(hint).toBeVisible();
  await hint.getByRole('button', { name: '그냥 둘게요', exact: true }).click();
  await expect(hint).toHaveCount(0);
  expect((await logsNamed(page, 'saving_hint_result')).map((log) => log.params.answer)).toEqual([
    'kept',
  ]);

  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - SAVED));

  // 다시 열어도(새로 고쳐도) 기기에 남은 표시로 안 뜬다.
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(50_000);
  await recordSheet.input.pickCategory('적금');
  await expect(recordSheet.feedback.savedLabel).toBeVisible();
  await expect(recordSheet.feedback.confirmButton).toBeVisible();
  // 안내는 기기 표시를 읽은 뒤에 선다. 첫 저장에서 서던 만큼 기다린 뒤에도 없어야 한다.
  await page.waitForTimeout(1_500);
  await expect(hint).toHaveCount(0);
});
