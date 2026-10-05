import type { AssetsOut } from '../../src/shared/api/types';
import { formatCurrency } from '../../src/shared/lib/format';
import { adsShown, logsNamed } from '../support/aitMock';
import { lastMonth, thisMonth, type PrepApi } from '../support/api';
import { expect, test } from '../support/fixtures';
import { shotBothWidths } from '../support/shots';
import { EditSheetArea } from '../screens/CalendarScreen';

/**
 * 「내 자산 분석」 의 그림과 종류별 분석 광고.
 *
 * 지키는 것:
 * - 전체 분석에 리포트 같은 그림이 선다. 순자산 흐름, 지난달 대비 막대, 어디에 모았나,
 *   달마다 모은 돈, 큰 저축·투자 Top 5.
 * - Top 5 줄을 누르면 그 기록의 고치기 시트가 열리고, 금액을 고치면 분석이 새 숫자로 다시 그려진다.
 *   열린 분석 안에서 고친 것이라 광고를 다시 묻지 않는다.
 * - 전체 분석을 광고 보고 열었으면 그 안의 주식, 예/적금 분석은 광고 없이 열린다.
 *   자산이 바뀌면 전체부터 다시 광고, 그 뒤 종류는 다시 광고 없이.
 * - 전체 분석을 안 열었으면 주식 분석에 주소로 바로 들어와도 광고를 묻는다.
 *
 * 광고가 떴는지는 목 SDK 가 받은 `showFullScreenAd` 호출 수로 센다. 문서마다 새로 센다.
 *
 * 숫자는 아래 심은 값에서 손으로 셈한 것이다. 이번 달 넣은 돈은 청년도약계좌 500,000원,
 * 카카오뱅크 300,000원과 100,000원이라 합 900,000원 중 56%, 44%. 지난달에는 200,000원.
 */

function keyOf(assets: AssetsOut, label: string): string {
  const key = assets.items.find((item) => item.label === label)?.item_key;
  if (key == null) throw new Error(`심은 항목이 없다: ${label}`);
  return key;
}

const PORTFOLIO = [
  { group: 'cash', label: '카카오뱅크', amount: 1_000_000 },
  { group: 'cash', label: '청년도약계좌', amount: 600_000 },
  {
    group: 'investment',
    label: '삼성전자',
    amount: 500_000,
    kind: 'stock',
    quantity: '2',
    cost: 500_000,
    price: 300_000,
  },
  {
    group: 'investment',
    label: 'TIGER 나스닥100',
    amount: 200_000,
    kind: 'etf',
    quantity: '1',
    cost: 200_000,
    price: 150_000,
  },
  { group: 'debt', label: '학자금', amount: 500_000 },
] as const;

/** 지난달 15일에 한 번, 오늘 한 번 적고, 지난달 20일과 오늘 넣은 기록을 심는다. */
async function seed(prep: PrepApi): Promise<void> {
  await prep.putAssets([...PORTFOLIO]);
  await prep.moveLatestAssetSnapshot(`${lastMonth()}-15`);
  const assets = await prep.putAssets(
    PORTFOLIO.map((item) =>
      item.label === '카카오뱅크' ? { ...item, amount: 1_200_000 } : { ...item },
    ),
  );
  const kakao = keyOf(assets, '카카오뱅크');
  const saving = keyOf(assets, '청년도약계좌');
  await prep.addAssetTransfer({ amount: 200_000, itemKey: saving, on: `${lastMonth()}-20` });
  await prep.addAssetTransfer({ amount: 300_000, itemKey: kakao });
  await prep.addAssetTransfer({ amount: 500_000, itemKey: saving });
  await prep.addAssetTransfer({ amount: 100_000, itemKey: kakao });
}

