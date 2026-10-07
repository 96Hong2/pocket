import type { AssetsOut } from '../../../src/shared/api/types';
import { formatCurrency } from '../../../src/shared/lib/format';
import { lastMonth, thisMonth, type PrepApi } from '../../support/api';
import { expect, test } from '../support/director';

/**
 * 자산 화면과 「내 자산 리포트」.
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
  { group: 'deposit', label: '월세 보증금', amount: 10_000_000 },
  { group: 'debt', label: '학자금 대출', amount: 1_800_000 },
] as const;

function keyOf(items: AssetsOut['items'], label: string): string {
  const key = items.find((item) => item.label === label)?.item_key;
  if (key == null) throw new Error(`심은 항목이 없다: ${label}`);
  return key;
}

async function seed(prep: PrepApi): Promise<void> {
  // 처음 뜨는 홈이 0원으로 서지 않게 이번 달 월급과 지출 두 건을 심는다.
  await prep.addTransaction({
    amount: 3_200_000,
    type: 'income',
    merchant: '월급',
    categoryId: await prep.categoryIdByName('월급'),
    on: `${thisMonth()}-01`,
  });
  await prep.addTransaction({ amount: 8_000, merchant: '김밥천국', categoryId: await prep.categoryIdByName('식비') });
  await prep.addTransaction({ amount: 4_500, merchant: '스타벅스', categoryId: await prep.categoryIdByName('카페·간식') });
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

test('66 자산 화면에서 내 자산 리포트를 연다', async ({
  appShell,
  assetAnalysis,
  assets,
  demo,
  home,
  manage,
  page,
  prep,
}) => {
  test.slow();
  // 먼저 심고 연다. 홈이 자산을 한 번 읽어 두면 그 값이 1분 동안 남아, 연 뒤에 심은 것은 자산 화면에 안 보인다.
  await seed(prep);
  await home.open();
  await home.waitReady();
  await demo.open('내 자산과 리포트', '가진 것을 한 화면에 모으고, 리포트로 갈라 본다');

  await demo.step('관리 탭의 자산관리 카드를 누른다');
  await appShell.goToTab('관리');
  await manage.waitReady();
  await expect(manage.assetsEntry).toBeVisible();
  await demo.beat();
  await manage.openAssets();
  await assets.waitReady();

  await demo.step('맨 위가 순자산이다. 가진 것에서 갚을 것을 뺀 값이다');
  await expect(assets.netWorth).toBeVisible();
  await expect(assets.groupTotal('부채')).toHaveText(formatCurrency(1_800_000));
  await demo.beat(2);

  await demo.step('예적금·현금, 투자, 연금, 보증금·기타, 부채 다섯 그룹으로 묶여 있다');
  await assets.group('투자').scrollIntoViewIfNeeded();
  await expect(assets.row('삼성전자')).toBeVisible();
  await demo.beat();
  // 아래 그룹까지 내려가 다섯을 다 보여 준다.
  await assets.row('학자금 대출').scrollIntoViewIfNeeded();
  await expect(assets.row('학자금 대출')).toBeInViewport();
  await demo.beat(2);

  await demo.step('넣은 돈을 아는 종목에는 수익률이 붙는다');
  await assets.row('삼성전자').evaluate((element) => {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await expect(assets.rowChip('삼성전자', '+8.3%')).toBeInViewport();
  await demo.beat(2);

  await demo.step('리포트 보기를 누르면 짧은 광고 뒤에 열린다고 먼저 묻는다');
  await assets.analysisEntry.scrollIntoViewIfNeeded();
  await expect(assets.analysisEntry).toContainText('내 자산 리포트');
  await assets.analysisButton.click();
  await expect(assetAnalysis.adConsent).toContainText('짧은 광고 뒤에 내 자산 리포트가 열려요');
  await demo.beat(3);

  // 녹화 스택의 광고는 화면에 안 그려진다. 영상에 없는 것을 지나간다고 말하지 않는다.
  await demo.step('확인을 누르면 리포트가 열린다. 실제 앱에서는 이 사이에 짧은 광고가 한 번 나온다');
  await assetAnalysis.adConsentConfirm.click();
  await assetAnalysis.waitOpen('all');
  await expect(assetAnalysis.title).toHaveText('내 자산 리포트');
  await demo.beat();

  await demo.step('도넛이 가진 것을 그룹별로 가른다. 그 아래가 순자산 흐름이다');
  await expect(assetAnalysis.ring).toBeVisible();
  await expect(assetAnalysis.legendRow('예적금·현금')).toBeVisible();
  await expect(assetAnalysis.netWorthLine).toContainText('부채');
  await expect(assetAnalysis.charts.netWorthBars).toHaveCount(2);
  await demo.beat(3);

  await demo.step('내려가면 달마다 모은 돈과 이번 달 큰 저축·투자 Top 5 가 선다');
  await assetAnalysis.charts.topSaves.evaluate((element) => {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await expect(assetAnalysis.charts.savedTrendBars).toHaveCount(6);
  await expect(assetAnalysis.charts.topSaveAmounts).toHaveText([
    formatCurrency(700_000),
    formatCurrency(300_000),
    formatCurrency(200_000),
  ]);
  await demo.beat(3);

  await demo.step('맨 아래에 주식 리포트와 예/적금 리포트가 따로 있다');
  await assetAnalysis.kindRow('cash').scrollIntoViewIfNeeded();
  await expect(assetAnalysis.kindRow('stock')).toBeInViewport();
  await expect(assetAnalysis.kindRow('cash')).toBeInViewport();
  await demo.beat(2);

  await demo.step('주식 리포트는 광고 없이 바로 열린다. 종목끼리 견준다');
  await assetAnalysis.kindRow('stock').click();
  await assetAnalysis.waitOpen('stock');
  await expect(assetAnalysis.adConsent).toHaveCount(0);
  await expect(assetAnalysis.title).toHaveText('주식 리포트');
  // 앞 화면에서 내려 둔 만큼 제목이 자막 밑에 깔린다. 맨 위로 올린다.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await expect(assetAnalysis.legendRow('삼성전자')).toBeVisible();
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
