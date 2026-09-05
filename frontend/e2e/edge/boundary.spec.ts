import { formatCurrency, shiftMonth, toLedgerDate } from '../../src/shared/lib/format';
import { lastMonth, thisMonth } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 달과 날의 경계.
 *
 * 가계부에서 가장 비싼 버그는 **기록이 다른 달에 붙는 것**이다. 숫자가 조금 틀리는 것이 아니라
 * 이번 달 예산이 남았다고 말하면서 실제로는 다 쓴 상태가 된다.
 *
 * 시간대도 여기서 본다. 화면과 서버는 가계부 시간대(KST)로 오늘과 달 경계를 판단한다.
 * 기기 시간대로 날짜를 만들면 UTC 로 도는 러너에서 하루가 밀린다.
 */

/** 지난달 마지막 날. 달마다 길이가 달라 계산해서 얻는다. */
function lastDayOfLastMonth(): string {
  const [year, month] = thisMonth().split('-').map(Number);
  // 이번 달 1일에서 하루 빼면 지난달 마지막 날이다. 월 길이를 우리가 알 필요가 없다.
  const firstOfThisMonth = new Date(Date.UTC(year, month - 1, 1));
  firstOfThisMonth.setUTCDate(0);
  return firstOfThisMonth.toISOString().slice(0, 10);
}

/** `2026-09-01` 같은 이번 달 1일. */
function firstDayOfThisMonth(): string {
  return `${thisMonth()}-01`;
}

test('지난달 마지막 날 기록은 이번 달 예산에 안 섞인다', async ({ home, prep }) => {
  await prep.setBudget(300_000);
  await prep.addTransaction({ amount: 250_000, on: lastDayOfLastMonth(), merchant: '지난달막차' });
  await prep.addTransaction({ amount: 30_000, merchant: '오늘점심' });

  await home.open();
  await home.waitReady();

  // 지난달 25만 원이 섞이면 남은 예산이 2만 원이 된다. 안 섞이면 27만 원이다.
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(270_000));
});

test('이번 달 1일 기록은 지난달 리포트에 안 들어간다', async ({ prep, report }) => {
  await prep.addTransaction({ amount: 77_000, on: firstDayOfThisMonth(), merchant: '이번달첫날' });
  await prep.addTransaction({ amount: 11_000, on: lastDayOfLastMonth(), merchant: '지난달막날' });

  await report.open();
  await report.waitReady();
  await report.goPreviousMonth();

  await expect(report.monthLabel()).toHaveText(labelOf(lastMonth()));
  // 하루 차이로 달을 넘나드는 자리라, 여기서 틀리면 지난달 리포트가 통째로 부풀거나 줄어든다.
  await expect(report.total).toHaveText(formatCurrency(11_000));
});

test('오늘 기록은 달이 바뀌는 날에도 오늘 목록에 남는다', async ({ home, prep }) => {
  // 오늘이 1일이든 말일이든 같아야 한다. 시드 시각은 가계부 시간대 그 날 정오다.
  await prep.addTransaction({ amount: 5_500, merchant: '오늘커피' });

  await home.open();
  await home.waitReady();

  await expect(home.today.row('오늘커피')).toBeVisible();
  await expect(home.today.amount(formatCurrency(5_500))).toBeVisible();
});

test('지난달 달력으로 옮기면 그 달 합계만 센다', async ({ calendar, prep }) => {
  await prep.addTransaction({ amount: 40_000, on: lastDayOfLastMonth(), merchant: '지난달' });
  await prep.addTransaction({ amount: 90_000, merchant: '이번달' });

  await calendar.open();
  await calendar.waitReady();
  await calendar.goToMonth(labelOf(lastMonth()));

  await expect(calendar.totals.expense).toHaveText(formatCurrency(40_000));
});

test('여섯 달 흐름은 기록이 없는 달도 자리를 지킨다', async ({ prep, report }) => {
  // 다섯 달 전에 한 건. 그 사이 달들은 비어 있다.
  const fiveMonthsAgo = shiftMonth(thisMonth(), -5);
  await prep.addTransaction({ amount: 60_000, on: `${fiveMonthsAgo}-15`, merchant: '오래전' });

  await report.open();
  await report.waitReady();

  // 빈 달을 빼고 그리면 막대 간격이 달마다 달라져 흐름을 읽을 수 없다.
  await expect(report.trendBars).toHaveCount(6);
  await expect(report.trendBar(fiveMonthsAgo)).toBeVisible();
  await expect(report.trendBar(thisMonth())).toBeVisible();
});

test('오늘 날짜는 기기 시간대가 아니라 가계부 시간대로 정한다', async ({ home, prep }) => {
  await prep.addTransaction({ amount: 1_200, merchant: '오늘것' });
  // 어제 것은 오늘 목록에 없어야 한다. 하루가 밀리면 이 둘이 뒤바뀐다.
  await prep.addTransaction({ amount: 3_400, daysAgo: 1, merchant: '어제것' });

  await home.open();
  await home.waitReady();

  await expect(home.today.row('오늘것')).toBeVisible();
  await expect(home.today.row('어제것')).toHaveCount(0);

  // 화면이 보는 '오늘' 과 우리가 계산한 '오늘' 이 같은지 되짚는다.
  expect(toLedgerDate(new Date()).slice(0, 7)).toBe(thisMonth());
});

/** `2026-08` → 화면에 찍히는 `2026년 8월`. 화면 출력에서 베끼지 않고 여기서 만든다. */
function labelOf(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${year}년 ${monthNumber}월`;
}
