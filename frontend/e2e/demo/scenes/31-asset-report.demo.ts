import type { AssetsOut } from '../../../src/shared/api/types';
import { formatCurrency } from '../../../src/shared/lib/format';
import { lastMonth, type PrepApi } from '../../support/api';
import { expect, test } from '../support/director';

/**
 * 내 자산 화면과 「내 자산 리포트」.
 *
 * 자산 화면은 순자산, 그룹별 합계, 종목 수익률을 한 화면에 둔다. 수익률은 넣은 돈을 아는
 * 종목에만 붙는다. 리포트는 확인 창에서 「확인」 을 누른 뒤 짧은 전면 광고(개발용 목)를
 * 지나 열린다.
 *
 * 그래프가 비지 않게 지난달에 한 번 적어 두고(체크인 날짜를 옮긴다) 이번 달에 다시 적는다.
 * 넣은 기록은 지난달 한 줄, 이번 달 세 줄이라 「큰 저축·투자 Top 5」 에 셋이 선다.
 */

const PORTFOLIO = [
  { group: 'cash', label: '카카오뱅크 통장', amount: 2_400_000 },
  { group: 'cash', label: '청년도약계좌', amount: 3_300_000, monthly: 700_000 },
  {
    group: 'investment',
    label: '삼성전자',
    kind: 'stock',
    quantity: '10',
    cost: 720_000,
    price: 78_000,
    amount: 780_000,
  },
  { group: 'investment', label: 'S&P500 펀드', kind: 'fund', cost: 500_000, amount: 585_000 },
  { group: 'pension', label: '연금저축펀드', amount: 2_100_000, monthly: 300_000 },
  { group: 'debt', label: '학자금 대출', amount: 1_800_000 },
] as const;

function keyOf(items: AssetsOut['items'], label: string): string {
  const key = items.find((item) => item.label === label)?.item_key;
  if (key == null) throw new Error(`심은 항목이 없다: ${label}`);
  return key;
}

async function seed(prep: PrepApi): Promise<void> {
  await prep.putAssets([...PORTFOLIO]);
  await prep.moveLatestAssetSnapshot(`${lastMonth()}-15`);
  const now = await prep.putAssets(
    PORTFOLIO.map((item) =>
      item.label === '카카오뱅크 통장' ? { ...item, amount: 2_650_000 } : { ...item },
    ),
  );
  await prep.addAssetTransfer({
    amount: 700_000,
    itemKey: keyOf(now.items, '청년도약계좌'),
    on: `${lastMonth()}-20`,
    memo: '도약 납입',
  });
  await prep.addAssetTransfer({ amount: 700_000, itemKey: keyOf(now.items, '청년도약계좌'), memo: '도약 납입' });
  await prep.addAssetTransfer({ amount: 300_000, itemKey: keyOf(now.items, '연금저축펀드'), memo: '연금 납입' });
  await prep.addAssetTransfer({ amount: 200_000, itemKey: keyOf(now.items, 'S&P500 펀드'), memo: '적립식' });
}

test('66 내 자산 화면에서 내 자산 리포트를 연다', async ({
  appShell,
  assetAnalysis,
  assets,
  demo,
  home,
  manage,
  prep,
}) => {
  test.slow();
  await home.open();
  await home.waitReady();
  // 심는 동안은 제목 카드가 화면을 덮고 있다.
  await Promise.all([
    demo.open('내 자산과 리포트', '가진 것을 한 화면에 모으고, 리포트로 갈라 본다'),
    seed(prep),
  ]);

  await demo.step('관리 탭의 자산관리 카드를 누른다');
  await appShell.goToTab('관리');
  await manage.waitReady();
  await expect(manage.assetsEntry).toBeVisible();
  await demo.beat();
  await manage.openAssets();
  await assets.waitReady();
  await demo.beat();

  await demo.step('맨 위가 순자산이다. 가진 것에서 갚을 것을 뺀 값이다');
  await expect(assets.netWorth).toBeVisible();
  await expect(assets.groupTotal('부채')).toHaveText(formatCurrency(1_800_000));
  await demo.beat(3);

  await demo.step('예적금, 투자, 연금, 부채로 묶여 있다');
  await assets.group('투자').scrollIntoViewIfNeeded();
  await expect(assets.row('삼성전자')).toBeVisible();
  await demo.beat(2);

  await demo.step('넣은 돈을 아는 종목에는 수익률이 붙는다');
  await expect(assets.rowChip('삼성전자', '+8.3%')).toBeVisible();
  await demo.beat(3);

  await demo.step('리포트 보기를 누르면 짧은 광고 뒤에 열린다고 먼저 묻는다');
  await assets.analysisEntry.scrollIntoViewIfNeeded();
  await expect(assets.analysisEntry).toContainText('내 자산 리포트');
  await assets.analysisButton.click();
  await expect(assetAnalysis.adConsent).toContainText('짧은 광고 뒤에 내 자산 리포트가 열려요');
  await demo.beat(3);

  await demo.step('확인을 누르면 짧은 광고가 지나가고 리포트가 열린다');
  await assetAnalysis.adConsentConfirm.click();
  await assetAnalysis.waitOpen('all');
  await expect(assetAnalysis.title).toHaveText('내 자산 리포트');
  await demo.beat();

  await demo.step('도넛이 예적금, 투자, 연금에 얼마씩 있는지 가른다');
  await expect(assetAnalysis.ring).toBeVisible();
  await expect(assetAnalysis.legendRow('예적금·현금')).toBeVisible();
  await expect(assetAnalysis.netWorthLine).toContainText('부채');
  await demo.beat(3);

  await demo.step('종류별로 주식 리포트와 예/적금 리포트가 따로 있다');
  await assetAnalysis.kindRow('stock').scrollIntoViewIfNeeded();
  await expect(assetAnalysis.kindRow('stock')).toBeVisible();
  await expect(assetAnalysis.kindRow('cash')).toBeVisible();
  await demo.beat(3);

  await demo.step('순자산 흐름과 달마다 모은 돈이 그래프로 선다');
  await assetAnalysis.charts.netWorthTrend.scrollIntoViewIfNeeded();
  await expect(assetAnalysis.charts.netWorthBars).toHaveCount(2);
  await demo.beat(2);
  await assetAnalysis.charts.savedTrend.scrollIntoViewIfNeeded();
  await expect(assetAnalysis.charts.savedTrendBars).toHaveCount(6);
  await demo.beat(2);

  await demo.step('이번 달 크게 넣은 것은 큰 저축·투자 Top 5 에 모인다');
  await assetAnalysis.charts.topSaves.scrollIntoViewIfNeeded();
  await expect(assetAnalysis.charts.topSaveAmounts).toHaveText([
    formatCurrency(700_000),
    formatCurrency(300_000),
    formatCurrency(200_000),
  ]);
  await demo.beat(3);

  await demo.step('주식 리포트는 광고 없이 바로 열린다. 종목끼리 견준다');
  await assetAnalysis.kindRow('stock').scrollIntoViewIfNeeded();
  await assetAnalysis.kindRow('stock').click();
  await assetAnalysis.waitOpen('stock');
  await expect(assetAnalysis.adConsent).toHaveCount(0);
  await expect(assetAnalysis.title).toHaveText('주식 리포트');
  await expect(assetAnalysis.legendRow('삼성전자')).toBeVisible();
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
