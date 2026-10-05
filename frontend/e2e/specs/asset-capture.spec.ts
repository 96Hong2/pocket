import { formatCurrency } from '../../src/shared/lib/format';
import { logsNamed } from '../support/aitMock';
import { CAPTURE_DATA_URI, mockImagesSeeded, seedMockImages } from '../support/deviceMock';
import { expect, test } from '../support/fixtures';

/**
 * 잔액 화면 캡처로 자산 채우기.
 *
 * 입구는 한 줄과 「사진 고르기」 뿐이다. 사진을 고르면 읽는 동안 전면 광고가 늘 한 편 선다
 * (첫 장 무료 없음). 못 읽으면 탓하지 않는 화면이 서고 다음 한 번은 광고 없이 읽는다.
 *
 * 서버 스텁은 그림을 안 읽고 늘 세 줄(청년도약계좌 3,300,000, 카카오뱅크 1,250,000,
 * 연금저축펀드 2,100,000)을 낸다(docs/API_CONTRACT.md). 못 읽은 그림은 응답을 바꿔 만든다.
 */

const CAPTURE = '**/api/v1/assets/capture';
const EMPTY = {
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ items: [], meta: { provider: 'stub', is_stub: true, notes: [] } }),
};

test.beforeEach(async ({ page }) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);
});

test('입구는 한 줄과 사진 고르기뿐이고, 고르면 광고가 서고 검토가 그대로와 +금액과 새 항목을 보인다', async ({
  assets,
  page,
  prep,
}) => {
  test.slow();
  await prep.putAssets([
    { group: 'cash', label: '청년도약계좌', amount: 3_300_000 },
    { group: 'cash', label: '카카오뱅크', amount: 1_000_000 },
  ]);
  // 읽는 동안을 붙잡으려고 응답을 조금 늦춘다. 고른 사진이 서버까지 갔는지도 여기서 본다.
  let sentImage = '';
  await page.route(CAPTURE, async (route) => {
    sentImage = (route.request().postDataJSON() as { image: string }).image;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.continue();
  });

  await assets.open();
  await assets.waitReady();
  expect(await mockImagesSeeded(page)).toBe(true);

  await assets.captureEntry.click();
  await assets.capture.waitStep('intro');
  await expect(assets.capture.lead).toHaveText(
    '은행이나 증권 앱의 잔액 화면을 올리면 읽어요. 읽는 동안 광고가 나와요',
  );
  await expect(assets.capture.buttons).toHaveCount(1);

  await assets.capture.pickButton.click();
  await expect(assets.capture.reading).toBeVisible();
  await assets.capture.waitStep('review');
  expect(sentImage.startsWith('data:image/')).toBe(true);

  await expect(assets.capture.row('청년도약계좌')).toHaveAttribute('data-state', 'same');
  await expect(assets.capture.row('청년도약계좌')).toContainText('그대로');
  await expect(assets.capture.row('카카오뱅크')).toHaveAttribute('data-state', 'changed');
  await expect(assets.capture.row('카카오뱅크')).toContainText(`+${formatCurrency(250_000)}`);
  await expect(assets.capture.row('연금저축펀드')).toHaveAttribute('data-state', 'new');
  await expect(assets.capture.row('연금저축펀드')).toContainText('새 항목, 연금');

  // 첫 장도 광고 한 편이 섰다.
  const ads = await logsNamed(page, 'interstitial_result');
  expect(ads.map((log) => log.params.where)).toEqual(['asset_capture']);
  const read = (await logsNamed(page, 'asset_capture')).find((log) => log.params.step === 'read');
  expect(read?.params).toMatchObject({ rows: 3, new_items: 1 });
  expect(['watched', 'skipped']).toContain(read?.params.ad);

  await expect(assets.capture.saveButton).toHaveText('3줄 저장');
  await assets.capture.saveButton.click();
  await expect(assets.capture.body).toHaveCount(0);
  await expect(assets.groupTotal('연금')).toHaveText(formatCurrency(2_100_000));
  await expect(assets.row('카카오뱅크')).toContainText(formatCurrency(1_250_000));
  await expect(assets.rows('예적금·현금')).toHaveCount(2);
});

test('못 읽으면 탓하지 않는 화면이 서고, 다음 한 번은 광고 없이 읽는다', async ({
  assets,
  page,
  prep,
}) => {
  test.slow();
  await prep.putAssets([{ group: 'cash', label: '카카오뱅크', amount: 1_000_000 }]);
  await page.route(CAPTURE, (route) =>
    route.request().method() === 'POST' ? route.fulfill(EMPTY) : route.continue(),
  );

  await assets.open();
  await assets.waitReady();
  await assets.captureEntry.click();
  await assets.capture.pickButton.click();
  await assets.capture.waitStep('fail');
  await expect(assets.capture.fail).toContainText('이 사진에서는 잔액을 못 찾았어요');
  await expect(assets.capture.retryButton).toBeVisible();
  await expect(assets.capture.manualButton).toBeVisible();
  const first = await logsNamed(page, 'asset_capture');
  expect(first.find((log) => log.params.step === 'failed')?.params).toMatchObject({ rows: 0 });

  await page.unroute(CAPTURE);
  await assets.capture.retryButton.click();
  await assets.capture.waitStep('review');

  const reads = (await logsNamed(page, 'asset_capture')).filter(
    (log) => log.params.step === 'read',
  );
  expect(reads.map((log) => log.params.ad)).toEqual(['free_after_fail']);
  // 광고는 처음 한 번뿐이다.
  const ads = await logsNamed(page, 'interstitial_result');
  expect(ads.map((log) => log.params.where)).toEqual(['asset_capture']);
});

test('못 읽은 화면의 직접 적기는 항목 시트를 연다', async ({ assets, page, prep }) => {
  await prep.putAssets([{ group: 'cash', label: '카카오뱅크', amount: 1_000_000 }]);
  await page.route(CAPTURE, (route) =>
    route.request().method() === 'POST' ? route.fulfill(EMPTY) : route.continue(),
  );

  await assets.open();
  await assets.waitReady();
  await assets.captureEntry.click();
  await assets.capture.pickButton.click();
  await assets.capture.waitStep('fail');
  await assets.capture.manualButton.click();

  await expect(assets.capture.body).toHaveCount(0);
  await expect(assets.sheet.addDialog).toHaveAccessibleName('예적금·현금 항목 추가');
});
