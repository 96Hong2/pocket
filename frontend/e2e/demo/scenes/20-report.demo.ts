import {
  formatCurrency,
  formatMonthLabel,
  formatSignedCurrency,
} from '../../../src/shared/lib/format';
import { shiftMonth } from '../../../src/shared/lib/format';
import { lastMonth, thisMonth } from '../../support/api';
import { expect, test } from '../support/director';

/**
 * 리포트 탭 세 장면. 한 달을 나눠 보는 것, 보는 창을 바꾸는 것, 그리고 지난달 결산이다.
 *
 * 두 장면 다 홈에서 시작해 탭으로 옮긴다. 홈은 한 달을 총액 하나로 말하고
 * 리포트는 그 총액을 갈라 보여주니, 같은 숫자에서 출발해야 무엇이 더해졌는지 보인다.
 *
 * 도넛은 조각 수만 세면 색이 하나도 안 칠해져도 통과한다. 실제로 그런 적이 있어서
 * 여기서는 화면에 실제로 칠해진 색까지 본다.
 */

const THIS_MONTH = thisMonth();
const LAST_MONTH = lastMonth();
/** 결산의 '살펴볼 변화' 는 지난달과 그 앞달을 견준다. 견줄 앞달이 있어야 카드가 다 찬다. */
const TWO_MONTHS_AGO = shiftMonth(THIS_MONTH, -2);

