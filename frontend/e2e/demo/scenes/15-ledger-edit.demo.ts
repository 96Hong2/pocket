import { formatCurrency } from '../../../src/shared/lib/format';
import { expect, test } from '../support/director';

/**
 * 수정 시트를 찍는다. 고치기·예산에서 빼기·지우기 세 장면이다.
 *
 * 예산 제외 장면은 화면을 넘나든다. 달력에서 토글을 켠 뒤 홈으로 가서 남은 예산이
 * 돌아온 것을 숫자로 보여준다. 그게 이 토글의 뜻이라서다.
 */

const BUDGET = 500_000;

test('27 수정 시트에서 상호·금액·카테고리를 고친다', async ({ demo, calendar, prep }) => {
  const meal = await prep.categoryIdByName('식비');
  await prep.addTransaction({ amount: 12_000, categoryId: meal, merchant: '스타벅스' });

  await calendar.open();
  await calendar.waitReady();
  await demo.open('수정 시트', '상호·금액·카테고리를 한 화면에서');

  await demo.step('고칠 줄을 누른다');
  await expect(calendar.totals.expense).toHaveText(formatCurrency(12_000));
  await calendar.list.pick('스타벅스');
  await calendar.edit.waitOpen();
  await demo.beat(2);

  await demo.step('지금 값이 그대로 들어와 있다');
  await expect(calendar.edit.merchant).toHaveValue('스타벅스');
  await expect(calendar.edit.amount).toHaveValue('12000');
  await expect(calendar.edit.pickedCategory).toHaveText(/식비/);
  await demo.beat(3);

  await demo.step('상호를 고친다');
  await calendar.edit.merchant.fill('스타벅스 강남');
  await demo.beat(2);

  await demo.step('금액은 숫자만 받는다');
  await calendar.edit.amount.fill('9000');
  await demo.beat(2);

  await demo.step('카테고리를 바꾼다');
  await calendar.edit.categoryChip('교통').click();
  await expect(calendar.edit.pickedCategory).toHaveText(/교통/);
  await demo.beat(2);

  await demo.step('완료를 누르면 목록과 합계가 함께 바뀐다');
  await calendar.edit.done();
  await expect(calendar.list.row('스타벅스 강남')).toBeVisible();
  await expect(calendar.list.row('교통')).toBeVisible();
  await expect(calendar.totals.expense).toHaveText(formatCurrency(9_000));
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('28 예산 계산에서 제외하면 남은 예산이 돌아온다', async ({ demo, calendar, home, prep }) => {
  await prep.setBudget(BUDGET);
  await prep.addTransaction({ amount: 300_000, merchant: '노트북 거치대' });

  await home.open();
  await home.waitReady();
  await demo.open('예산에서 빼기', '내역에는 남고 예산에서만');

  await demo.step('큰 지출 하나에 남은 예산이 크게 줄었다');
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - 300_000));
  await demo.beat(3);

  await demo.step('달력에서 그 줄을 열어');
  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('노트북 거치대');
  await calendar.edit.waitOpen();
  await demo.beat(2);

  await demo.step('예산 계산에서 제외를 켠다');
  await expect(calendar.edit.excludeToggle).toHaveAttribute('aria-checked', 'false');
  await calendar.edit.excludeToggle.click();
  await expect(calendar.edit.excludeToggle).toHaveAttribute('aria-checked', 'true');
  await demo.beat(2);

  await demo.step('목록에는 남는다. 사라지면 기록이 없어진 줄 안다');
  await calendar.edit.done();
  await expect(calendar.list.row('노트북 거치대')).toBeVisible();
  await expect(calendar.list.chip('예산 제외')).toBeVisible();
  await demo.beat(3);

  await demo.step('그 달 지출에서도 빠지지 않는다. 빠지는 곳은 예산 하나다');
  await expect(calendar.totals.expense).toHaveText(formatCurrency(300_000));
  await demo.beat(3);

  await demo.step('홈으로 오면 남은 예산이 돌아와 있다');
  await home.open();
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET));
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('29 지우면 목록과 합계에서 함께 빠진다', async ({ demo, calendar, prep }) => {
  await prep.addTransaction({ amount: 12_000, minutesAgo: 1, merchant: '스타벅스' });
  await prep.addTransaction({ amount: 3_000, minutesAgo: 2, merchant: '이마트' });

  await calendar.open();
  await calendar.waitReady();
  await demo.open('지우기', '되돌리기와 달리 언제든');

  await demo.step('두 줄에 15,000원');
  await expect(calendar.totals.expense).toHaveText(formatCurrency(15_000));
  await demo.beat(2);

  await demo.step('지울 줄을 열고 삭제를 누른다');
  await calendar.list.pick('스타벅스');
  await calendar.edit.waitOpen();
  await demo.beat(2);
  await calendar.edit.remove();
  await demo.beat(1);

  await demo.step('목록에서 빠지고 합계가 줄어든다');
  await expect(calendar.list.row('스타벅스')).toHaveCount(0);
  await expect(calendar.list.row('이마트')).toBeVisible();
  await expect(calendar.totals.expense).toHaveText(formatCurrency(3_000));
  await expect(calendar.list.dayTotal).toHaveText(formatCurrency(3_000));
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
