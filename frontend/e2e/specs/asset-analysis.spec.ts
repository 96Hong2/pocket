import type { AssetsOut } from '../../src/shared/api/types';
import { formatCurrency } from '../../src/shared/lib/format';
import { logsNamed } from '../support/aitMock';
import { lastMonth, thisMonth, type PrepApi } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 「내 자산 분석」.
 *
 * 입구 카드에는 광고 이야기가 없고, 누르면 확인 창이 묻는다. 「확인」 뒤에만 리워드 광고가 서고
 * 어떻게 끝나든 분석이 열린다. 한 번 본 분석은 숫자가 그대로인 동안 광고 없이 열리고,
 * 숫자가 바뀌면 다시 묻는다. 날짜만 지나는 것(체크인 복사)은 바뀜이 아니다.
 *
 * 숫자는 아래 심은 값에서 손으로 셈한 것이다. 자산 3,000,000원 중 예적금·현금 1,600,000원(53.3%),
 * 투자 1,000,000원(33.3%), 연금 400,000원(13.3%). 연금을 빼면 2,600,000원 중 61.5%, 38.5%.
 */

async function seedPortfolio(prep: PrepApi): Promise<AssetsOut> {
  return prep.putAssets([
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
    { group: 'investment', label: 'S&P500 펀드', amount: 400_000, kind: 'fund', cost: 400_000 },
    { group: 'pension', label: '연금저축펀드', amount: 400_000 },
    { group: 'debt', label: '학자금', amount: 500_000 },
  ]);
}

