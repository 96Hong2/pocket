import { ROUTES } from '../../src/app/router/routes';
import {
  formatCurrency,
  formatMonthLabel,
  formatNumber,
  shiftMonth,
  toLedgerDate,
} from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';
import { shotBothWidths as shot } from '../support/shots';

/**
 * 리포트에서 한 칸 더 들어가기.
 *
 * 분류 줄과 큰 지출 줄을 눌러 그 기록을 고치고, 「저축·투자」 로 자산 화면에 다녀온다.
 * 어디를 다녀와도 **보던 달과 소비·수입 탭으로 돌아오는지**가 이 spec 의 중심이다.
 * 탭은 화면 안 상태라 주소에 안 올리면 다녀오는 순간 소비 탭으로 되돌아간다.
 */

/** 금액 하나를 딱 그 금액으로 찾는다. `10,000원` 이 `910,000원` 안에서 참이 되지 않게. */
function onlyAmount(value: number): RegExp {
  const text = formatCurrency(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\d,])${text}(?![\\d,])`);
}

function lastMonth(): string {
  return shiftMonth(toLedgerDate(new Date()).slice(0, 7), -1);
}

/** 저축·투자 줄 그림이 분류 없는 줄의 그림(「기타」 와 같은 반짝이)으로 떨어지면 이 이름이다. */
const SPARKLES = /\/26_sparkles\.png$/;

test('저축·투자 기록은 홈, 달력 목록, 검색, 고치기 시트에서 「어디에」 그룹 그림으로 그려진다', async ({
  prep,
  home,
  calendar,
  appShell,
}) => {
  // 그룹 그림은 features/assets/assetGroups.ts 의 표다: 예적금·현금 28_cash, 연금 60_plant.
  // 투자(03_growth_chart)는 그룹을 못 찾았을 때 떨어지는 그림과 같아 증거가 안 된다. 그래서 연금을 쓴다.
  const assets = await prep.putAssets([
    { group: 'cash', amount: 1_000_000, label: '청년도약계좌', monthly: 300_000 },
    { group: 'pension', amount: 2_000_000, label: '연금저축' },
  ]);
  const cash = assets.items.find((row) => row.label === '청년도약계좌');
  const pension = assets.items.find((row) => row.label === '연금저축');
  if (cash?.item_key == null || pension?.item_key == null) throw new Error('항목 키가 없다');
  await prep.addAssetTransfer({ amount: 300_000, itemKey: cash.item_key, memo: '도약 납입' });
  await prep.addAssetTransfer({ amount: 200_000, itemKey: pension.item_key, memo: '연금 납입' });

  const CASH_ICON = /\/28_cash\.png$/;
  const PENSION_ICON = /\/60_plant\.png$/;

  await home.open();
  await expect(home.today.rowAvatar('도약 납입').locator('img')).toHaveAttribute('src', CASH_ICON);
  await expect(home.today.rowAvatar('연금 납입').locator('img')).toHaveAttribute(
    'src',
    PENSION_ICON,
  );
  await expect(home.today.rowAvatar('연금 납입').locator('img')).not.toHaveAttribute(
    'src',
    SPARKLES,
  );

  await calendar.open();
  await calendar.waitReady();
  // 저축·투자 줄 제목은 어디에 넣었는지다. 메모는 아랫줄에 선다.
  await expect(calendar.list.rowSubtitle('연금저축')).toHaveText('연금 납입');
  await expect(calendar.list.rowAvatar('도약 납입').locator('img')).toHaveAttribute(
    'src',
    CASH_ICON,
  );
  await expect(calendar.list.rowAvatar('연금 납입').locator('img')).toHaveAttribute(
    'src',
    PENSION_ICON,
  );

  // 고치기 시트 머리.
  await calendar.list.pick('연금 납입');
  await calendar.edit.waitOpen();
  await expect(calendar.edit.headIcon).toHaveAttribute('src', PENSION_ICON);
  await expect(calendar.edit.headIcon).not.toHaveAttribute('src', SPARKLES);
  await appShell.pressBack();
  await calendar.edit.waitClosed();
  await calendar.list.pick('도약 납입');
  await calendar.edit.waitOpen();
  await expect(calendar.edit.headIcon).toHaveAttribute('src', CASH_ICON);
  await appShell.pressBack();
  await calendar.edit.waitClosed();

  // 검색 결과 줄.
  await calendar.search.find('납입');
  await expect(calendar.search.resultCount).toHaveText('검색 결과 2건');
  await expect(calendar.list.rowAvatar('도약 납입').locator('img')).toHaveAttribute(
    'src',
    CASH_ICON,
  );
  await expect(calendar.list.rowAvatar('연금 납입').locator('img')).toHaveAttribute(
    'src',
    PENSION_ICON,
  );
  await expect(calendar.list.rowAvatar('연금 납입').locator('img')).not.toHaveAttribute(
    'src',
    SPARKLES,
  );
});

test('「저축·투자」 로 자산 화면에 갔다가 뒤로 오면 보던 달과 수입 탭 그대로다', async ({
  page,
  prep,
  report,
  appShell,
}) => {
  const month = lastMonth();
  const salary = await prep.categoryIdByName('월급');
  await prep.addTransaction({
    amount: 50_000,
    type: 'income',
    categoryId: salary,
    on: `${month}-03`,
  });

  await report.open({ month });
  await report.waitReady();
  await report.modeTab('수입').click();

  // 토스 위 ‹. 정해진 부모(관리 탭)가 아니라 들어온 리포트로 돌아온다.
  await report.assetsLink.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(ROUTES.assets);
  await appShell.pressBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe(ROUTES.report);
  await expect(report.modeTab('수입')).toBeChecked();
  await expect(report.monthLabel()).toHaveText(formatMonthLabel(month));

  // 브라우저 뒤로도 같다.
  await report.assetsLink.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(ROUTES.assets);
  await page.goBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe(ROUTES.report);
  await expect(report.modeTab('수입')).toBeChecked();
  await expect(report.monthLabel()).toHaveText(formatMonthLabel(month));
});

test('자산 화면에서 내 자산 분석과 종류별 분석에 다녀와도 마지막 뒤로는 보던 리포트다', async ({
  page,
  prep,
  report,
  assets,
  assetAnalysis,
  appShell,
}) => {
  const month = lastMonth();
  await prep.putAssets([{ group: 'cash', amount: 1_000_000, label: '청년도약계좌' }]);
  await prep.addTransaction({
    amount: 50_000,
    type: 'income',
    categoryId: await prep.categoryIdByName('월급'),
    on: `${month}-03`,
  });

  await report.open({ month });
  await report.waitReady();
  await report.modeTab('수입').click();
  await report.assetsLink.click();
  await assets.waitReady();

  await assets.analysisButton.click();
  await assetAnalysis.adConsentConfirm.click();
  await assetAnalysis.waitOpen('all');
  // 전체 분석을 연 뒤라 종류별 분석은 광고 없이 열린다.
  await assetAnalysis.kindRow('cash').click();
  await assetAnalysis.waitOpen('cash');

  // 종류별 분석의 뒤로는 자산 화면이다. 그 자산 화면은 여전히 리포트로 돌아갈 자리를 든다.
  await appShell.pressBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe(ROUTES.assets);
  await assets.waitReady();
  await appShell.pressBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe(ROUTES.report);
  await expect(report.modeTab('수입')).toBeChecked();
  await expect(report.monthLabel()).toHaveText(formatMonthLabel(month));
});

test('분류 줄을 눌러 그 기록을 고치면 분류 화면과 리포트 합계가 바뀌고, 뒤로 오면 수입 탭 그대로다', async ({
  page,
  prep,
  report,
  reportCategory,
  appShell,
}) => {
  const month = lastMonth();
  const salary = await prep.categoryIdByName('월급');
  await prep.addTransaction({
    amount: 2_000_000,
    type: 'income',
    categoryId: salary,
    merchant: '회사',
    on: `${month}-01`,
  });
  await prep.addTransaction({
    amount: 300_000,
    type: 'income',
    categoryId: salary,
    merchant: '보너스',
    on: `${month}-02`,
  });

  await report.open({ month });
  await report.waitReady();
  await report.modeTab('수입').click();
  await report.row('월급').click();

  await expect.poll(() => new URL(page.url()).pathname).toBe(ROUTES.reportCategory);
  await reportCategory.waitReady();
  await appShell.expectTabsHidden();
  await expect(reportCategory.name).toHaveText('월급');
  await expect(reportCategory.total).toHaveText(onlyAmount(2_300_000));
  await expect(reportCategory.count).toHaveText('2건');

  // 시트가 떠 있을 때 토스 ‹ 는 시트만 닫는다. 화면은 분류 화면 그대로다.
  await reportCategory.row('보너스').click();
  await reportCategory.edit.waitOpen();
  await appShell.pressBack();
  await reportCategory.edit.waitClosed();
  expect(new URL(page.url()).pathname).toBe(ROUTES.reportCategory);
  await expect(reportCategory.name).toHaveText('월급');

  await reportCategory.row('보너스').click();
  await reportCategory.edit.waitOpen();
  await expect(reportCategory.edit.merchant).toHaveValue('보너스');
  await reportCategory.edit.amount.fill('500000');
  await reportCategory.edit.doneButton.click();
  await reportCategory.edit.waitClosed();
  await expect(reportCategory.total).toHaveText(onlyAmount(2_500_000));
  await expect(reportCategory.count).toHaveText('2건');
  await expect(reportCategory.row('보너스')).toContainText(onlyAmount(500_000));
  await expect(reportCategory.row('보너스')).not.toContainText(onlyAmount(300_000));

  await appShell.pressBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe(ROUTES.report);
  await expect(report.modeTab('수입')).toBeChecked();
  await expect(report.monthLabel()).toHaveText(formatMonthLabel(month));
  await expect(report.amount('월급')).toHaveText(onlyAmount(2_500_000));
});

test('분류 없음 줄도 열리고, 토스 ‹, Esc, 브라우저 뒤로 모두 보던 달과 수입 탭으로 돌아온다', async ({
  page,
  prep,
  report,
  reportCategory,
  appShell,
}) => {
  const month = lastMonth();
  await prep.addTransaction({
    amount: 4_000,
    type: 'income',
    merchant: '어딘가',
    on: `${month}-05`,
  });
  await prep.addTransaction({
    amount: 9_000,
    type: 'income',
    merchant: '용돈',
    categoryId: await prep.categoryIdByName('월급'),
    on: `${month}-06`,
  });

  async function expectBackOnReport(): Promise<void> {
    await expect.poll(() => new URL(page.url()).pathname).toBe(ROUTES.report);
    await expect(report.modeTab('수입')).toBeChecked();
    await expect(report.monthLabel()).toHaveText(formatMonthLabel(month));
  }

  await report.open({ month });
  await report.waitReady();
  await report.modeTab('수입').click();
  await report.row('분류 없음').click();
  await reportCategory.waitReady();
  await expect(reportCategory.name).toHaveText('분류 없음');
  await expect(reportCategory.total).toHaveText(onlyAmount(4_000));
  await expect(reportCategory.row('어딘가')).toBeVisible();
  await expect(reportCategory.row('용돈')).toHaveCount(0);

  await appShell.pressBack();
  await expectBackOnReport();

  await report.row('분류 없음').click();
  await reportCategory.waitReady();
  await page.keyboard.press('Escape');
  await expectBackOnReport();

  await report.row('분류 없음').click();
  await reportCategory.waitReady();
  await page.goBack();
  await expectBackOnReport();
});

test('큰 지출 줄을 눌러 금액을 고치면 리포트 숫자가 바뀐다', async ({ prep, report }) => {
  const food = await prep.categoryIdByName('식비');
  await prep.addTransaction({ amount: 30_000, merchant: '고기', categoryId: food });
  await prep.addTransaction({ amount: 12_000, merchant: '김밥', categoryId: food });

  await report.open();
  await report.waitReady();
  await expect(report.total).toHaveText(onlyAmount(42_000));

  await report.largeExpenseRow('고기').click();
  await report.edit.waitOpen();
  // 누른 줄의 기록이 열렸나. 다른 줄(김밥)이 열려도 금액을 고치는 데까지는 그대로 간다.
  await expect(report.edit.merchant).toHaveValue('고기');
  await expect(report.edit.amount).toHaveValue(formatNumber(30_000));
  await report.edit.amount.fill('45000');
  await report.edit.doneButton.click();
  await report.edit.waitClosed();

  await expect(report.total).toHaveText(onlyAmount(57_000));
  await expect(report.largeExpenseAmount('고기')).toHaveText(onlyAmount(45_000));
  await expect(report.amount('식비')).toHaveText(onlyAmount(57_000));
});

test('도넛 조각을 누르면 그 조각 줄의 분류 화면이 열린다', async ({
  page,
  prep,
  report,
  reportCategory,
}) => {
  const food = await prep.categoryIdByName('식비');
  const traffic = await prep.categoryIdByName('교통');
  const cafe = await prep.categoryIdByName('카페·간식');
  await prep.addTransaction({ amount: 50_000, merchant: '장보기', categoryId: food });
  await prep.addTransaction({ amount: 20_000, merchant: '택시', categoryId: traffic });
  await prep.addTransaction({ amount: 10_000, merchant: '버스', categoryId: traffic });
  await prep.addTransaction({ amount: 8_000, merchant: '커피', categoryId: cafe });

  await report.open();
  await report.waitReady();
  // 조각은 줄과 같은 차례다. 둘째 조각이 교통 줄이다(가장 큰 조각 하나만 보면 차례가 틀려도 지나간다).
  await expect(report.donutSlices).toHaveCount(3);
  await expect(report.rowNameAt(1)).toHaveText('교통');
  await expect(report.rowAmountAt(1)).toHaveText(onlyAmount(30_000));

  await report.tapDonutSlice(1);
  await expect.poll(() => new URL(page.url()).pathname).toBe(ROUTES.reportCategory);
  await reportCategory.waitReady();
  await expect(reportCategory.name).toHaveText('교통');
  await expect(reportCategory.total).toHaveText(onlyAmount(30_000));
  await expect(reportCategory.count).toHaveText('2건');
  await expect(reportCategory.row('택시')).toBeVisible();
  await expect(reportCategory.row('장보기')).toHaveCount(0);
});

test('접은 줄 「그 밖 N개」 를 누르면 접힌 분류들의 기록이 모여 열린다', async ({
  page,
  prep,
  report,
  reportCategory,
}) => {
  // 기본 지출 분류 아홉에 하나를 더해 열 개. 리포트는 여덟을 세우고 작은 둘을 접는다.
  const top = [
    '식비',
    '카페·간식',
    '교통',
    '쇼핑',
    '생활',
    '주거·고정비',
    '여가·취미',
    '건강·미용',
  ];
  for (const [index, name] of top.entries()) {
    await prep.addTransaction({
      amount: (top.length - index) * 10_000 + 20_000,
      merchant: `큰${index}`,
      categoryId: await prep.categoryIdByName(name),
    });
  }
  const etc = await prep.categoryIdByName('기타');
  const pet = await prep.addCategory('반려동물');
  await prep.addTransaction({ amount: 12_000, merchant: '문구', categoryId: etc });
  await prep.addTransaction({ amount: 8_000, merchant: '우산', categoryId: etc });
  await prep.addTransaction({ amount: 5_000, merchant: '사료', categoryId: pet });

  await report.open();
  await report.waitReady();
  await expect(report.amount('그 밖 2개')).toHaveText(onlyAmount(25_000));

  await report.row('그 밖 2개').click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(ROUTES.reportCategory);
  await reportCategory.waitReady();
  await expect(reportCategory.name).toHaveText('그 밖 2개');
  await expect(reportCategory.total).toHaveText(onlyAmount(25_000));
  await expect(reportCategory.count).toHaveText('3건');
  for (const merchant of ['문구', '우산', '사료']) {
    await expect(reportCategory.row(merchant)).toBeVisible();
  }
  await expect(reportCategory.row('큰7')).toHaveCount(0);
});

test('리포트 탭을 다시 눌러도 보던 달과 수입 탭 그대로고, 다른 탭에서 오면 이번 달 소비로 연다', async ({
  prep,
  report,
  appShell,
}) => {
  const month = lastMonth();
  await prep.addTransaction({
    amount: 50_000,
    type: 'income',
    categoryId: await prep.categoryIdByName('월급'),
    on: `${month}-03`,
  });

  await report.open({ month });
  await report.waitReady();
  await report.modeTab('수입').click();

  await appShell.goToTab('리포트');
  await expect(report.modeTab('수입')).toBeChecked();
  await expect(report.monthLabel()).toHaveText(formatMonthLabel(month));
  expect(report.url.searchParams.get('month')).toBe(month);
  expect(report.url.searchParams.get('tab')).toBe('income');

  await appShell.goToTab('홈');
  await appShell.goToTab('리포트');
  await report.waitReady();
  await expect(report.modeTab('소비')).toBeChecked();
  await expect(report.monthLabel()).toHaveText(
    formatMonthLabel(toLedgerDate(new Date()).slice(0, 7)),
  );
});

test('분류 화면에 다녀오거나 고치기 시트를 닫아도 리포트는 보던 자리 그대로다', async ({
  page,
  prep,
  report,
  reportCategory,
  appShell,
}) => {
  const month = lastMonth();
  const spends: [string, number][] = [
    ['식비', 90_000],
    ['카페·간식', 70_000],
    ['편의점', 50_000],
    ['교통', 40_000],
    ['쇼핑', 30_000],
  ];
  for (const [index, [name, amount]] of spends.entries()) {
    await prep.addTransaction({
      amount,
      categoryId: await prep.categoryIdByName(name),
      merchant: `${name} 가게`,
      on: `${month}-${String(index + 1).padStart(2, '0')}`,
    });
  }
  const scrollY = () => page.evaluate(() => Math.round(window.scrollY));

  await report.open({ month });
  await report.waitReady();
  await shot(page, '고친_리포트_분류가기전', report.row('쇼핑'));
  await report.row('쇼핑').evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const before = await scrollY();
  expect(before).toBeGreaterThan(0);

  // 토스 ‹ 로 돌아온다.
  await report.row('쇼핑').click();
  await reportCategory.waitReady();
  await appShell.pressBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe(ROUTES.report);
  await expect.poll(scrollY).toBeGreaterThan(0);
  expect(Math.abs((await scrollY()) - before)).toBeLessThan(40);
  await shot(page, '고친_리포트_분류다녀온뒤');

  // 브라우저 뒤로도 같다.
  await report.row('쇼핑').evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const again = await scrollY();
  await report.row('쇼핑').click();
  await reportCategory.waitReady();
  await page.goBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe(ROUTES.report);
  await expect.poll(scrollY).toBeGreaterThan(0);
  expect(Math.abs((await scrollY()) - again)).toBeLessThan(40);

  // 큰 지출 줄의 고치기 시트를 닫아도 자리가 그대로다.
  await report
    .largeExpenseRow('교통 가게')
    .evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const atLarge = await scrollY();
  expect(atLarge).toBeGreaterThan(0);
  await report.largeExpenseRow('교통 가게').click();
  await report.edit.waitOpen();
  await appShell.pressBack();
  await report.edit.waitClosed();
  expect(Math.abs((await scrollY()) - atLarge)).toBeLessThan(40);

  // 고쳐서 닫아 리포트를 다시 읽어도 같다.
  await report.largeExpenseRow('교통 가게').click();
  await report.edit.waitOpen();
  await report.edit.amount.fill('45000');
  await report.edit.doneButton.click();
  await report.edit.waitClosed();
  await expect(report.largeExpenseAmount('교통 가게')).toHaveText(onlyAmount(45_000));
  expect(Math.abs((await scrollY()) - atLarge)).toBeLessThan(40);
});
