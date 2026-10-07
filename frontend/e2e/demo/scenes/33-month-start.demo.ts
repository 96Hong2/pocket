import {
  formatCurrency,
  formatSignedCurrency,
  toLedgerDate,
} from '../../../src/shared/lib/format';
import { thisMonth } from '../../support/api';
import { expect, test } from '../support/director';

/**
 * 한 달 시작일. 월급날이 25일인 사람이 25일부터 다음 달 24일까지를 한 달로 본다.
 *
 * 기대값은 화면 코드의 규칙을 빌리지 않고 오늘 날짜에서 달력으로 직접 센다
 * (specs/month-start.spec.ts 와 같은 셈). 오늘이 며칠이든 맞게 돈다.
 *
 * 월급은 새 기간 첫날(25일)에, 장보기 둘은 그 뒤 며칠에 심는다. 시작일이 1일인 동안은
 * 지난달 기록이라 안 보이다가, 25일로 바꾸면 이번 기간으로 들어온다.
 */

const DAY_MS = 86_400_000;

function utcDay(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day);
}

function iso(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function short(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCMonth() + 1}.${date.getUTCDate()}`;
}

/** 시작일 25 로 오늘이 든 기간. 날짜는 UTC 자정 값으로만 세고 시간대를 타지 않는다. */
function salaryPeriod() {
  const [year, month, day] = toLedgerDate(new Date()).split('-').map(Number);
  const today = utcDay(year, month, day);
  const start = day >= 25 ? utcDay(year, month, 25) : utcDay(year, month - 1, 25);
  const startDate = new Date(start);
  const named = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1));
  const namedMonth = named.getUTCMonth() + 1;
  const end = utcDay(named.getUTCFullYear(), namedMonth, 24);
  return {
    key: `${named.getUTCFullYear()}-${String(namedMonth).padStart(2, '0')}`,
    monthNumber: namedMonth,
    range: `${short(start)} ~ ${short(end)}`,
    preview: `${namedMonth}월은 ${startDate.getUTCMonth() + 1}월 25일부터 ${namedMonth}월 24일까지예요`,
    /** 기간 첫날과 그 뒤 며칠. 오늘을 넘기지 않는다. */
    day: (offset: number) => iso(Math.min(start + offset * DAY_MS, today)),
    /** 이 기간 날짜 가운데 달력으로 이번 달에 드는 것. */
    inCalendarMonth: (isoDay: string) => isoDay.slice(0, 7) === thisMonth(),
  };
}

const BUDGET = 1_500_000;

test('68 한 달 시작일을 25일로 바꾸면 예산과 리포트와 홈 기간이 함께 바뀐다', async ({
  appShell,
  demo,
  home,
  manage,
  prep,
  report,
}) => {
  const period = salaryPeriod();
  const food = await prep.categoryIdByName('식비');
  const seeds = [
    { amount: 46_000, merchant: '이마트', on: period.day(1) },
    { amount: 32_900, merchant: '쿠팡', on: period.day(3) },
    { amount: 8_000, merchant: '김밥천국', on: toLedgerDate(new Date()) },
  ];
  await prep.setBudget(BUDGET, period.key);
  for (const seed of seeds) await prep.addTransaction({ ...seed, categoryId: food });
  await prep.addTransaction({
    amount: 3_200_000,
    type: 'income',
    merchant: '월급',
    categoryId: await prep.categoryIdByName('월급'),
    on: period.day(0),
  });
  const calendarSpent = seeds
    .filter((seed) => period.inCalendarMonth(seed.on))
    .reduce((sum, seed) => sum + seed.amount, 0);
  const periodSpent = seeds.reduce((sum, seed) => sum + seed.amount, 0);

  await manage.open();
  await manage.waitReady();
  await demo.open('한 달 시작일', '월급날이 25일이면 25일부터 다음 달 24일까지를 한 달로 본다');

  await demo.step('지금은 1일부터 말일까지가 한 달이다');
  await expect(manage.total.used).toHaveText(formatCurrency(calendarSpent));
  await expect(manage.periodLine).toHaveCount(0);
  await demo.beat(2);

  await demo.step('관리 탭 한 달 시작 줄을 누른다');
  await manage.monthStartRow.scrollIntoViewIfNeeded();
  await expect(manage.monthStartRow).toHaveAccessibleName('한 달 시작 매달 1일');
  await demo.beat();
  await manage.monthStartRow.click();
  await expect(manage.monthStart.sheet).toBeVisible();
  await demo.beat();

  await demo.step('25일을 고르면 이번 달이 언제부터 언제까지인지 바로 보여 준다');
  await manage.monthStart.day(25).click();
  await expect(manage.monthStart.preview).toHaveText(period.preview);
  await demo.beat(3);

  await demo.step(`저장하면 예산 기간이 ${period.range} 로 바뀌고 그 사이 쓴 돈을 센다`);
  await manage.monthStart.save(25);
  await expect(manage.monthStartRow).toHaveAccessibleName('한 달 시작 매달 25일');
  // 맨 위로 붙이면 자막 밑에 깔린다. 기간 줄과 그 아래 예산 카드가 함께 보이게 가운데로 올린다.
  await manage.periodLine.evaluate((element) => {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await expect(manage.periodLine).toHaveText(period.range);
  await expect(manage.total.used).toHaveText(formatCurrency(periodSpent));
  await demo.beat(3);

  await demo.step('리포트도 같은 기간을 센다');
  await appShell.goToTab('리포트');
  await report.waitReady();
  await expect(report.periodLine).toHaveText(period.range);
  await expect(report.total).toHaveText(formatCurrency(periodSpent));
  await demo.beat(3);

  await demo.step('25일에 받은 월급이 이번 달 수입으로 들어온다');
  await report.modeTab('수입').click();
  await expect(report.total).toHaveText(formatSignedCurrency(3_200_000));
  await demo.beat(3);

  await demo.step('홈도 그 기간으로 남은 예산을 보여 준다');
  await appShell.goToTab('홈');
  await home.waitReady();
  await expect(home.hero.label).toHaveText(`${period.monthNumber}월 · 남은 예산`);
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - periodSpent));
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
