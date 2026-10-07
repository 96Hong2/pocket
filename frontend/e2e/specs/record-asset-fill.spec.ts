import { formatCurrency } from '../../src/shared/lib/format';
import { logsNamed } from '../support/aitMock';
import { CAPTURE_DATA_URI, mockImagesSeeded, seedMockImages } from '../support/deviceMock';
import { expect, test } from '../support/fixtures';
import { shotBothWidths } from '../support/shots';

/**
 * 기록하기에서 캡처와 글로 저축·투자 채우기.
 *
 * 「캡처로 정리」 와 「글로 쓰기」 에도 종류 칩(지출, 수입, 이체, 저축·투자)이 선다. 저축·투자를
 * 고르면 거래가 아니라 자산을 채운다. 캡처는 자산 화면의 캡처로 채우기와 같은 흐름(읽는 동안
 * 전면 광고, 같은 검토, 같은 저장)이고, 글은 적은 보유 내역을 같은 검토로 채운다. 저장하면
 * 기록 목록이 아니라 내 자산 화면으로 간다.
 *
 * 서버 스텁: 캡처는 그림을 안 읽고 늘 다섯 줄(청년도약계좌 3,300,000, 카카오뱅크 1,250,000,
 * 연금저축펀드 2,100,000, 엔비디아, 마이크로소프트)을 낸다. 글은 규칙으로 읽는다
 * (「삼성전자 3주 21만원」 → 주식 3주, 넣은 돈 210,000, docs/API_CONTRACT.md).
 */

const CAPTURE = '**/api/v1/assets/capture';

test.beforeEach(async ({ page }) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);
});

test('캡처 + 저축·투자는 자산 캡처와 같은 광고와 검토를 지나 저장하면 내 자산 화면에 채워진다', async ({
  assets,
  home,
  page,
  prep,
  recordSheet,
}) => {
  test.slow();
  await prep.putAssets([{ group: 'cash', label: '카카오뱅크', amount: 1_000_000 }]);
  let sentImage = '';
  await page.route(CAPTURE, async (route) => {
    sentImage = (route.request().postDataJSON() as { image: string }).image;
    await route.continue();
  });

  await home.open();
  await home.waitReady();
  expect(await mockImagesSeeded(page)).toBe(true);
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.methodTab('캡처로 정리').click();
  await recordSheet.kindChip('저축·투자').click();
  await expect(recordSheet.kindChip('저축·투자')).toHaveAttribute('aria-checked', 'true');
  await expect(recordSheet.nextButton).toHaveText('사진 고르기');
  // 자산 캡처는 읽을 때마다 광고가 선다. 버튼 바로 아래에서 미리 알린다.
  await expect(recordSheet.assetFill.adLine).toBeVisible();
  await shotBothWidths(page, 'B_기록하기_캡처_종류칩');

  await recordSheet.next();
  await recordSheet.assetFill.waitStep('review');
  expect(sentImage.startsWith('data:image/')).toBe(true);
  await expect(recordSheet.assetFill.row('카카오뱅크')).toHaveAttribute('data-state', 'changed');
  await expect(recordSheet.assetFill.row('카카오뱅크')).toContainText(
    `+${formatCurrency(250_000)}`,
  );
  await expect(recordSheet.assetFill.row('연금저축펀드')).toContainText('새 항목, 연금');
  await expect(recordSheet.assetFill.saveButton).toHaveText('5줄 저장');
  await shotBothWidths(page, 'B_기록하기_캡처_저축투자_검토');

  // 자산 화면 캡처와 같은 전면 광고 한 편이다.
  const ads = await logsNamed(page, 'interstitial_result');
  expect(ads.map((log) => log.params.where)).toEqual(['asset_capture']);
  const read = (await logsNamed(page, 'asset_capture')).find((log) => log.params.step === 'read');
  expect(read?.params).toMatchObject({ from: 'record', input: 'photo', rows: 5, new_items: 4 });

  // 검토 중에 ‹ 를 누르면 버릴지 묻는다. 남으면 검토가 그대로다.
  await recordSheet.back();
  await expect(recordSheet.panelLeave.dialog).toBeVisible();
  await recordSheet.panelLeave.stayButton.click();
  await recordSheet.assetFill.waitStep('review');

  await recordSheet.assetFill.saveButton.click();
  await recordSheet.waitClosed();
  await assets.waitArrived();
  await expect(assets.row('카카오뱅크')).toContainText(formatCurrency(1_250_000));
  await expect(assets.groupTotal('연금')).toHaveText(formatCurrency(2_100_000));
  // 거래로 적지 않는다.
  expect(await logsNamed(page, 'save_result')).toEqual([]);
  const saved = (await logsNamed(page, 'asset_capture')).find((log) => log.params.step === 'saved');
  expect(saved?.params).toMatchObject({ from: 'record', input: 'photo', rows: 5 });
});