test('43 한 달 지출을 도넛과 목록으로 나눠 본다', async ({
  appShell,
  demo,
  home,
  prep,
  report,
}) => {
  await home.open();
  await home.waitReady();
  await demo.open('한 달 리포트', '어디로 얼마나 갔는지 한 화면에서 본다');

  await demo.step('이번 달에 네 갈래로 10만원을 썼다고 하자');
  await prep.addExpense({
    amount: 50_000,
    daysAgo: 0,
    categoryId: await prep.categoryIdByName('식비'),
  });
  await prep.addExpense({
    amount: 25_000,
    daysAgo: 0,
    categoryId: await prep.categoryIdByName('교통'),
  });
  await prep.addExpense({
    amount: 15_000,
    daysAgo: 0,
    categoryId: await prep.categoryIdByName('카페·간식'),
  });
  await prep.addExpense({
    amount: 10_000,
    daysAgo: 0,
    categoryId: await prep.categoryIdByName('쇼핑'),
  });
  await home.open();
  await home.waitReady();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(100_000));
  await demo.beat(2);

  await demo.step('홈은 총액 하나만 말한다. 리포트 탭으로 옮긴다');
  await appShell.goToTab('리포트');
  await report.waitReady();
  await expect(report.headlineLabel).toContainText(formatMonthLabel(THIS_MONTH));
  await demo.beat(2);

  await demo.step('맨 위 숫자는 홈에서 보던 것과 같다');
  await expect(report.total).toHaveText(formatCurrency(100_000));
  await demo.beat(3);

  await demo.step('도넛이 그 10만원을 분류대로 가른다');
  await expect(report.donutSlices).toHaveCount(4);
  await demo.beat(3);

  await demo.step('조각마다 다른 색이 실제로 칠해져 있다');
  const painted = await report.paintedColors();
  expect(
    new Set(painted.slices).size,
    `조각 색이 서로 겹친다: ${JSON.stringify(painted.slices)}`,
  ).toBe(4);
  await demo.beat(3);

  await demo.step('목록 줄 앞의 색 점이 도넛과 같은 색이다');
  expect(new Set(painted.swatches)).toEqual(new Set(painted.slices));
  await demo.beat(3);

  await demo.step('줄마다 금액과 비중이 함께 적힌다');
  await expect(report.amount('식비')).toHaveText(formatCurrency(50_000));
  await expect(report.share('식비')).toHaveText('50%');
  await demo.beat(3);

  await demo.step('맨 아래 여섯 달 흐름에서 이번 달이 어디쯤인지 본다');
  await report.trendBars.first().scrollIntoViewIfNeeded();
  await expect(report.trendBar(THIS_MONTH)).toHaveAttribute('data-current', '');
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('44 달을 옮기고 수입으로 바꿔 본다', async ({ appShell, demo, home, prep, report }) => {
  await home.open();
  await home.waitReady();
  await demo.open('달과 종류 바꾸기', '지난달로 옮기고, 쓴 돈에서 번 돈으로 바꾼다');

  await demo.step('지난달에 8만원, 이번 달에 2만원을 쓰고 월급을 받았다고 하자');
  await prep.addTransaction({
    amount: 80_000,
    on: `${LAST_MONTH}-01`,
    categoryId: await prep.categoryIdByName('식비'),
  });
  await prep.addExpense({
    amount: 20_000,
    daysAgo: 0,
    categoryId: await prep.categoryIdByName('교통'),
  });
  await prep.addTransaction({
    amount: 2_000_000,
    daysAgo: 0,
    type: 'income',
    merchant: '월급',
    categoryId: await prep.categoryIdByName('월급'),
  });
  await home.open();
  await home.waitReady();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(20_000));
  await demo.beat(2);

  await demo.step('리포트 탭을 열면 이번 달 쓴 돈이 먼저 보인다');
  await appShell.goToTab('리포트');
  await report.waitReady();
  await expect(report.total).toHaveText(formatCurrency(20_000));
  await demo.beat(3);

  await demo.step('왼쪽 화살표로 지난달로 옮긴다');
  await report.goPreviousMonth();
  await expect(report.monthLabel()).toHaveText(formatMonthLabel(LAST_MONTH));
  await demo.beat(3);

  await demo.step('총액과 목록이 그 달 것으로 바뀐다');
  await expect(report.total).toHaveText(formatCurrency(80_000));
  await demo.beat(3);

  await demo.step('오른쪽 화살표로 이번 달에 돌아온다. 오지 않은 달로는 더 못 간다');
  await report.monthButton('next').click();
  await report.waitReady();
  await expect(report.monthButton('next')).toBeDisabled();
  await demo.beat(3);

  await demo.step('소비에서 수입으로 바꾼다');
  await report.modeTab('수입').click();
  await expect(report.total).toHaveText(formatSignedCurrency(2_000_000));
  await demo.beat(3);

  await demo.step('목록도 번 돈 쪽으로 갈아탄다');
  await expect(report.rows).toHaveCount(1);
  await expect(report.amount('월급')).toHaveText(formatSignedCurrency(2_000_000));
  await demo.beat(3);

  await demo.step('조각이 하나뿐이면 100% 링이라 도넛을 그리지 않는다');
  await expect(report.donut).toHaveCount(0);
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('49 지난달 결산 카드 넉 장을 넘겨 본다', async ({ demo, prep, report }) => {
  const food = await prep.categoryIdByName('식비');
  const cafe = await prep.categoryIdByName('카페·간식');
  await prep.setBudget(400_000, LAST_MONTH);
  await prep.addTransaction({ amount: 300_000, on: `${TWO_MONTHS_AGO}-05`, categoryId: food });
  await prep.addTransaction({ amount: 47_300, on: `${TWO_MONTHS_AGO}-06`, categoryId: cafe });
  await prep.addTransaction({ amount: 240_000, on: `${LAST_MONTH}-05`, categoryId: food });
  await prep.addTransaction({ amount: 90_000, on: `${LAST_MONTH}-06`, categoryId: cafe });
  await prep.saveNoSpend(`${LAST_MONTH}-02`);

  await report.open();
  await report.waitReady();
  await demo.open('지난달 결산', '한 달이 끝나면 잘한 것부터 넉 장으로 돌아본다');

  await demo.step('지난달로 옮기면 결산 입구가 생긴다. 끝난 달에만 뜬다');
  await report.goPreviousMonth();
  await expect(report.monthLabel()).toHaveText(formatMonthLabel(LAST_MONTH));
  await expect(report.closing.card).toBeVisible();
  await demo.beat(3);

  await demo.step('첫 장은 잘한 것이다. 근거가 있는 것만 적는다');
  await report.closing.open();
  await expect(report.closing.highlights).toHaveCount(3);
  await demo.beat(4);

  await demo.step('둘째 장은 돈 흐름. 번 돈과 쓴 돈, 며칠 적었는지');
  await report.closing.nextButton.click();
  await expect(report.closing.flow).toBeVisible();
  await demo.beat(4);

  await demo.step('셋째 장은 늘어난 것 하나. 잘못이 아니라 알아두면 좋은 변화다');
  await report.closing.nextButton.click();
  await expect(report.closing.change).toContainText('나쁜 게 아니라');
  await demo.beat(4);

  await demo.step('마지막 장은 다음 달에 해 볼 것 하나. 예산은 대신 정해 주지 않는다');
  await report.closing.nextButton.click();
  await expect(report.closing.budgetLink).toBeVisible();
  await demo.beat(4);

  await demo.step('다 봤으면 닫는다. 뒤로가기와 ✕ 로도 닫힌다');
  await report.closing.doneButton.click();
  await expect(report.closing.overlay).toHaveCount(0);
  await demo.beat(2);

  await demo.clearStep();
  await demo.beat(2);
});
