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
  await hint
    .getByRole('group', { name: '어디에' })
    .getByRole('button', { name: '청년도약계좌' })
    .click();

  await expect(page.getByText('저축·투자로 바꿨어요. 이번 달 지출에서 빠졌어요')).toBeVisible();
  await expect(recordSheet.feedback.headline).toHaveText(
    `청년도약계좌에 ${formatCurrency(SAVED)} 넣었어요`,
  );
  await expect(hint).toHaveCount(0);
  expect((await logsNamed(page, 'saving_hint_result')).map((log) => log.params.answer)).toEqual([
    'converted',
  ]);
  // 있던 통장에 붙어 그 통장 금액이 바뀌었다.
  const changed = await logsNamed(page, 'asset_changed');
  expect(changed.map((log) => [log.params.action, log.params.from, log.params.group])).toEqual([
    ['updated', 'record', 'cash'],
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

test('안내가 선 채로 시트를 끌어내려 닫으면 답 없이 닫았다고 남는다', async ({
  home,
  page,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([{ group: 'cash', label: '청년도약계좌', amount: 1_000_000 }]);
  await prep.addCategory('적금');

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(SAVED);
  await recordSheet.input.pickCategory('적금');

  const hint = page.getByTestId(TEST_IDS.savingHint);
  await expect(hint).toBeVisible();
  await recordSheet.dragDown();
  await recordSheet.waitClosed();

  expect((await logsNamed(page, 'saving_hint_result')).map((log) => log.params.answer)).toEqual([
    'dismissed',
  ]);
});

test('안내의 「새 종목이나 통장」 은 예적금·현금으로 열리고, 투자에서는 수량 종목 없이 펀드, 채권, 기타만 고른다', async ({
  home,
  page,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([{ group: 'cash', label: '비상금 통장', amount: 500_000 }]);
  await prep.addCategory('적금');

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(SAVED);
  await recordSheet.input.pickCategory('적금');

  const hint = page.getByTestId(TEST_IDS.savingHint);
  await hint.getByRole('button', { name: '저축·투자로 바꾸기', exact: true }).click();
  await hint
    .getByRole('group', { name: '어디에' })
    .getByRole('button', { name: '다른 곳' })
    .click();
  await recordSheet.destList.getByRole('button', { name: '새 종목이나 통장', exact: true }).click();

  const form = recordSheet.newDestForm;
  const groups = form.getByRole('radiogroup', { name: '자산 그룹' });
  const kinds = form.getByRole('radiogroup', { name: '투자 종류' });
  await expect(groups.getByRole('radio', { name: '예적금·현금', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await groups.getByRole('radio', { name: '투자', exact: true }).click();
  // 안내 카드에는 수량 칸이 없어 수량 종목은 고를 수 없다.
  await expect(kinds.getByRole('radio')).toHaveText(['펀드', '채권', '기타']);

  await kinds.getByRole('radio', { name: '펀드', exact: true }).click();
  await form.getByRole('textbox', { name: '이름' }).fill('테스트 펀드');
  await form.getByRole('button', { name: '저장', exact: true }).click();

  await expect(page.getByText('저축·투자로 바꿨어요. 이번 달 지출에서 빠졌어요')).toBeVisible();
  await expect(recordSheet.feedback.headline).toHaveText(
    `테스트 펀드에 ${formatCurrency(SAVED)} 넣었어요`,
  );
  const changed = await logsNamed(page, 'asset_changed');
  expect(changed.map((log) => [log.params.action, log.params.from, log.params.kind])).toEqual([
    ['created', 'record', 'fund'],
  ]);
});
