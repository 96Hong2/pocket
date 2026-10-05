import { formatCurrency } from '../../src/shared/lib/format';
import { TEST_IDS } from '../../src/shared/testIds';
import { expect, test } from '../support/fixtures';

/**
 * 읽어 온 기록과 고치기에서의 저축·투자.
 *
 * 지키는 것:
 * - 줄글 「적금 30만 넣음」 은 저축·투자로 읽히고, 매달 넣는 통장이 하나면 그 통장에 맞춰진다.
 * - 검토 줄의 「어디에」 칩을 눌러 다른 통장으로 바꿀 수 있고, 저장하면 바꾼 통장이 늘어난다.
 * - 검토 줄과 고치기 화면에서 종류로 저축·투자를 고를 수 있다.
 */

const KINDS = ['지출', '수입', '이체', '저축·투자'];

test('줄글 「적금 30만 넣음」 은 저축·투자 + 청년도약계좌로 읽히고 칩을 눌러 바꿀 수 있다', async ({
  assets,
  page,
  home,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([
    { group: 'cash', label: '청년도약계좌', amount: 1_000_000, monthly: 300_000 },
    { group: 'cash', label: '비상금 통장', amount: 500_000 },
  ]);

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('적금 30만 넣음');

  const row = recordSheet.nl.rows.first();
  const destChip = row.getByTestId(TEST_IDS.nlCandidateDest);
  await expect(recordSheet.nl.rows).toHaveCount(1);
  await expect(destChip).toHaveAccessibleName('어디에 청년도약계좌, 바꾸기');
  await expect(row.getByText('저축·투자', { exact: true })).toBeVisible();
  await expect(row.getByTestId(TEST_IDS.nlCandidateAmount)).toContainText('300,000');

  await test.step('펼친 줄에서 종류 넷을 고를 수 있다', async () => {
    await destChip.click();
    const kinds = page.getByRole('radiogroup', { name: '종류' }).getByRole('radio');
    await expect(kinds).toHaveText(KINDS);
    await expect(
      page.getByRole('radiogroup', { name: '종류' }).getByRole('radio', { name: '저축·투자' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  await test.step('어디에를 비상금 통장으로 바꾼다', async () => {
    await recordSheet.destPicked.click();
    await recordSheet.destCell('비상금 통장').click();
    await page.getByRole('button', { name: '완료', exact: true }).click();
    await expect(row.getByTestId(TEST_IDS.nlCandidateDest)).toHaveAccessibleName(
      '어디에 비상금 통장, 바꾸기',
    );
  });

  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await assets.open();
  await assets.waitReady();
  await expect(assets.row('비상금 통장')).toContainText(formatCurrency(800_000));
  await expect(assets.row('청년도약계좌')).toContainText(formatCurrency(1_000_000));
});

test('고치기 화면에서 지출을 저축·투자로 바꾸면 지출에서 빠지고, 저축·투자 기록은 종류 넷을 고른다', async ({
  home,
  prep,
}) => {
  await prep.putAssets([
    { group: 'cash', label: '청년도약계좌', amount: 1_000_000, monthly: 300_000 },
  ]);
  const food = await prep.categoryIdByName('식비');
  await prep.setBudget(1_000_000);
  await prep.addTransaction({ amount: 300_000, categoryId: food });

  await home.open();
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(700_000));

  await home.today.row('식비').click();
  await home.edit.waitOpen();
  await expect(home.edit.kindToggle.getByRole('button')).toHaveText(['지출', '수입', '저축·투자']);
  await home.edit.kindButton('저축·투자').click();
  // 저축·투자는 분류 자리에 「어디에」 가 선다. 고르기 전에는 「완료」 가 꺼져 있다.
  await expect(home.edit.categoryGroup).toHaveCount(0);
  await expect(home.edit.doneButton).toBeDisabled();
  await home.edit.dialog
    .getByRole('group', { name: '어디에', exact: true })
    .getByRole('button', { name: '청년도약계좌', exact: true })
    .click();
  await home.edit.doneButton.click();
  await home.edit.waitClosed();

  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(1_000_000));
  await expect(home.today.row('저축·투자')).toBeVisible();

  await home.today.row('저축·투자').click();
  await home.edit.waitOpen();
  await expect(home.edit.kindToggle.getByRole('button')).toHaveText(KINDS);
});
