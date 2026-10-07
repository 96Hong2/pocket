import {
  formatCurrency,
  formatSignedCurrency,
  toLedgerDate,
} from '../../../src/shared/lib/format';
import type { PrepApi } from '../../support/api';
import { expect, test } from '../support/director';

/**
 * 리포트에서 한 칸 더 들어가기.
 *
 * 분류 줄을 누르면 그 분류 화면, 큰 지출 Top 5 줄을 누르면 그 기록 고치기, 「저축·투자 ›」 를
 * 누르면 자산 화면이다. 어디를 다녀와도 보던 탭으로 돌아온다.
 *
 * 날짜는 이번 달 안에 머물게 오늘보다 앞으로 넘기지 않는다. 달 초에 돌려도 지난달로 새지 않는다.
 */

function daysInto(days: number): number {
  const today = Number(toLedgerDate(new Date()).slice(8, 10));
  return Math.min(days, today - 1);
}

async function seed(prep: PrepApi): Promise<void> {
  const id = async (name: string) => prep.categoryIdByName(name);
  const rows = [
    { amount: 180_000, merchant: '아파트 관리비', category: '주거·고정비', days: 5 },
    { amount: 89_000, merchant: '무신사', category: '쇼핑', days: 3 },
    { amount: 46_000, merchant: '이마트', category: '식비', days: 2 },
    { amount: 32_900, merchant: '쿠팡', category: '쇼핑', days: 1 },
    { amount: 23_000, merchant: '배달의민족', category: '식비', days: 4 },
    { amount: 12_400, merchant: '카카오T', category: '교통', days: 1 },
    { amount: 8_000, merchant: '김밥천국', category: '식비', days: 0 },
    { amount: 4_500, merchant: '스타벅스', category: '카페·간식', days: 0 },
    { amount: 4_500, merchant: '스타벅스', category: '카페·간식', days: 2 },
  ] as const;
  for (const row of rows) {
    await prep.addTransaction({
      amount: row.amount,
      merchant: row.merchant,
      categoryId: await id(row.category),
      daysAgo: daysInto(row.days),
    });
  }
  await prep.addTransaction({
    amount: 3_200_000,
    type: 'income',
    merchant: '월급',
    categoryId: await id('월급'),
    daysAgo: daysInto(6),
  });
  const assets = await prep.putAssets([
    { group: 'cash', label: '청년도약계좌', amount: 2_600_000, monthly: 700_000 },
    {
      group: 'investment',
      label: '삼성전자',
      kind: 'stock',
      quantity: '10',
      cost: 720_000,
      price: 78_000,
      amount: 780_000,
    },
  ]);
  // 자산 화면의 「이번 달 모은 돈」 이 0원으로 서지 않게 이번 달 납입 한 줄을 심는다. 납입 뒤 3,300,000원이다.
  const account = assets.items.find((item) => item.label === '청년도약계좌')?.item_key;
  if (account == null) throw new Error('청년도약계좌를 심지 못했다');
  await prep.addAssetTransfer({
    amount: 700_000,
    itemKey: account,
    daysAgo: daysInto(6),
    memo: '도약 납입',
  });
}

/** 위에 심은 지출 합. 무신사를 79,000원으로 고치면 10,000원 준다. */
const SPENT = 180_000 + 89_000 + 46_000 + 32_900 + 23_000 + 12_400 + 8_000 + 4_500 * 2;

test('67 리포트 줄을 눌러 분류 화면, 기록 고치기, 자산 화면으로 들어간다', async ({
  appShell,
  assets,
  demo,
  prep,
  report,
  reportCategory,
}) => {
  // 먼저 심고 연다. 연 뒤에 심으면 제목 카드가 걷힌 직후 기록 없는 리포트가 한 번 찍힌다.
  await seed(prep);
  await report.open();
  await report.waitReady();
  await demo.open('리포트에서 한 칸 더', '분류 줄, 큰 지출, 저축·투자를 눌러 들어간다');
  await expect(report.total).toHaveText(formatCurrency(SPENT));

  await demo.step('맨 위에서 소비와 수입을 고르고, 오른쪽에 저축·투자가 따로 있다');
  await expect(report.modeTab('소비')).toBeChecked();
  await expect(report.assetsLink).toBeVisible();
  await demo.beat(3);

  await demo.step('분류 줄 식비를 누르면 식비에 적은 것만 모아 본다');
  await report.row('식비').scrollIntoViewIfNeeded();
  await demo.beat();
  await report.row('식비').click();
  await reportCategory.waitReady();
  await expect(reportCategory.name).toHaveText('식비');
  await expect(reportCategory.total).toHaveText(formatCurrency(77_000));
  await expect(reportCategory.count).toHaveText('3건');
  await demo.beat(3);

  await demo.step('뒤로 오면 보던 리포트 그대로다');
  await appShell.pressBack();
  await report.waitReady();
  await demo.beat();

  await demo.step('아래 큰 지출 Top 5 에서 무신사 줄을 누른다');
  // 화면 아래 끝에 걸치면 탭바에 가린다. 가운데로 올려 다섯 줄이 다 보이게 한다.
  await report.largeExpenseCard.evaluate((element) => {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await expect(report.largeExpenseRows).toHaveCount(5);
  await expect(report.largeExpenseRow('무신사')).toBeInViewport({ ratio: 1 });
  await demo.beat(2);
  await report.largeExpenseRow('무신사').click();
  await report.edit.waitOpen();
  await expect(report.edit.merchant).toHaveValue('무신사');
  await demo.beat(2);

  await demo.step('금액을 79,000원으로 고치면 리포트 숫자가 그 자리에서 바뀐다');
  await report.edit.amount.fill('79000');
  await demo.beat();
  await report.edit.done();
  await expect(report.largeExpenseAmount('무신사')).toHaveText(formatCurrency(79_000));
  await demo.beat(3);

  await demo.step('수입으로 바꾸면 번 돈이 같은 모양으로 선다');
  await report.modeTab('수입').scrollIntoViewIfNeeded();
  await report.modeTab('수입').click();
  await expect(report.total).toHaveText(formatSignedCurrency(3_200_000));
  await demo.beat(3);

  await demo.step('저축·투자를 누르면 자산 화면이다');
  await report.assetsLink.click();
  await assets.waitReady();
  await expect(assets.row('청년도약계좌')).toBeVisible();
  await demo.beat(3);

  await demo.step('뒤로 오면 보던 수입 탭이다. 소비 합계에는 고친 금액이 들어가 있다');
  await appShell.pressBack();
  await report.waitReady();
  await expect(report.modeTab('수입')).toBeChecked();
  await demo.beat(2);
  await report.modeTab('소비').click();
  await expect(report.total).toHaveText(formatCurrency(SPENT - 10_000));
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