test('입구에는 광고 말이 없고, 닫기면 아무 일도 없고, 확인 뒤 광고를 지나 분석이 열린다', async ({
  assets,
  assetAnalysis,
  page,
  prep,
}) => {
  await seedPortfolio(prep);

  await assets.open();
  await assets.waitReady();
  await expect(assets.analysisEntry).toHaveAttribute('data-state', 'locked');
  await expect(assets.analysisEntry).toContainText(
    '어디에 얼마가 있는지, 수익률, 지난달과 달라진 것',
  );
  await expect(assets.analysisEntry).not.toContainText('광고');

  await assets.analysisButton.click();
  await expect(assetAnalysis.adConsent).toContainText('30초 광고를 보면 분석 결과를 볼 수 있어요');
  await assetAnalysis.adConsentCancel.click();
  await expect(assetAnalysis.adConsent).toHaveCount(0);
  await expect(assets.analysisEntry).toHaveAttribute('data-state', 'locked');
  expect(await logsNamed(page, 'asset_analysis_opened')).toEqual([]);

  await assets.analysisButton.click();
  await assetAnalysis.adConsentConfirm.click();
  await assetAnalysis.waitOpen('all');

  const asked = await logsNamed(page, 'asset_analysis_asked');
  expect(asked.map((log) => log.params.answer)).toEqual(['close', 'ok']);
  const opened = await logsNamed(page, 'asset_analysis_opened');
  expect(opened).toHaveLength(1);
  expect(opened[0]?.params).toMatchObject({ scope: 'all' });
  expect(['earned', 'watched']).toContain(opened[0]?.params.ad);

  // 도넛: 그룹별 비율과 금액. 부채와 순자산은 도넛 아래 한 줄.
  await expect(assetAnalysis.ring).toBeVisible();
  await expect(assetAnalysis.legendRow('예적금·현금')).toContainText('53.3%');
  await expect(assetAnalysis.legendRow('예적금·현금')).toContainText(formatCurrency(1_600_000));
  await expect(assetAnalysis.legendRow('투자')).toContainText('33.3%');
  await expect(assetAnalysis.legendRow('연금')).toContainText('13.3%');
  await expect(assetAnalysis.netWorthLine).toContainText('부채');
  await expect(assetAnalysis.netWorthLine).toContainText(formatCurrency(500_000));
  await expect(assetAnalysis.netWorthLine).toContainText(formatCurrency(2_500_000));

  await assetAnalysis.noPensionToggle.click();
  await expect(assetAnalysis.noPensionToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(assetAnalysis.legendRow('연금')).toHaveCount(0);
  await expect(assetAnalysis.legendRow('예적금·현금')).toContainText('61.5%');
  await expect(assetAnalysis.legendRow('투자')).toContainText('38.5%');

  // 현재가를 적은 삼성전자만 센다. 2주 × 300,000원, 넣은 돈 500,000원 → +20%
  await expect(assetAnalysis.returns).toContainText('삼성전자');
  await expect(assetAnalysis.returns).toContainText('+20%');
});

test('현재가도 판 기록도 없으면 수익률 카드가 빈 말을 하고, 종류별은 항목이 있는 것만 선다', async ({
  assetAnalysis,
  prep,
}) => {
  await prep.putAssets([{ group: 'cash', label: '카카오뱅크', amount: 1_000_000 }]);

  await assetAnalysis.open('all');
  await assetAnalysis.adConsentConfirm.click();
  await assetAnalysis.waitOpen('all');

  await expect(assetAnalysis.returns).toHaveAttribute('data-empty', '');
  await expect(assetAnalysis.returns).toContainText(
    '현재가나 판 기록을 적은 종목이 있으면 여기 보여요',
  );
  await expect(assetAnalysis.kindRow('cash')).toBeVisible();
  await expect(assetAnalysis.kindRow('stock')).toHaveCount(0);
});

test('전체 분석을 연 뒤 주식 분석과 예/적금 분석은 확인 창 없이 그 묶음 숫자로 열린다', async ({
  assets,
  assetAnalysis,
  page,
  prep,
}) => {
  test.slow();
  await seedPortfolio(prep);
  // 매달 넣는 돈은 항목 시트에서 토글을 켜고 금액을 적는 길로만 넣는다.
  await assets.open();
  await assets.waitReady();
  await assets.setMonthly('카카오뱅크', 300_000);
  await assets.setMonthly('청년도약계좌', 700_000);
  await expect(assets.rowChip('카카오뱅크', /^매달$/)).toBeVisible();

  await assetAnalysis.open('all');
  await assetAnalysis.adConsentConfirm.click();
  await assetAnalysis.waitOpen('all');
  await expect(assetAnalysis.kindRows).toHaveCount(2);
  // 전체 분석이 열린 동안 그 안의 종류별 분석도 연 것으로 적힌다.
  await expect(assetAnalysis.kindRow('stock')).toHaveAttribute('data-state', 'open');

  await assetAnalysis.kindRow('stock').click();
  await assetAnalysis.waitOpen('stock');
  await expect(assetAnalysis.adConsent).toHaveCount(0);
  await expect(assetAnalysis.title).toHaveText('주식 분석');
  // 주식, ETF, 펀드, 채권만. 삼성전자 600,000원과 펀드 400,000원 → 60%, 40%
  await expect(assetAnalysis.legendRow('삼성전자')).toContainText('60%');
  await expect(assetAnalysis.legendRow('S&P500 펀드')).toContainText('40%');
  await expect(assetAnalysis.legendRow('연금저축펀드')).toHaveCount(0);
  await expect(assetAnalysis.returns).toContainText('삼성전자');
  // 로그는 문서마다 새로 쌓인다. 주소로 옮기기 전에 읽는다.
  const before = await logsNamed(page, 'asset_analysis_opened');
  expect(before.map((log) => [log.params.scope, log.params.ad])).toEqual([
    ['all', expect.stringMatching(/^(earned|watched)$/)],
    ['stock', 'free'],
  ]);

  // 주소로 바로 들어와도 적어 둔 지문이 같으면 확인 창 없이 열린다.
  await assetAnalysis.open('cash');
  await assetAnalysis.waitOpen('cash');
  await expect(assetAnalysis.adConsent).toHaveCount(0);
  await expect(assetAnalysis.title).toHaveText('예/적금 분석');
  // 1,000,000원과 600,000원 → 62.5%, 37.5%
  await expect(assetAnalysis.legendRow('카카오뱅크')).toContainText('62.5%');
  await expect(assetAnalysis.legendRow('청년도약계좌')).toContainText('37.5%');
  // 300,000원 + 700,000원 = 1,000,000원
  await expect(assetAnalysis.monthlyTotal).toHaveText(formatCurrency(1_000_000));
  await expect(assetAnalysis.monthly).toContainText(`매달 ${formatCurrency(300_000)}`);
  await expect(assetAnalysis.monthly).toContainText(`매달 ${formatCurrency(700_000)}`);
  await expect(assetAnalysis.monthly).not.toContainText('한 번 넣은 돈');
});

test('본 분석은 숫자가 그대로면 줄 하나로 광고 없이 열리고, 금액을 고치면 다시 묻는다', async ({
  assets,
  assetAnalysis,
  page,
  prep,
}) => {
  // 화면을 여러 번 오간다. 부하가 높은 맥에서는 기본 30초가 모자라다.
  test.slow();
  await seedPortfolio(prep);

  await assetAnalysis.open('all');
  await assetAnalysis.adConsentConfirm.click();
  await assetAnalysis.waitOpen('all');
  await assetAnalysis.kindRow('stock').click();
  await assetAnalysis.waitOpen('stock');
  await assetAnalysis.open('cash');
  await assetAnalysis.waitOpen('cash');

  await assets.open();
  await assets.waitReady();
  await expect(assets.analysisEntry).toHaveAttribute('data-state', 'open');
  await expect(assets.analysisEntry).toHaveText(/^내 자산 분석/);
  await assets.analysisEntry.click();
  await assetAnalysis.waitOpen('all');
  await expect(assetAnalysis.adConsent).toHaveCount(0);
  const free = await logsNamed(page, 'asset_analysis_opened');
  expect(free.at(-1)?.params).toMatchObject({ scope: 'all', ad: 'free' });

  // 예/적금 항목 금액 하나만 고친다.
  await assets.open();
  await assets.waitReady();
  await assets.edit('카카오뱅크', { amount: 1_100_000 });
  await expect(assets.analysisEntry).toHaveAttribute('data-state', 'stale');
  await expect(assets.analysisEntry).toContainText('자산이 바뀌어서 분석을 다시 해요');

  await assets.analysisButton.click();
  await expect(assetAnalysis.adConsent).toBeVisible();
  await assetAnalysis.adConsentConfirm.click();
  await assetAnalysis.waitOpen('all');
  // 전체를 다시 본 뒤에는 숫자가 바뀐 예/적금 분석도 광고 없이 열린다.
  await expect(assetAnalysis.kindRow('stock')).toHaveAttribute('data-state', 'open');
  await expect(assetAnalysis.kindRow('cash')).toHaveAttribute('data-state', 'open');
});

test('체크인으로 목록만 오늘로 옮기면 바뀜이 아니라서 광고 없이 열린다', async ({
  assets,
  assetAnalysis,
  prep,
}) => {
  await seedPortfolio(prep);
  await prep.moveLatestAssetSnapshot(`${lastMonth()}-15`);

  await assetAnalysis.open('all');
  await assetAnalysis.adConsentConfirm.click();
  await assetAnalysis.waitOpen('all');

  const copied = await prep.checkinAssets(thisMonth());
  expect(copied.snapshot?.effective_on.startsWith(thisMonth())).toBe(true);

  await assets.open();
  await assets.waitReady();
  await expect(assets.analysisEntry).toHaveAttribute('data-state', 'open');

  await assetAnalysis.open('all');
  await assetAnalysis.waitOpen('all');
  await expect(assetAnalysis.adConsent).toHaveCount(0);
});
