import {
  formatCurrency,
  formatMonthLabel,
  formatSignedCurrency,
  formatShortDate,
  shiftMonth,
  toLedgerDate,
} from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 리포트 한 바퀴와 그 경계.
 *
 * 이 화면의 숫자는 전부 조회 하나가 실어 준다. 그래서 여기서 재는 것은
 * "화면이 서버 값을 옳게 그리는가" 와 "서버가 옳은 창을 세는가" 둘이다.
 *
 * 뒤엣것이 어렵다. 「지난달 같은 날짜까지」를 달 전체와 헷갈리면 숫자만 봐서는 안 보인다.
 * 그래서 화면이 **무엇과 견줬는지 날짜를 글자로 찍고**, 여기서 그 글자를 단언한다.
 */

/** 가계부 시간대(KST) 기준 오늘. 러너가 UTC 면 `new Date().getDate()` 와 하루 어긋난다. */
const TODAY = toLedgerDate(new Date());
const THIS_MONTH = TODAY.slice(0, 7);
const LAST_MONTH = shiftMonth(THIS_MONTH, -1);
const TODAY_DAY = Number(TODAY.slice(8, 10));

/** 월초·월말 어디서 돌려도 창 안에 들어오는 날. 오늘이 며칟날이든 기대값이 하나다. */
const EARLY = '01';

function day(month: string, dayOfMonth: string): string {
  return `${month}-${dayOfMonth}`;
}

/** 그 날이 속한 주의 월요일. 요일 계산도 가계부 시간대로 한다. */
function mondayOf(isoDay: string): string {
  const at = new Date(`${isoDay}T12:00:00+09:00`);
  // getUTCDay 는 일=0 이다. 월요일 기준으로 옮긴다.
  const weekday = (at.getUTCDay() + 6) % 7;
  return shiftDay(isoDay, -weekday);
}

/** `2026-09-05` 에서 며칠 옮긴 날짜. */
function shiftDay(isoDay: string, delta: number): string {
  const at = new Date(`${isoDay}T12:00:00+09:00`);
  at.setUTCDate(at.getUTCDate() + delta);
  return at.toISOString().slice(0, 10);
}

test('그 달 지출을 총액·조각·6개월 흐름으로 보여준다', async ({ prep, report }) => {
  const food = await prep.categoryIdByName('식비');
  const cafe = await prep.categoryIdByName('카페·간식');
  await prep.addTransaction({ amount: 30_000, on: day(THIS_MONTH, EARLY), categoryId: food });
  await prep.addTransaction({ amount: 10_000, on: day(THIS_MONTH, EARLY), categoryId: cafe });

  await report.open();
  await report.waitReady();

  await expect(report.total).toHaveText(formatCurrency(40_000));
  // 지난달을 보면서 "이번 달" 이라고 적으면 거짓이다. 헤드라인이 어느 달인지 말한다.
  await expect(report.headlineLabel).toContainText(formatMonthLabel(THIS_MONTH));

  // 조각 둘이면 도넛을 그린다. 하나면 100% 링이라 알려 주는 것이 없어 안 그린다.
  await expect(report.donutSlices).toHaveCount(2);
  await expect(report.rows).toHaveCount(2);
  await expect(report.amount('식비')).toHaveText(formatCurrency(30_000));
  // 비중은 서버가 준다. 화면이 금액을 다시 나누면 두 곳에서 센 것이 된다.
  await expect(report.share('식비')).toHaveText('75%');
  await expect(report.share('카페·간식')).toHaveText('25%');

  // 기록이 없는 달도 막대로 남는다. 빼면 막대가 밀려 다른 달로 읽힌다.
  await expect(report.trendBars).toHaveCount(6);

  // 여섯 칸이 가로로 넘치면 브라우저가 화면 전체를 축소해 탭바까지 밖으로 밀려난다.
  const { content, visible } = await report.widths();
  expect(content, '리포트 본문이 화면보다 넓다').toBeLessThanOrEqual(visible);
  await expect(report.trendBar(THIS_MONTH)).toHaveAttribute('data-current', '');
  await expect(report.trendBar(LAST_MONTH)).toHaveCount(1);
});

test('지난달과 견줄 때 같은 날짜까지만 센다', async ({ prep, report }) => {
  // 지난달 1일 것만 창에 들어와야 한다. 말일 것이 새어 들어오면 달 전체를 센 것이다.
  await prep.addTransaction({ amount: 10_000, on: day(LAST_MONTH, EARLY) });
  await prep.addTransaction({ amount: 900_000, on: lastDayOf(LAST_MONTH) });
  await prep.addTransaction({ amount: 5_000, on: day(THIS_MONTH, EARLY) });

  await report.open();
  await report.waitReady();

  // 무엇과 견줬는지 날짜가 글자로 있다. 이게 없으면 서버가 달 전체를 세도 그럴듯해 보인다.
  // 지난달에 오늘과 같은 날짜가 없으면 말일로 붙는다. 서버 규칙과 같게 만든다.
  const windowEnd = `${LAST_MONTH}-${String(Math.min(TODAY_DAY, daysIn(LAST_MONTH))).padStart(2, '0')}`;
  await expect(report.comparison).toContainText(formatShortDate(`${LAST_MONTH}-01`));
  await expect(report.comparison).toContainText(formatShortDate(windowEnd));

  // 오늘이 지난달 말일보다 앞이면 90만 원은 창 밖이다. 말일이면 이 검사를 건너뛴다.
  if (TODAY_DAY < daysIn(LAST_MONTH)) {
    await expect(report.comparison).toContainText(formatCurrency(10_000));
    await expect(report.comparison).not.toContainText(formatCurrency(900_000));
  }
});

