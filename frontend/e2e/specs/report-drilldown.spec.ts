import { ROUTES } from '../../src/app/router/routes';
import {
  formatCurrency,
  formatMonthLabel,
  shiftMonth,
  toLedgerDate,
} from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

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
  return new RegExp(`(?<![\\d,])${text}`);
}

function lastMonth(): string {
  return shiftMonth(toLedgerDate(new Date()).slice(0, 7), -1);
}

test('저축·투자 기록은 홈과 달력 목록에서 「어디에」 그룹 그림으로 그려진다', async ({
  prep,
  home,
  calendar,
}) => {
  const assets = await prep.putAssets([
    { group: 'cash', amount: 1_000_000, label: '청년도약계좌', monthly: 300_000 },
  ]);
  const item = assets.items.find((row) => row.label === '청년도약계좌');
  if (item?.item_key == null) throw new Error('청년도약계좌 항목 키가 없다');
  await prep.addAssetTransfer({ amount: 300_000, itemKey: item.item_key });

  await home.open();
  // 예적금·현금 그림이다. 예전에는 분류가 없어 「기타」 와 같은 반짝이 그림으로 떨어졌다.
  await expect(home.today.rowAvatar('저축·투자').locator('img')).toHaveAttribute(
    'src',
    /\/28_cash\.png$/,
  );

  await calendar.open();
  await calendar.waitReady();
  await expect(calendar.list.rowAvatar('저축·투자').locator('img')).toHaveAttribute(
    'src',
    /\/28_cash\.png$/,
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

  await reportCategory.row('보너스').click();
  await reportCategory.edit.waitOpen();
  await reportCategory.edit.amount.fill('500000');
  await reportCategory.edit.doneButton.click();
  await reportCategory.edit.waitClosed();
  await expect(reportCategory.total).toHaveText(onlyAmount(2_500_000));
  await expect(reportCategory.count).toHaveText('2건');

  await appShell.pressBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe(ROUTES.report);
  await expect(report.modeTab('수입')).toBeChecked();
  await expect(report.monthLabel()).toHaveText(formatMonthLabel(month));
  await expect(report.amount('월급')).toHaveText(onlyAmount(2_500_000));
});

test('분류 없음 줄도 열리고, Esc 와 브라우저 뒤로 리포트로 돌아온다', async ({
  page,
  prep,
  report,
  reportCategory,
}) => {
  await prep.addTransaction({ amount: 4_000, merchant: '어딘가' });
  await prep.addTransaction({
    amount: 9_000,
    merchant: '분식',
    categoryId: await prep.categoryIdByName('식비'),
  });

  await report.open();
  await report.waitReady();
  await report.row('분류 없음').click();
  await reportCategory.waitReady();
  await expect(reportCategory.name).toHaveText('분류 없음');
  await expect(reportCategory.total).toHaveText(onlyAmount(4_000));
  await expect(reportCategory.row('어딘가')).toBeVisible();
  await expect(reportCategory.row('분식')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect.poll(() => new URL(page.url()).pathname).toBe(ROUTES.report);
  await expect(report.modeTab('소비')).toBeChecked();

  await report.row('분류 없음').click();
  await reportCategory.waitReady();
  await page.goBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe(ROUTES.report);
  await report.waitReady();
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
  await report.edit.amount.fill('45000');
  await report.edit.doneButton.click();
  await report.edit.waitClosed();

  await expect(report.total).toHaveText(onlyAmount(57_000));
  await expect(report.largeExpenseAmount('고기')).toHaveText(onlyAmount(45_000));
  await expect(report.amount('식비')).toHaveText(onlyAmount(57_000));
});
