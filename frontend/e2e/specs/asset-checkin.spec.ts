import { formatCurrency, formatDayLabel, toLedgerDate } from '../../src/shared/lib/format';
import { logsNamed } from '../support/aitMock';
import { lastMonth, thisMonth, type PrepApi } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 한 달에 한 번 자산을 묻는 홈 카드.
 *
 * 묻는 자리는 홈 카드 한 곳이다. 「그대로예요」 한 번이면 그 달 숫자가 적히고,
 * 「바뀐 게 있어요」 는 자산 화면과 「바뀐 것만 고쳐요」 창을 연다.
 */

const KAKAO = 1_000_000;
const DEBT = 300_000;

/** 지난달에 적어 두고 이번 달에는 아직 안 적은 사람. */
async function seedLastMonth(prep: PrepApi): Promise<void> {
  await prep.putAssets([
    { group: 'cash', label: '카카오뱅크', amount: KAKAO },
    { group: 'debt', label: '학자금', amount: DEBT },
  ]);
  await prep.moveLatestAssetSnapshot(`${lastMonth()}-15`);
}

function monthLabel(): string {
  return `${Number(thisMonth().slice(5, 7))}월`;
}

test('홈 카드가 이번 달 자산을 묻고, 그대로예요 한 번에 이번 달 숫자가 적힌다', async ({
  assets,
  home,
  page,
  prep,
}) => {
  await seedLastMonth(prep);

  await home.open();
  await home.waitReady();
  await expect(home.assetCheckin.card).toContainText(`${monthLabel()} 자산, 지난달과 같아요?`);
  await expect(home.assetCheckin.card).toContainText('같으면 「그대로예요」 한 번이면 돼요');

  await home.assetCheckin.sameButton.click();
  await expect(
    home.toast.withText(`${monthLabel()} 자산을 적어 뒀어요. 다음 달에 또 물을게요`),
  ).toBeVisible();
  await expect(home.assetCheckin.card).toHaveCount(0);
  const answers = await logsNamed(page, 'asset_checkin_result');
  expect(answers.map((log) => log.params.answer)).toEqual(['same']);

  // 이번 달 점이 생겨 기준일이 오늘이 되고 지난달과 견주는 줄이 선다.
  await assets.open();
  await assets.waitReady();
  await expect(assets.basisLabel).toContainText(formatDayLabel(toLedgerDate(new Date())));
  await expect(assets.netWorthText).toContainText('지난달보다');
  await expect(assets.netWorth).toHaveText(formatCurrency(KAKAO - DEBT));
  // 자산 화면에는 같은 물음이 없다.
  await expect(assets.anyText(/지난달과 같아요/)).toHaveCount(0);

  await home.open();
  await home.waitReady();
  await expect(home.assetCheckin.card).toHaveCount(0);
});

test('바뀐 게 있어요는 자산 화면과 바뀐 것만 고쳐요 창을 연다', async ({
  assets,
  home,
  page,
  prep,
}) => {
  await seedLastMonth(prep);

  await home.open();
  await home.waitReady();
  await home.assetCheckin.changedButton.click();
  const answers = await logsNamed(page, 'asset_checkin_result');
  expect(answers.map((log) => log.params.answer)).toEqual(['changed']);

  await expect(assets.checkin.dialog).toBeVisible();
  await expect(assets.checkin.amount('카카오뱅크')).toHaveValue('1,000,000');
  await assets.checkin.amount('카카오뱅크').fill('1100000');
  await assets.checkin.saveButton.click();

  await expect(assets.checkin.dialog).toHaveCount(0);
  await expect(home.toast.withText(`${monthLabel()} 자산을 적어 뒀어요`)).toBeVisible();
  await expect(assets.netWorth).toHaveText(formatCurrency(1_100_000 - DEBT));
  await expect(assets.basisLabel).toContainText(formatDayLabel(toLedgerDate(new Date())));

  await home.open();
  await home.waitReady();
  await expect(home.assetCheckin.card).toHaveCount(0);
});