test('전체 분석에 리포트 같은 그림이 서고, Top 5 를 고치면 광고 없이 새 숫자로 다시 그려진다', async ({
  assetAnalysis,
  page,
  prep,
}) => {
  test.slow();
  await seed(prep);

  await assetAnalysis.open('all');
  await assetAnalysis.adConsentConfirm.click();
  await assetAnalysis.waitOpen('all');
  expect(await adsShown(page)).toBe(1);

  const charts = assetAnalysis.charts;
  // 순자산 흐름: 첫 기록보다 앞 넉 달은 막대 없이, 지난달과 이번 달 둘. 이번 달만 진하다.
  await expect(charts.netWorthTrend).toContainText('순자산 흐름');
  const netBars = charts.netWorthBars;
  await expect(netBars).toHaveCount(2);
  await expect(netBars.nth(0)).toHaveAttribute('data-month', lastMonth());
  await expect(netBars.nth(1)).toHaveAttribute('data-current', '');
  await expect(charts.netWorthMonths).toHaveCount(6);

  // 지난달 대비: 숫자는 그대로, 늘고 줄고가 막대로.
  await expect(charts.monthChangeRow('예적금·현금')).toHaveAttribute('data-sign', 'up');

  // 어디에 모았나: 큰 것부터, 이름, 금액, 비율.
  const savedItems = charts.savedItemRows;
  await expect(savedItems).toHaveCount(2);
  await expect(savedItems.nth(0)).toContainText('청년도약계좌');
  await expect(savedItems.nth(0)).toContainText(formatCurrency(500_000));
  await expect(savedItems.nth(0)).toContainText('56%');
  await expect(savedItems.nth(1)).toContainText('카카오뱅크');
  await expect(savedItems.nth(1)).toContainText(formatCurrency(400_000));
  await expect(savedItems.nth(1)).toContainText('44%');

  // 달마다 모은 돈: 여섯 달, 지난달 200,000원은 이번 달 900,000원의 22% 높이.
  const savedBars = charts.savedTrendBars;
  await expect(savedBars).toHaveCount(6);
  await expect(savedBars.nth(5)).toHaveAttribute('data-month', thisMonth());
  await expect(savedBars.nth(5)).toHaveAttribute('data-current', '');
  await expect(savedBars.nth(5)).toHaveAttribute('style', /height: 100%/);
  await expect(savedBars.nth(4)).toHaveAttribute('style', /height: 22%/);

  // Top 5: 넣은 기록 셋, 큰 것부터. 누르면 고치기로 들어가니 끝에 › 가 선다.
  const rows = charts.topSaveRows;
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('청년도약계좌');
  await expect(rows.nth(0)).toContainText('›');
  await expect(charts.topSaveAmounts).toHaveText([
    formatCurrency(500_000),
    formatCurrency(300_000),
    formatCurrency(100_000),
  ]);

  await shotBothWidths(page, '분석_전체_도넛과_순자산흐름');
  await shotBothWidths(page, '분석_전체_수익률과_지난달대비', assetAnalysis.returns, 'start');
  await shotBothWidths(page, '분석_전체_어디에모았나와_달마다', assetAnalysis.saving, 'start');
  await shotBothWidths(page, '분석_전체_Top5와_종류별', charts.topSaves, 'start');

  // 1등을 눌러 500,000원을 50,000원으로 고친다.
  await rows.nth(0).click();
  const edit = new EditSheetArea(page);
  await edit.waitOpen();
  await expect(edit.amount).toHaveValue(/500,?000/);
  await shotBothWidths(page, '분석_Top5_고치기시트');
  await edit.amount.fill('50000');
  await edit.done();

  // 카카오뱅크 400,000원, 청년도약계좌 50,000원. 합 450,000원 중 89%, 11%.
  await expect(charts.topSaveAmounts).toHaveText([
    formatCurrency(300_000),
    formatCurrency(100_000),
    formatCurrency(50_000),
  ]);
  await expect(savedItems.nth(0)).toContainText('카카오뱅크');
  await expect(savedItems.nth(0)).toContainText('89%');
  await expect(savedItems.nth(1)).toContainText('11%');
  await expect(assetAnalysis.lockedCard).toHaveCount(0);
  await expect(assetAnalysis.adConsent).toHaveCount(0);
  expect(await adsShown(page)).toBe(1);

  const topLogs = await logsNamed(page, 'asset_analysis_top_opened');
  expect(topLogs.map((log) => log.params.rank)).toEqual([1]);
});

test('전체 분석을 광고 보고 열면 주식, 예/적금 분석은 광고 없이 열리고, 자산이 바뀌면 전체부터 다시 묻는다', async ({
  assets,
  assetAnalysis,
  page,
  prep,
}) => {
  test.slow();
  await seed(prep);

  await assetAnalysis.open('all');
  await assetAnalysis.adConsentConfirm.click();
  await assetAnalysis.waitOpen('all');
  expect(await adsShown(page)).toBe(1);
  await expect(assetAnalysis.kindRow('stock')).toHaveAttribute('data-state', 'open');
  await expect(assetAnalysis.kindRow('cash')).toHaveAttribute('data-state', 'open');

  await assetAnalysis.kindRow('stock').click();
  await assetAnalysis.waitOpen('stock');
  await expect(assetAnalysis.adConsent).toHaveCount(0);

  // 종목별 수익률: 넣은 돈을 아는 두 종목. 삼성전자 2주 × 300,000원 / 500,000원 → +20%,
  // TIGER 나스닥100 150,000원 / 200,000원 → -25%.
  const charts = assetAnalysis.charts;
  await expect(charts.stockRateRow('삼성전자')).toContainText('+20%');
  await expect(charts.stockRateRow('삼성전자')).toHaveAttribute('data-sign', 'up');
  await expect(charts.stockRateRow('TIGER 나스닥100')).toContainText('-25%');
  await expect(charts.stockRateRow('TIGER 나스닥100')).toHaveAttribute('data-sign', 'down');
  await shotBothWidths(page, '분석_주식');
  await shotBothWidths(page, '분석_주식_종목별수익률', assetAnalysis.charts.stockRates, 'start');

  await page.goBack();
  await assetAnalysis.waitOpen('all');
  await assetAnalysis.kindRow('cash').click();
  await assetAnalysis.waitOpen('cash');
  await expect(assetAnalysis.adConsent).toHaveCount(0);
  expect(await adsShown(page)).toBe(1);
  const opened = await logsNamed(page, 'asset_analysis_opened');
  expect(opened.map((log) => [log.params.scope, log.params.ad])).toEqual([
    ['all', expect.stringMatching(/^(earned|watched)$/)],
    ['stock', 'free'],
    ['cash', 'free'],
  ]);

  // 자산을 바꾸면 전체가 다시 묻는다. 그 뒤 종류는 다시 광고 없이.
  await assets.open();
  await assets.waitReady();
  await assets.edit('카카오뱅크', { amount: 1_300_000 });
  await expect(assets.analysisEntry).toHaveAttribute('data-state', 'stale');
  await assets.analysisButton.click();
  await expect(assetAnalysis.adConsent).toBeVisible();
  await assetAnalysis.adConsentConfirm.click();
  await assetAnalysis.waitOpen('all');
  expect(await adsShown(page)).toBe(1);
  await expect(assetAnalysis.kindRow('cash')).toHaveAttribute('data-state', 'open');
  await assetAnalysis.kindRow('cash').click();
  await assetAnalysis.waitOpen('cash');
  await expect(assetAnalysis.adConsent).toHaveCount(0);
  expect(await adsShown(page)).toBe(1);
});

