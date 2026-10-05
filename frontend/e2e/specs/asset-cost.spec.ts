import { formatCurrency } from '../../src/shared/lib/format';
import { CAPTURE_DATA_URI, seedMockImages } from '../support/deviceMock';
import { expect, test } from '../support/fixtures';
import { shotBothWidths as shot } from '../support/shots';
import type { AssetsScreen } from '../screens/AssetsScreen';
import type { RecordSheet } from '../screens/RecordSheet';

/**
 * 캡처로 넣은 종목의 수익률 정합성.
 *
 * 지키는 것:
 * - 캡처가 보유 화면의 수량과 평가손익을 읽으면 넣은 돈은 서버가 정하고(평가금액 − 평가손익),
 *   검토 줄과 자산 화면 줄에 같은 수익률 칩이 선다. 못 읽은 줄은 칩도 넣은 돈도 없다.
 * - 넣은 돈을 모르는 투자 항목도 「팔았어요」 가 선다. 금액으로 팔 때는 「전부」 와 「남은 금액」 으로
 *   판 몫을 정하고, 넣은 돈을 모르면 「넣은 돈」 칸이 하나 더 선다. 비우면 수익률이 어디에도 없다.
 * - 다시 캡처하면 금액만 있던 항목이 읽은 수량과 넣은 돈으로 종목이 된다.
 *
 * 서버 스텁은 그림을 안 읽고 다섯 줄을 낸다. 그 가운데 엔비디아 2주(평가금액 2,801,830원,
 * 평가손익 +801,830원)와 마이크로소프트 47,446원(금액만)이 보유 화면 줄이다.
 * 기대값은 수익률 예 넷(서버 tests/domain/test_asset_ledger.py, 화면 assetMath.test.ts)에서 왔다.
 *
 * POCKET_SHOT_DIR 을 주면 바뀐 화면을 390, 344 폭으로 찍어 그 폴더에 둔다.
 */

/** 항목 시트 「팔았어요」 로 기록 시트의 팔기 화면을 연다. */
async function openSell(assets: AssetsScreen, recordSheet: RecordSheet, name: string) {
  await assets.open();
  await assets.waitReady();
  await assets.openEdit(name);
  await assets.sheet.sellButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.amountTitle).toHaveText('얼마 받았어요?');
}

const AMAZON = { group: 'investment', label: '아마존', amount: 1_000_000 } as const;

test('캡처가 수량과 평가손익을 읽은 줄은 검토와 자산 화면에 같은 수익률 칩이 서고 못 읽은 줄은 금액만 있고, 그 줄도 팔 수 있다', async ({
  assets,
  page,
  prep,
  recordSheet,
}) => {
  test.slow();
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await prep.putAssets([{ group: 'cash', label: '카카오뱅크', amount: 1_000_000 }]);

  await assets.open();
  await assets.waitReady();
  await assets.captureEntry.click();
  await assets.capture.pickButton.click();
  await assets.capture.waitStep('review');

  const nvidia = assets.capture.row('엔비디아');
  await expect(nvidia).toContainText('2주 보유, 넣은 돈 2,000,000원');
  await expect(nvidia).toContainText(formatCurrency(2_801_830));
  await expect(nvidia.getByTestId('asset-capture-rate')).toHaveText('+40.1%');
  const msft = assets.capture.row('마이크로소프트');
  await expect(msft).not.toContainText('넣은 돈');
  await expect(msft.getByTestId('asset-capture-rate')).toHaveCount(0);
  await shot(page, '캡처_검토_넣은돈_읽은줄과_못읽은줄');

  await expect(assets.capture.saveButton).toHaveText('5줄 저장');
  await assets.capture.saveButton.click();
  await expect(assets.capture.body).toHaveCount(0);

  await expect(assets.row('엔비디아')).toContainText('2주 보유, 넣은 돈 2,000,000원');
  await expect(assets.rowChip('엔비디아', /^\+40\.1%$/)).toBeVisible();
  await expect(assets.row('마이크로소프트')).not.toContainText('넣은 돈');
  await expect(assets.rowChip('마이크로소프트', /%|현재가/)).toHaveCount(0);
  await shot(page, '자산화면_투자그룹_캡처저장뒤', assets.row('엔비디아'));

  // 캡처로 금액만 들어온 마이크로소프트를 그대로 판다. 47,446원어치를 전부 50,000원에, 넣은 돈 40,000원.
  // 수익 10,000원, +25%.
  await assets.openEdit('마이크로소프트');
  await assets.sheet.sellButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(50_000);
  await recordSheet.sellAll();
  await recordSheet.sellBox('넣은 돈').click();
  await recordSheet.input.enterAmount(40_000);
  await expect(recordSheet.sellPreview).toContainText('+10,000원');
  await expect(recordSheet.sellPreview).toContainText('+25%');
  await recordSheet.input.saveButton.click();
  await expect(recordSheet.feedback.headline).toHaveText('마이크로소프트 팔았어요');
  await expect(recordSheet.savedAssetRow('left')).toContainText(formatCurrency(0));
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(assets.rowChip('마이크로소프트', /^\+25% 실현$/)).toBeVisible();
});

