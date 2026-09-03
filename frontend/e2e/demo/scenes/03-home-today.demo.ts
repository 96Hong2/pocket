import { formatCurrency, formatSignedCurrency } from '../../../src/shared/lib/format';
import { expect, test } from '../support/director';

/**
 * 홈 아래쪽 '오늘' 목록이 기록을 어떻게 보여주는지 찍는다.
 *
 * 아무것도 없는 빈 상태에서 시작해 오늘 하루치를 종류별로 심고, 목록을 위에서 아래로 훑는다.
 * 가맹점이 있는 행, 이체·환불·수입 칩이 붙은 행, 예산에서 뺀 흐린 행이 차례로 나온다.
 * 마지막에 히어로로 돌아와, 이체와 예산 제외가 남은 예산을 건드리지 않은 것을 숫자로 보여준다.
 */

const BUDGET = 500_000;

/** 목록에 심을 하루치. 종류가 하나씩 다르다. */
const COFFEE = 4_500;
const MEAL = 12_000;
const TRANSFER = 300_000;
const REFUND = 8_000;
const INCOME = 2_000_000;
const EXCLUDED = 40_000;

/**
 * 예산에 잡히는 금액.
 *
 * 이체와 수입은 통째로 빠지고, 환불은 지출을 깎고, 예산 제외로 표시한 것은 예산에서만 빠진다.
 * 목록에 보이는 금액을 다 더한 값과 다르다는 것이 이 장면의 마지막 볼거리다.
 */
const BUDGETED_SPEND = COFFEE + MEAL - REFUND;

test('05 오늘 목록이 기록을 보여주는 방식', async ({ demo, home, prep }) => {
  await home.open();
  await home.waitReady();
  await demo.open('오늘 목록', '적어 둔 것이 한 줄씩 어떻게 보이는지');

  await demo.step('아직 아무것도 적지 않은 오늘');
  await home.today.reveal();
  await expect(home.today.empty).toBeVisible();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(0));
  await demo.beat(2);

  await demo.step('오늘 하루치를 종류별로 심는다');
  await prep.setBudget(BUDGET);
  const cafe = await prep.categoryIdByName('카페·간식');
  const meal = await prep.categoryIdByName('식비');
  const shopping = await prep.categoryIdByName('쇼핑');
  const etc = await prep.categoryIdByName('기타');

  // 목록은 시각 내림차순이라 minutesAgo 가 작을수록 위에 놓인다. 훑을 순서를 여기서 정한다.
  // 이체·수입에는 카테고리를 붙이지 않는다. 제목이 카테고리 이름이 되면 같은 행의 칩과 글자가 겹친다.
  await prep.addTransaction({
    amount: COFFEE,
    minutesAgo: 1,
    categoryId: cafe,
    merchant: '스타벅스',
  });
  await prep.addTransaction({ amount: MEAL, minutesAgo: 2, categoryId: meal });
  await prep.addTransaction({
    amount: TRANSFER,
    minutesAgo: 3,
    type: 'transfer',
    merchant: '카카오뱅크',
  });
  await prep.addTransaction({
    amount: REFUND,
    minutesAgo: 4,
    type: 'refund',
    categoryId: shopping,
  });
  await prep.addTransaction({ amount: INCOME, minutesAgo: 5, type: 'income', merchant: '월급' });
  await prep.addTransaction({
    amount: EXCLUDED,
    minutesAgo: 6,
    categoryId: etc,
    excludedFromBudget: true,
  });

  await home.open();
  await home.waitReady();

  await demo.step('적은 것이 한 줄씩 쌓인다');
  await home.today.reveal();
  await expect(home.today.row('식비')).toBeVisible();
  await expect(home.today.amount(formatCurrency(MEAL))).toBeInViewport();
  await demo.beat(2);

  await demo.step('가맹점을 알면 제목이 가맹점, 카테고리는 아래 한 줄로');
  await home.today.revealRow('스타벅스');
  await expect(home.today.row('스타벅스')).toBeInViewport();
  await expect(home.today.subtitle('카페·간식')).toBeInViewport();
  await expect(home.today.amount(formatCurrency(COFFEE))).toBeInViewport();
  await demo.beat(2);

  await demo.step('이체·환불·수입은 제목 아래 칩으로 갈린다');
  await home.today.revealRow('월급');
  await expect(home.today.chip('이체')).toBeInViewport();
  await expect(home.today.chip('환불')).toBeInViewport();
  await expect(home.today.chip('수입')).toBeInViewport();
  await demo.beat(2);

  await demo.step('수입만 초록색에 + 가 붙고, 이체·환불은 회색으로 눌린다');
  await expect(home.today.amount(formatSignedCurrency(INCOME))).toBeInViewport();
  await expect(home.today.amount(formatCurrency(TRANSFER))).toBeVisible();
  await expect(home.today.amount(formatCurrency(REFUND))).toBeVisible();
  await demo.beat(2);

  await demo.step('예산에서 뺀 기록은 흐려지고 예산 제외 칩이 붙는다');
  await home.today.revealRow('기타');
  await expect(home.today.chip('예산 제외')).toBeInViewport();
  await expect(home.today.amount(formatCurrency(EXCLUDED))).toBeInViewport();
  await demo.beat(3);

  await demo.step('그래도 남은 예산은 그만큼 줄지 않는다');
  await home.scrollToTop();
  // 이체는 집계에서 통째로 빠지고, 예산 제외는 예산에서만 빠지고, 환불은 지출을 깎는다.
  // 목록에 찍힌 금액을 그냥 더한 값이 나오면 여기서 깨진다.
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - BUDGETED_SPEND));
  await demo.beat(2);

  await demo.clearStep();
  await demo.beat(2);
});