test('넣은 기록이 없으면 어디에 모았나, 달마다 모은 돈, Top 5, 순자산 흐름 카드가 서지 않는다', async ({
  assetAnalysis,
  prep,
}) => {
  await prep.putAssets([{ group: 'cash', label: '카카오뱅크', amount: 1_000_000 }]);

  await assetAnalysis.open('all');
  await assetAnalysis.adConsentConfirm.click();
  await assetAnalysis.waitOpen('all');

  await expect(assetAnalysis.saving).toBeVisible();
  const charts = assetAnalysis.charts;
  await expect(charts.savedItems).toHaveCount(0);
  await expect(charts.savedTrend).toHaveCount(0);
  await expect(charts.topSaves).toHaveCount(0);
  // 기록이 한 달뿐이라 흐름이 없다.
  await expect(charts.netWorthTrend).toHaveCount(0);
});

test('전체 분석을 안 열었으면 주식 분석에 바로 들어와도 광고를 묻고, 그것으로 전체가 열리지는 않는다', async ({
  assetAnalysis,
  page,
  prep,
}) => {
  await seed(prep);

  await assetAnalysis.open('stock');
  await expect(assetAnalysis.adConsent).toBeVisible();
  expect(await adsShown(page)).toBe(0);
  await assetAnalysis.adConsentConfirm.click();
  await assetAnalysis.waitOpen('stock');
  expect(await adsShown(page)).toBe(1);

  await assetAnalysis.open('all');
  await expect(assetAnalysis.adConsent).toBeVisible();
  expect(await adsShown(page)).toBe(0);
});

test('전체 분석을 연 뒤 주식 종목이 바뀌면 전체가 다시 광고를 묻고, 그 뒤 주식 분석은 광고 없이 열린다', async ({
  assets,
  assetAnalysis,
  page,
  prep,
}) => {
  test.slow();
  await seed(prep);

  await assetAnalysis.open('all');
  await assetAnalysis.adConsentConfirm.click();
  await assetAnalysis.waitOpen('all');
  expect(await adsShown(page)).toBe(1);

  // 삼성전자 지금 1주 가격을 300,000원에서 320,000원으로 고친다.
  await assets.open();
  await assets.waitReady();
  await assets.openEdit('삼성전자');
  await assets.sheet.field('지금 1주 가격').fill('320000');
  await assets.sheet.save();
  await expect(assets.analysisEntry).toHaveAttribute('data-state', 'stale');

  await assetAnalysis.open('all');
  await expect(assetAnalysis.adConsent).toBeVisible();
  await assetAnalysis.adConsentConfirm.click();
  await assetAnalysis.waitOpen('all');
  expect(await adsShown(page)).toBe(1);
  await expect(assetAnalysis.kindRow('stock')).toHaveAttribute('data-state', 'open');

  await assetAnalysis.kindRow('stock').click();
  await assetAnalysis.waitOpen('stock');
  await expect(assetAnalysis.adConsent).toHaveCount(0);
  // 2주 × 320,000원 / 500,000원 → +28%
  await expect(assetAnalysis.charts.stockRateRow('삼성전자')).toContainText('+28%');
  expect(await adsShown(page)).toBe(1);
  const opened = await logsNamed(page, 'asset_analysis_opened');
  expect(opened.map((log) => [log.params.scope, log.params.ad])).toEqual([
    ['all', expect.stringMatching(/^(earned|watched)$/)],
    ['stock', 'free'],
  ]);
});