test('다시 캡처하면 금액만 있던 항목이 읽은 수량과 넣은 돈으로 종목이 되고 줄이 늘지 않는다', async ({
  assets,
  page,
  prep,
}) => {
  test.slow();
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await prep.putAssets([{ group: 'investment', label: '엔비디아', amount: 2_500_000 }]);

  await assets.open();
  await assets.waitReady();
  await expect(assets.row('엔비디아')).not.toContainText('보유');
  await assets.captureEntry.click();
  await assets.capture.pickButton.click();
  await assets.capture.waitStep('review');
  await expect(assets.capture.row('엔비디아')).toContainText('2주 보유, 넣은 돈 2,000,000원');
  await assets.capture.saveButton.click();
  await expect(assets.capture.body).toHaveCount(0);

  await expect(assets.rows('투자').filter({ hasText: '엔비디아' })).toHaveCount(1);
  await expect(assets.row('엔비디아')).toContainText('2주 보유, 넣은 돈 2,000,000원');
  await expect(assets.rowChip('엔비디아', /^\+40\.1%$/)).toBeVisible();
});

test('넣은 돈 모르는 항목을 전부 팔고 받은 돈이 지금 금액보다 커도 넣은 돈을 적으면 그 기록부터 수익률이 나온다', async ({
  assets,
  page,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([AMAZON]);
  await assets.open();
  await assets.waitReady();
  await expect(assets.row('아마존')).not.toContainText('넣은 돈');
  await assets.openEdit('아마존');
  await expect(assets.sheet.field('넣은 돈')).toHaveValue('');
  await expect(assets.sheet.field('넣은 돈')).toHaveAttribute('placeholder', '모르면 비워 둬요');
  await shot(page, '항목시트_넣은돈_모르는_투자항목');
  await assets.sheet.sellButton.click();
  await recordSheet.waitOpen();

  await expect(recordSheet.sellBox('넣은 돈')).toHaveAccessibleName('넣은 돈 모르면 비워 둬요');
  await recordSheet.input.enterAmount(1_200_000);
  await recordSheet.sellAll();
  await expect(recordSheet.sellAllButton).toHaveAttribute('aria-pressed', 'true');
  // 전부 팔면 남은 금액 칸이 접힌다. 다시 누르면 일부로 돌아가 칸이 선다.
  await expect(recordSheet.sellBox('남은 금액')).toHaveCount(0);
  await recordSheet.sellAll();
  await expect(recordSheet.sellBox('남은 금액')).toHaveAccessibleName('남은 금액 0원');
  await recordSheet.sellAll();
  await expect(recordSheet.sellBox('남은 금액')).toHaveCount(0);
  // 넣은 돈을 모르면 미리보기가 없다.
  await expect(recordSheet.sellPreview).toHaveCount(0);

  await recordSheet.sellBox('넣은 돈').click();
  await recordSheet.input.enterAmount(800_000);
  await expect(recordSheet.sellBox('넣은 돈')).toHaveAccessibleName('넣은 돈 800,000원');
  await expect(recordSheet.sellPreview).toContainText('넣은 돈 800,000원어치');
  await expect(recordSheet.sellPreview).toContainText('+400,000원');
  await expect(recordSheet.sellPreview).toContainText('+50%');
  await shot(page, '팔기_전부_넣은돈_적음');

  await recordSheet.input.saveButton.click();
  await expect(recordSheet.feedback.headline).toHaveText('아마존 팔았어요');
  await expect(recordSheet.savedAssetRow('gain')).toContainText('+400,000원');
  await expect(recordSheet.savedAssetRow('gain')).toContainText('+50%');
  await expect(recordSheet.savedAssetRow('left')).toContainText(formatCurrency(0));
  await shot(page, '저장뒤_전부팔기_수익률있음');

  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(assets.rowChip('아마존', /^\+50% 실현$/)).toBeVisible();
});

test('넣은 돈을 비우고 팔면 받은 돈만 적히고 수익률은 미리보기에도 저장 뒤에도 없다', async ({
  assets,
  page,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([AMAZON]);
  await openSell(assets, recordSheet, '아마존');

  await recordSheet.input.enterAmount(1_200_000);
  await recordSheet.sellAll();
  await expect(recordSheet.sellPreview).toHaveCount(0);
  await expect(recordSheet.input.saveButton).toBeEnabled();
  await recordSheet.input.saveButton.click();

  await expect(recordSheet.feedback.headline).toHaveText('아마존 팔았어요');
  await expect(recordSheet.savedAssetRow('gain')).toHaveCount(0);
  await expect(recordSheet.savedAssetRow('left')).toContainText(formatCurrency(0));
  await expect(recordSheet.sheet).not.toContainText('%');
  await shot(page, '저장뒤_넣은돈_비움_수익률없음');

  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(assets.rowChip('아마존', /%/)).toHaveCount(0);
});

test('일부를 팔면 남은 금액 처음 값은 지금 금액 − 받은 돈이고 고치면 그 값으로 판 몫을 정한다', async ({
  assets,
  page,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([{ ...AMAZON, cost: 800_000 }]);
  await openSell(assets, recordSheet, '아마존');
  // 넣은 돈을 알면 넣은 돈 칸이 없다.
  await expect(recordSheet.sellBox('넣은 돈')).toHaveCount(0);

  await recordSheet.input.enterAmount(300_000);
  await expect(recordSheet.sellBox('남은 금액')).toHaveAccessibleName('남은 금액 700,000원');
  await recordSheet.sellBox('남은 금액').click();
  await recordSheet.input.enterAmount(900_000);
  await expect(recordSheet.sellBox('남은 금액')).toHaveAccessibleName('남은 금액 900,000원');
  await expect(recordSheet.sellPreview).toContainText('넣은 돈 200,000원어치');
  await expect(recordSheet.sellPreview).toContainText('+100,000원');
  await expect(recordSheet.sellPreview).toContainText('+50%');
  await shot(page, '팔기_일부_남은금액');

  await recordSheet.input.saveButton.click();
  await expect(recordSheet.savedAssetRow('left')).toContainText(formatCurrency(900_000));
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(assets.row('아마존')).toContainText('넣은 돈 600,000원');
  await expect(assets.row('아마존')).toContainText(formatCurrency(900_000));
  await expect(assets.rowChip('아마존', /^\+50%$/)).toBeVisible();
});

test('항목 시트에서 넣은 돈만 적고 저장하면 칩이 생긴다', async ({ assets, prep }) => {
  await prep.putAssets([AMAZON]);
  await assets.open();
  await assets.waitReady();
  await expect(assets.rowChip('아마존', /%/)).toHaveCount(0);

  await assets.openEdit('아마존');
  await expect(assets.sheet.field('지금 금액')).toHaveValue(/1,000,000/);
  await assets.sheet.field('넣은 돈').fill('800000');
  await assets.sheet.save();

  await expect(assets.row('아마존')).toContainText('넣은 돈 800,000원');
  await expect(assets.rowChip('아마존', /^\+25%$/)).toBeVisible();
});

test('펀드를 일부 팔고 남은 금액 처음 값을 그대로 두면 지금 규칙과 같은 수익이 나온다', async ({
  assets,
  prep,
  recordSheet,
}) => {
  // 예4: 넣은 돈 1,000,000원, 지금 1,100,000원에서 550,000원을 받는다. 남은 금액 처음 값 550,000원.
  // 판 몫 50%, 넣은 돈 500,000원어치, 수익 +50,000원, +10%.
  await prep.putAssets([
    { group: 'investment', label: '펀드', kind: 'fund', amount: 1_100_000, cost: 1_000_000 },
  ]);
  await openSell(assets, recordSheet, '펀드');

  await recordSheet.input.enterAmount(550_000);
  await expect(recordSheet.sellBox('남은 금액')).toHaveAccessibleName('남은 금액 550,000원');
  await expect(recordSheet.sellPreview).toContainText('넣은 돈 500,000원어치');
  await expect(recordSheet.sellPreview).toContainText('+50,000원');
  await expect(recordSheet.sellPreview).toContainText('+10%');

  await recordSheet.input.saveButton.click();
  await expect(recordSheet.savedAssetRow('gain')).toContainText('+50,000원');
  await expect(recordSheet.savedAssetRow('gain')).toContainText('+10%');
  await expect(recordSheet.savedAssetRow('left')).toContainText(formatCurrency(550_000));
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(assets.row('펀드')).toContainText('넣은 돈 500,000원');
  await expect(assets.row('펀드')).toContainText(formatCurrency(550_000));
  await expect(assets.rowChip('펀드', /^\+10%$/)).toBeVisible();
});
