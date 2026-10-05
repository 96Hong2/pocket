import { ROUTES } from '../../src/app/router/routes';
import { formatMonthLabel, toLedgerDate } from '../../src/shared/lib/format';
import { logsNamed, pressSystemBack } from '../support/aitMock';
import { thisMonth } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 한 달 시작일. 월급날이 25일인 사람이 25일부터 다음 달 24일까지를 한 달로 본다.
 *
 * 기대값은 화면 코드의 규칙을 빌리지 않고 오늘 날짜에서 달력으로 직접 센다.
 * 오늘이 며칠이든 통과해야 한다(25일 전후로 이름 달이 하나 넘어간다).
 */

const DAY_MS = 86_400_000;

function utcDay(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day);
}

function short(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCMonth() + 1}.${date.getUTCDate()}`;
}

/** 시작일 25 로 오늘이 든 기간과 화면에 적혀야 할 말들. */
function salaryPeriod() {
  const [year, month, day] = toLedgerDate(new Date()).split('-').map(Number);
  const today = utcDay(year, month, day);
  // 25일부터는 이번 달 25일에 시작한 기간이다. 그 전이면 지난달 25일에 시작했다.
  const start = day >= 25 ? utcDay(year, month, 25) : utcDay(year, month - 1, 25);
  const startDate = new Date(start);
  // 시작일이 16 이상이면 기간의 날 대부분이 든 끝 달이 이름이다.
  const named = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1));
  const namedYear = named.getUTCFullYear();
  const namedMonth = named.getUTCMonth() + 1;
  const end = utcDay(namedYear, namedMonth, 24);
  const elapsed = (today - start) / DAY_MS;
  const previousStart = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() - 1, 25);
  const previousEnd = start - DAY_MS;
  const previousWindowEnd = Math.min(previousStart + elapsed * DAY_MS, previousEnd);
  return {
    key: `${namedYear}-${String(namedMonth).padStart(2, '0')}`,
    monthLabel: `${namedYear}년 ${namedMonth}월`,
    monthNumber: namedMonth,
    range: `${short(start)} ~ ${short(end)}`,
    preview: `${namedMonth}월은 ${startDate.getUTCMonth() + 1}월 25일부터 ${namedMonth}월 24일까지예요`,
    remaining: (end - today) / DAY_MS + 1,
    comparison: `${short(start)}~${short(today)} vs ${short(previousStart)}~${short(previousWindowEnd)}`,
  };
}

/** 시작일 1 일 때 이번 달 시트 미리보기 줄. */
function calendarPreview(): string {
  const [year, month] = thisMonth().split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${month}월은 ${month}월 1일부터 ${lastDay}일까지예요`;
}

test('관리 탭에서 시작일을 25일로 바꾸면 예산, 리포트, 홈이 그 기간으로 바로 바뀐다', async ({
  page,
  prep,
  appShell,
  manage,
  report,
  home,
}) => {
  const expected = salaryPeriod();
  await prep.setBudget(300_000);
  await prep.addExpense({ amount: 12_000, daysAgo: 0 });

  await manage.open();
  await manage.waitReady();
  await expect(manage.monthLabel).toHaveText(formatMonthLabel(thisMonth()));
  await expect(manage.monthStartRow).toHaveAccessibleName('한 달 시작 매달 1일');

  await manage.monthStartRow.click();
  await expect(manage.monthStart.sheet).toBeVisible();
  await expect(manage.monthStart.day(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(manage.monthStart.preview).toHaveText(calendarPreview());
  // 고를 때마다 오늘이 든 기간이 바뀌어 보인다. 저장 전이라 화면 뒤는 그대로다.
  await manage.monthStart.day(25).click();
  await expect(manage.monthStart.preview).toHaveText(expected.preview);
  await manage.monthStart.save(25);

  // 저장하면 시트가 닫히고 다시 열지 않아도 바뀐 기간이 보인다.
  await expect(manage.monthStartRow).toHaveAccessibleName('한 달 시작 매달 25일');
  await expect(manage.monthLabel).toHaveText(expected.monthLabel);
  await expect(manage.total.caption).toContainText(`${expected.remaining}일 남음`);

  await appShell.goToTab('리포트');
  await report.waitReady();
  await expect(report.monthLabel()).toHaveText(expected.monthLabel);
  await expect(report.periodLine).toHaveText(expected.range);
  await expect(report.headlineLabel).toHaveText(`${expected.monthLabel}에 쓴 돈`);
  await expect(report.comparison).toContainText(expected.comparison);
  await expect(report.trendBar(expected.key)).toHaveAttribute('data-current', '');
  await expect(report.monthButton('next')).toBeDisabled();

  await appShell.goToTab('홈');
  await expect(home.hero.label).toHaveText(`${expected.monthNumber}월 · 남은 예산`);
  await expect.poll(() => home.hero.remainingDays()).toBe(expected.remaining);

  const opened = await logsNamed(page, 'month_start_opened');
  expect(opened.map((log) => log.params.where)).toEqual(['manage']);
  const saved = await logsNamed(page, 'month_start_saved');
  expect(saved.map((log) => [log.params.where, log.params.day, log.params.from_day])).toEqual([
    ['manage', 25, 1],
  ]);
});

test('리포트 기간 줄이 같은 시트를 열고, 1일로 되돌리면 기간 줄이 사라진다. 달력은 달력 월 그대로다', async ({
  page,
  prep,
  report,
  calendar,
}) => {
  const expected = salaryPeriod();
  await prep.addExpense({ amount: 8_000, daysAgo: 0 });
  await prep.setMonthStartDay(25);

  // 달력은 시작일을 따르지 않는다.
  await calendar.open();
  await calendar.waitReady();
  await expect(calendar.monthLabel).toHaveText(formatMonthLabel(thisMonth()));

  await report.open();
  await report.waitReady();
  await expect(report.periodLine).toHaveText(expected.range);

  await report.periodLine.click();
  await expect(report.monthStart.sheet).toBeVisible();
  await expect(report.monthStart.day(25)).toHaveAttribute('aria-pressed', 'true');
  // Esc 는 시트만 닫는다.
  await page.keyboard.press('Escape');
  await expect(report.monthStart.sheet).toHaveCount(0);
  await expect(report.periodLine).toBeVisible();

  await report.periodLine.click();
  await report.monthStart.save(1);
  await expect(report.periodLine).toHaveCount(0);
  await expect(report.monthLabel()).toHaveText(formatMonthLabel(thisMonth()));
});

test('앱 설정 줄도 같은 시트를 열고, 뒤로가기는 시트만 닫는다', async ({
  page,
  appShell,
  settings,
}) => {
  await settings.open();
  await settings.waitReady();
  await expect(settings.monthStartRow).toHaveAccessibleName('한 달 시작일 매달 1일');

  await settings.monthStartRow.click();
  await expect(settings.monthStart.sheet).toBeVisible();
  await pressSystemBack(page);
  await expect(settings.monthStart.sheet).toHaveCount(0);
  await expect(settings.monthStartRow).toBeVisible();
  expect(appShell.pathname).toBe(ROUTES.settings);

  await settings.monthStartRow.click();
  await settings.monthStart.save(10);
  await expect(settings.monthStartRow).toHaveAccessibleName('한 달 시작일 매달 10일');
});