test('예산을 정했으면 사용률 한 줄이 붙고, 안 정했으면 없다', async ({ prep, report }) => {
  await prep.addTransaction({ amount: 25_000, on: day(THIS_MONTH, EARLY) });

  await report.open();
  await report.waitReady();
  // 예산이 없는데 사용률을 말하면 무엇의 몇 %인지 알 수 없다.
  await expect(report.budgetLine).toHaveCount(0);

  await prep.setBudget(100_000);
  await report.open();
  await report.waitReady();
  await expect(report.budgetLine).toContainText('25%');
});

test('이번 주와 지난주를 같은 요일까지 견준다', async ({ prep, report }) => {
  // 지난주 월요일과 지난주 일요일. 일요일 것은 오늘이 일요일일 때만 창에 들어온다.
  const monday = mondayOf(TODAY);
  await prep.addTransaction({ amount: 4_000, on: shiftDay(monday, -7) });
  await prep.addTransaction({ amount: 800_000, on: shiftDay(monday, -1) });

  await report.open();
  await report.waitReady();

  // 무엇과 견줬는지 날짜가 글자로 있다. 이번 주가 사흘인데 지난주를 이레 잡으면 여기서 보인다.
  await expect(report.weeks).toContainText(formatShortDate(shiftDay(monday, -7)));
  await expect(report.weeks).toContainText(formatShortDate(shiftDay(TODAY, -7)));

  const isSunday = new Date(`${TODAY}T12:00:00+09:00`).getUTCDay() === 0;
  if (!isSunday) {
    await expect(report.weeks).toContainText(formatCurrency(4_000));
    await expect(report.weeks).not.toContainText(formatCurrency(800_000));
  }
});

test('아직 오지 않은 달로는 갈 수 없다', async ({ report }) => {
  await report.open();
  await report.waitReady();

  // 미래 달로 가면 안 끝난 이번 달을 「지난달 전체」로 견주는 거짓 문장이 나온다.
  await expect(report.monthButton('next')).toBeDisabled();
});

test('수입으로 바꾸면 번 돈과 그 분류를 보여준다', async ({ prep, report }) => {
  await prep.addTransaction({ amount: 20_000, on: day(THIS_MONTH, EARLY) });
  await prep.addTransaction({
    amount: 2_000_000,
    on: day(THIS_MONTH, EARLY),
    type: 'income',
    merchant: '월급',
  });

  await report.open();
  await report.waitReady();
  await expect(report.total).toHaveText(formatCurrency(20_000));

  await report.modeTab('수입').click();

  // 수입만 `+` 를 붙인다. 지출과 한 화면에서 헷갈리지 않게 하는 공용 규칙이다.
  await expect(report.total).toHaveText(formatSignedCurrency(2_000_000));
  // 지난달 비교·예산 사용률·주간 비교는 소비 이야기다. 수입 화면에 남으면 무엇의 비교인지 헷갈린다.
  await expect(report.comparison).toHaveCount(0);
  await expect(report.weeks).toHaveCount(0);
  await expect(report.budgetLine).toHaveCount(0);
});

test('기록이 없는 달로 옮겨도 6개월 흐름은 그대로 보여준다', async ({ prep, report }) => {
  await prep.addTransaction({ amount: 12_000, on: day(THIS_MONTH, EARLY) });

  await report.open();
  await report.waitReady();
  await report.goPreviousMonth();

  await expect(report.emptyNotice).toBeVisible();
  await expect(report.rows).toHaveCount(0);
  // 빈 달이라고 흐름까지 감추면 "여기가 어디쯤인지" 를 잃는다.
  await expect(report.trendBars).toHaveCount(6);

  // 돌아오면 안내가 걷힌다. 늘 떠 있으면 아무것도 알려 주지 않는 것과 같다.
  await report.monthButton('next').click();
  await report.waitReady();
  await expect(report.emptyNotice).toHaveCount(0);
});

/**
 * 탭으로 오가야 캐시가 살아 있다. `goto` 로 다시 띄우면 캐시가 통째로 비워져
 * 무엇을 무효화했든 늘 새로 받고, 그러면 이 검사가 아무것도 지키지 않는다.
 *
 * 탭바를 누를 수 있다는 것 자체가 화면이 가로로 안 넘친다는 증거이기도 하다.
 * 넘치면 브라우저가 화면 전체를 축소해 탭바가 보이는 영역 밖으로 밀려난다.
 */
test('기록을 하나 저장하면 리포트 숫자가 따라 바뀐다', async ({
  appShell,
  home,
  recordSheet,
  report,
}) => {
  await report.open();
  await report.waitReady();
  await expect(report.total).toHaveText(formatCurrency(0));

  await appShell.goToTab('홈');
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(7_000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await appShell.goToTab('리포트');
  await report.waitReady();
  // 저장 뒤 무효화 목록에 리포트가 빠져 있으면 옛 숫자(0원)가 그대로 남는다.
  await expect(report.total).toHaveText(formatCurrency(7_000));
});

/** 그 달의 일수. 시간대와 무관하게 달력만 본다. */
function daysIn(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

/** 그 달 말일. `2026-08` → `2026-08-31` */
function lastDayOf(month: string): string {
  return `${month}-${String(daysIn(month)).padStart(2, '0')}`;
}