test('글 + 저축·투자는 적은 보유 내역을 같은 검토로 채우고 저장하면 내 자산 화면으로 간다', async ({
  assets,
  home,
  page,
  recordSheet,
}) => {
  test.slow();
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.methodTab('글로 쓰기').click();
  await expect(recordSheet.kindChip('지출')).toHaveAttribute('aria-checked', 'true');
  await recordSheet.kindChip('저축·투자').click();
  await shotBothWidths(page, 'B_기록하기_글_종류칩');
  await recordSheet.next();

  await expect(recordSheet.assetFill.textarea).toBeVisible();
  await expect(recordSheet.assetFill.textarea).toHaveAttribute(
    'placeholder',
    '삼성전자 3주 21만원, 카카오뱅크 적금 300만원',
  );
  // 거래 줄글 칸은 감춰져 있다.
  await expect(recordSheet.nl.textarea).toBeHidden();
  await shotBothWidths(page, 'B_기록하기_글_저축투자_적기');

  await recordSheet.assetFill.analyze('삼성전자 3주 21만원, 카카오뱅크 적금 300만원');
  await expect(recordSheet.assetFill.rows).toHaveCount(2);
  await expect(recordSheet.assetFill.row('삼성전자')).toContainText('새 항목, 투자');
  // 넣은 돈이 따로 안 적힌 새 종목은 적은 금액을 넣은 돈으로 본다.
  await expect(recordSheet.assetFill.row('삼성전자')).toContainText(
    `3주 보유, 넣은 돈 ${formatCurrency(210_000)}`,
  );
  await expect(recordSheet.assetFill.row('삼성전자')).toContainText(formatCurrency(210_000));
  await expect(recordSheet.assetFill.row('카카오뱅크 적금')).toContainText('새 항목, 예적금·현금');
  await expect(recordSheet.assetFill.saveButton).toHaveText('2줄 저장');
  await shotBothWidths(page, 'B_기록하기_글_저축투자_검토');

  await recordSheet.assetFill.saveButton.click();
  await recordSheet.waitClosed();
  await assets.waitArrived();
  await expect(assets.row('삼성전자')).toContainText(formatCurrency(210_000));
  await expect(assets.row('카카오뱅크 적금')).toContainText(formatCurrency(3_000_000));
  await shotBothWidths(page, 'B_저장뒤_내자산');

  expect(await logsNamed(page, 'save_result')).toEqual([]);
  const steps = (await logsNamed(page, 'asset_capture')).map((log) => [
    log.params.step,
    log.params.input,
  ]);
  expect(steps).toEqual([
    ['read', 'text'],
    ['saved', 'text'],
  ]);
  // 글은 광고 없이 읽는다.
  expect(await logsNamed(page, 'interstitial_result')).toEqual([]);
});

test('글과 캡처에서 지출을 고르면 지금처럼 거래 줄글과 캡처 화면이다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.methodTab('글로 쓰기').click();
  await recordSheet.next();
  await expect(recordSheet.nl.textarea).toBeVisible();
  await expect(recordSheet.assetFill.body).toHaveCount(0);

  await recordSheet.back();
  await recordSheet.methodTab('캡처로 정리').click();
  await expect(recordSheet.kindChip('지출')).toHaveAttribute('aria-checked', 'true');
  // 지출 캡처의 첫 화면에는 자산 캡처 예고가 없다.
  await expect(recordSheet.assetFill.adLine).toHaveCount(0);
});
