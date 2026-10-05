import { formatCurrency } from '../../src/shared/lib/format';
import { TEST_IDS } from '../../src/shared/testIds';
import { logsNamed } from '../support/aitMock';
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
  // 검토 화면 저장도 있던 항목을 바꾼 것으로 남는다. 로그는 문서마다 새로 쌓여 주소를 옮기기 전에 읽는다.
  const changed = await logsNamed(page, 'asset_changed');
  expect(changed.map((log) => [log.params.action, log.params.from, log.params.group])).toEqual([
    ['updated', 'record', 'cash'],
  ]);
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await assets.open();
  await assets.waitReady();
  await expect(assets.row('비상금 통장')).toContainText(formatCurrency(800_000));
  await expect(assets.row('청년도약계좌')).toContainText(formatCurrency(1_000_000));
});

test('매달 넣는 항목이 둘이면 「적금 30만 넣음」 은 저축·투자로 서되 어디에를 골라야 켤 수 있다', async ({
  assets,
  page,
  home,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([
    { group: 'cash', label: '청년도약계좌', amount: 1_000_000, monthly: 300_000 },
    { group: 'cash', label: '주택청약', amount: 2_000_000, monthly: 100_000 },
  ]);

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('적금 30만 넣음');

  const row = recordSheet.nl.rows.first();
  const destChip = row.getByTestId(TEST_IDS.nlCandidateDest);
  const pick = row.getByRole('checkbox');
  await expect(recordSheet.nl.rows).toHaveCount(1);
  // 「이체 / 분류 없음」 이 아니라 저축·투자다. 어디에는 아직 안 골랐다.
  await expect(row.getByText('저축·투자', { exact: true })).toBeVisible();
  await expect(row.getByText('이체', { exact: true })).toHaveCount(0);
  await expect(row.getByText('분류 없음')).toHaveCount(0);
  await expect(destChip).toHaveText('어디에 고르기');
  await expect(destChip).toHaveAccessibleName('어디에 고르기');
  // 고르기 전에는 켤 수 없다.
  await expect(pick).not.toBeChecked();
  await expect(pick).toBeDisabled();

  await destChip.click();
  await recordSheet.destCell('주택청약').click();
  await page.getByRole('button', { name: '완료', exact: true }).click();
  await expect(destChip).toHaveAccessibleName('어디에 주택청약, 바꾸기');
  await expect(pick).toBeChecked();
  await expect(pick).toBeEnabled();

  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await assets.open();
  await assets.waitReady();
  await expect(assets.row('주택청약')).toContainText(formatCurrency(2_300_000));
  await expect(assets.row('청년도약계좌')).toContainText(formatCurrency(1_000_000));
});

test('고치기 화면에서 지출을 저축·투자로 바꾸면 지출에서 빠지고, 저축·투자 기록은 종류 넷을 고른다', async ({
  home,
  page,
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
  // 있던 항목에 붙였다.
  const changed = await logsNamed(page, 'asset_changed');
  expect(changed.map((log) => [log.params.action, log.params.from, log.params.group])).toEqual([
    ['updated', 'record', 'cash'],
  ]);

  await home.today.row('저축·투자').click();
  await home.edit.waitOpen();
  await expect(home.edit.kindToggle.getByRole('button')).toHaveText(KINDS);
  // 분류가 없는 저축·투자 기록은 머리에 「기록」 대신 종류 이름을 쓴다.
  await expect(home.edit.title).toHaveText(/^저축·투자 · /);
});

test('어디에로 고른 항목을 자산 화면에서 지워도 고치기에서 메모를 고쳐 저장할 수 있다', async ({
  assets,
  home,
  prep,
}) => {
  const saved = await prep.putAssets([
    { group: 'cash', label: '청년도약계좌', amount: 1_000_000 },
    { group: 'cash', label: '비상금 통장', amount: 500_000 },
  ]);
  const youth = saved.items.find((item) => item.label === '청년도약계좌');
  if (youth?.item_key == null) throw new Error('청년도약계좌 항목 키가 없다');
  await prep.addAssetTransfer({ amount: 300_000, itemKey: youth.item_key });

  await assets.open();
  await assets.waitReady();
  await assets.remove('청년도약계좌');
  await expect(assets.row('청년도약계좌')).toHaveCount(0);

  await home.open();
  await home.waitReady();
  await home.today.row('저축·투자').click();
  await home.edit.waitOpen();
  // 지운 항목은 서버도 이름을 주지 않는다. 접힌 줄이 그렇다고 말하고, 어디에를 그대로 둔 것으로 본다.
  await expect(
    home.edit.dialog.getByRole('button', { name: '어디에: 지운 항목. 눌러서 바꾸기' }),
  ).toBeVisible();
  await home.edit.dialog.getByLabel('메모').fill('지운 통장');
  await expect(home.edit.doneButton).toBeEnabled();
  await home.edit.doneButton.click();
  await home.edit.waitClosed();
});

test('분류도 상호도 없는 이체를 고치기로 열면 머리 제목이 「기록」 이 아니라 「이체」 다', async ({
  home,
  prep,
}) => {
  await prep.addTransaction({ amount: 50_000, type: 'transfer' });

  await home.open();
  await home.waitReady();
  await home.today.row('기록').click();
  await home.edit.waitOpen();
  await expect(home.edit.title).toHaveText(/^이체 · /);
});
