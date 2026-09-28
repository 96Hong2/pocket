import type { Page } from '@playwright/test';

import {
  formatCurrency,
  shiftDay,
  shiftMonth,
  toLedgerDate,
  toLedgerNoonIso,
} from '../../src/shared/lib/format';
import { logsNamed } from '../support/aitMock';
import type { PrepApi } from '../support/api';
import { expect, test } from '../support/fixtures';
import type { ReportScreen } from '../screens/ReportScreen';

/**
 * 공유 가계부 리포트.
 *
 * 지키는 것은 넷이다.
 * - **기본 리포트는 광고 없이 바로 보인다.** 쓴 돈, 예산, 분류 비중까지다.
 * - **「자세히 보기」 만 광고 한 편 뒤에 열린다.** 따로 묻는 창 없이 버튼이 곧 고른 것이다.
 * - **한 번 열면 그날은 모든 달, 모든 가계부가 열려 있다.** 달이나 가계부를 바꾸는 것만으로는
 *   광고가 다시 뜨지 않는다. 날짜가 바뀌면 다시 잠긴다.
 * - **가계부가 없는 사람의 리포트는 예전 그대로다.** 칩도 자세히 보기도 없다.
 *
 * 광고가 떴는지는 목 SDK 가 받은 `showFullScreenAd` 호출 수로 센다. 목 광고는 화면에 아무것도
 * 그리지 않고 1.5초 뒤에 스스로 닫혀서 화면으로는 못 잡는다.
 */

/** 가계부 시간대(KST) 기준 오늘. 러너가 UTC 여도 하루가 밀리지 않는다. */
function ledgerToday(): string {
  return toLedgerDate(new Date());
}

/** 목 SDK 가 지금까지 받은 전면(리워드 포함) 광고 표시 요청 수. */
async function adsShown(page: Page): Promise<number> {
  return page.evaluate(() => {
    const state = (
      window as unknown as { __ait?: { state?: { sdkCallLog?: { method: string }[] } } }
    ).__ait?.state;
    return (state?.sdkCallLog ?? []).filter((entry) => entry.method === 'showFullScreenAd').length;
  });
}

/** 기기에 남은 「자세히 보기 광고를 본 날」. 목 SDK 저장소는 접두사를 붙인 localStorage 다. */
async function storedReportDay(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem('__ait_storage:ad-report-day'));
}

/** 이 기기에서 광고에 갇힌 적이 있는 사람으로 연다. 그 기기는 전면·리워드가 모두 꺼진다. */
async function seedStuckSeen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('__ait_storage:ad-stuck-seen', '1');
    } catch {
      /* 저장소를 못 여는 문서에서는 이 앱이 돌지 않는다. */
    }
  });
}

/** 오늘 이미 자세히 보기를 연 사람으로 연다. 광고를 거치지 않고 풀린 화면을 볼 때 쓴다. */
async function seedUnlockedToday(page: Page): Promise<void> {
  await page.addInitScript((day: string) => {
    try {
      window.localStorage.setItem('__ait_storage:ad-report-day', day);
    } catch {
      /* 위와 같음 */
    }
  }, ledgerToday());
}

interface SeededBook {
  bookId: string;
  month: string;
  lastMonth: string;
}

/**
 * 「우리 집」 하나를 만들고 두 달치 기록을 심는다.
 *
 * - 지난달 1일: 장보기 10,000원
 * - 오늘: 장보기 30,000원, 외식·배달 12,000원
 * - 예산 매달 100,000원
 *
 * 지난달 기록을 1일에 두는 까닭: 이번 달은 1일부터 오늘까지를 지난달 같은 날까지와 견준다.
 * 오늘이 며칠이든 지난달 1일은 그 창 안에 든다.
 */
async function seedBook(prep: PrepApi, name = '우리 집'): Promise<SeededBook> {
  const today = ledgerToday();
  const month = today.slice(0, 7);
  const lastMonth = shiftMonth(month, -1);
  const bookId = await prep.createBook({ name });
  await prep.setBookBudget(bookId, 100_000);
  await prep.addBookEntry(bookId, { amount: 10_000, category: '장보기', on: `${lastMonth}-01` });
  await prep.addBookEntry(bookId, { amount: 30_000, category: '장보기', on: today });
  await prep.addBookEntry(bookId, { amount: 12_000, category: '외식·배달', on: today });
  return { bookId, month, lastMonth };
}

/** 리포트 탭을 열고 칩으로 그 가계부를 고른다. 홈에서 고른 가계부가 없으니 내 가계부에서 시작한다. */
async function openBookReport(report: ReportScreen, name = '우리 집'): Promise<void> {
  await report.open();
  await report.waitReady();
  await expect(report.book.chip).toHaveAccessibleName('보는 가계부 내 가계부');
  await report.book.pick(name);
  await report.waitReady();
}

test('우리 집 리포트는 광고 없이 쓴 돈·예산·분류 비중을 바로 보인다', async ({
  page,
  prep,
  report,
}) => {
  const { month } = await seedBook(prep);
  await openBookReport(report);

  // 42,000 = 오늘 장보기 30,000 + 외식·배달 12,000. 지난달 기록은 들지 않는다.
  await expect(report.headlineLabel).toHaveText(`${Number(month.slice(5))}월에 같이 쓴 돈`);
  await expect(report.total).toHaveText(formatCurrency(42_000));
  // 42,000 / 100,000 = 42%
  await expect(report.budgetLine).toHaveText(`예산 ${formatCurrency(100_000)} 중 42%`);
  // 분류 이름과 금액은 가계부 분류 그대로다. 내 가계부 분류(식비 등)로 바뀌지 않는다.
  await expect(report.amount('장보기')).toHaveText(formatCurrency(30_000));
  await expect(report.amount('외식·배달')).toHaveText(formatCurrency(12_000));
  await expect(report.rows).toHaveCount(2);
  await expect(report.donut).toBeVisible();

  // 리드 자리는 칩이 쓴다. 달력은 내 기록만 그려서 공유 가계부를 보는 동안에는 없다.
  await expect(report.lead).toHaveCount(0);
  await expect(report.calendarLink).toHaveCount(0);
  // 공유 리포트에는 배너도 결산 입구도 없다.
  await expect(report.adSlot).toHaveCount(0);
  await expect(report.bottomAdSlot).toHaveCount(0);
  await expect(report.closing.card).toHaveCount(0);

  // 자세히 보기는 잠겨 있고, 무엇을 받는지 먼저 적는다.
  await expect(report.insight.card).toHaveAccessibleName('우리 집 소비 자세히 보기');
  await expect(report.insight.topics).toHaveText([
    '지난달과 비교',
    '가장 많이 늘어난 소비',
    '분류별 자세히',
    '월말 예상',
  ]);
  await expect(report.insight.unlockButton).toBeVisible();
  await expect(report.insight.part('지난달과 비교')).toHaveCount(0);

  // 여기까지 광고는 한 편도 없다. 가계부를 고른 것은 광고 자리가 아니다.
  expect(await adsShown(page)).toBe(0);
  expect(await logsNamed(page, 'report_detail_opened')).toEqual([]);
  expect(await logsNamed(page, 'interstitial_result')).toEqual([]);
});

test('「광고 보고 자세히 보기」 는 리워드 광고 한 편 뒤에 지난달 비교와 가장 많이 늘어난 소비를 연다', async ({
  page,
  prep,
  report,
}) => {
  await seedBook(prep);
  await openBookReport(report);

  await report.insight.unlockButton.click();
  // 광고를 띄우는 동안 버튼이 잠기고 그렇다고 말한다. 두 번 눌리면 광고가 겹친다.
  await expect(report.insight.loadingButton).toBeDisabled();

  await expect(report.insight.part('지난달과 비교')).toBeVisible();
  // 42,000(이번 달 1일~오늘) - 10,000(지난달 1일~같은 날) = 32,000
  await expect(report.insight.part('지난달과 비교')).toContainText(
    `지난달 같은 기간보다 ${formatCurrency(32_000)} 더 썼어요`,
  );
  // 두 달 모두 쓴 분류 중 가장 많이 는 것. 장보기 30,000 - 10,000 = +20,000
  await expect(report.insight.part('가장 많이 늘어난 소비')).toContainText('장보기');
  await expect(report.insight.part('가장 많이 늘어난 소비')).toContainText('+20,000원');
  // 분류마다 이번 달 금액과 지난달 대비. 이번 달에 처음 쓴 분류도 든다.
  // 바로 위 「가장 많이 늘어난 소비」 가 말한 장보기는 여기서 다시 세우지 않는다.
  await expect(report.insight.changeRow('장보기')).toHaveCount(0);
  await expect(report.insight.changeRow('외식·배달')).toContainText(formatCurrency(12_000));
  await expect(report.insight.changeRow('외식·배달')).toContainText('지난달보다 +12,000원');

  // 월말 예상: 쓴 돈 / 지난 날수 * 그 달 날수(서버가 원 단위로 반올림). 화면은 그 값을
  // 천 원 단위로 반올림해 「약」 을 붙인다. 사흘이 안 지났으면 아직 적지 않는다.
  const today = ledgerToday();
  const day = Number(today.slice(8, 10));
  const [year, monthNumber] = today.slice(0, 7).split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  await expect(report.insight.part('월말 예상')).toContainText(
    day >= 3
      ? `이대로면 이번 달 약 ${formatCurrency(Math.round(Math.round((42_000 * daysInMonth) / day) / 1_000) * 1_000)} 써요`
      : '월말 예상은 3일부터 보여 드려요',
  );
  await expect(report.insight.unlockButton).toHaveCount(0);

  // 광고는 정확히 한 편이고, 리워드 결과가 남는다. 목은 보상 이벤트를 안 쏴서 watched 다.
  expect(await adsShown(page)).toBe(1);
  const opened = await logsNamed(page, 'report_detail_opened');
  expect(opened.map((log) => [log.params.ad, log.params.book])).toEqual([['watched', 'shared']]);
  // 로그에 가계부 이름·금액이 실리지 않는다.
  expect(JSON.stringify(opened)).not.toMatch(/우리 집|[\d,]+원/);
  // 상한을 세는 전면 광고 장부는 건드리지 않는다. 스스로 누른 리워드 자리다.
  expect(await logsNamed(page, 'interstitial_result')).toEqual([]);
  await expect.poll(() => storedReportDay(page)).toBe(today);
});

test('한 번 열면 달을 옮기거나 가계부를 바꿔도 그날은 광고 없이 열려 있다', async ({
  page,
  prep,
  report,
}) => {
  const { lastMonth } = await seedBook(prep);
  await openBookReport(report);
  await report.insight.unlockButton.click();
  await expect(report.insight.part('지난달과 비교')).toBeVisible();
  expect(await adsShown(page)).toBe(1);

  // 지난달. 달 전체끼리 견주고(지지난달은 0원), 끝난 달이라 월말 예상은 약속하지도 않는다.
  await report.goPreviousMonth();
  await expect(report.headlineLabel).toHaveText(`${Number(lastMonth.slice(5))}월에 같이 쓴 돈`);
  await expect(report.total).toHaveText(formatCurrency(10_000));
  await expect(report.insight.part('지난달과 비교')).toContainText(
    `지난달보다 ${formatCurrency(10_000)} 더 썼어요`,
  );
  await expect(report.insight.part('월말 예상')).toHaveCount(0);
  await expect(report.insight.unlockButton).toHaveCount(0);

  await report.goNextMonth();
  await expect(report.total).toHaveText(formatCurrency(42_000));
  await expect(report.insight.part('지난달과 비교')).toBeVisible();

  // 내 가계부로 갔다 오기. 내 리포트에는 자세히 보기 카드가 없고 달력 길이 돌아온다.
  await report.book.pick('내 가계부');
  await expect(report.calendarLink).toBeVisible();
  await expect(report.insight.card).toHaveCount(0);
  await report.book.pick('우리 집');
  await expect(report.insight.part('지난달과 비교')).toBeVisible();
  await expect(report.insight.unlockButton).toHaveCount(0);

  // 달 둘, 가계부 둘을 오가는 동안 광고는 처음 한 편 그대로다.
  expect(await adsShown(page)).toBe(1);
  expect(await logsNamed(page, 'report_detail_opened')).toHaveLength(1);
  expect(await logsNamed(page, 'interstitial_result')).toEqual([]);
});

test('다음 날 다시 열면 자세히 보기는 다시 잠겨 있다', async ({ page, prep, report }) => {
  const { month } = await seedBook(prep);
  await openBookReport(report);
  await report.insight.unlockButton.click();
  await expect(report.insight.part('지난달과 비교')).toBeVisible();

  // 기기 시계를 내일 정오로 옮기고 새로 연다. 내일이 다음 달이어도 기록을 심은 달을 연다.
  await page.clock.setFixedTime(new Date(toLedgerNoonIso(shiftDay(ledgerToday(), 1))));
  await report.open({ month });
  await report.waitReady();
  await report.book.pick('우리 집');

  await expect(report.insight.unlockButton).toBeVisible();
  await expect(report.insight.part('지난달과 비교')).toHaveCount(0);
  // 새로 연 문서라 광고 요청 수는 0 에서 다시 센다. 잠긴 카드를 보인 것만으로는 광고가 없다.
  expect(await adsShown(page)).toBe(0);
});

test('광고를 띄울 수 없는 기기(광고에 갇힌 적 있음)는 광고 없이 자세히 보기가 열려 있다', async ({
  page,
  prep,
  report,
}) => {
  await seedStuckSeen(page);
  await seedBook(prep);
  await openBookReport(report);

  // 예고할 광고가 없는데 「광고 보고」 를 적으면 거짓말이다. 처음부터 연다.
  await expect(report.insight.part('지난달과 비교')).toBeVisible();
  await expect(report.insight.unlockButton).toHaveCount(0);
  expect(await adsShown(page)).toBe(0);
  expect(await logsNamed(page, 'report_detail_opened')).toEqual([]);
});

test('같이 쓰는 가계부가 없으면 리포트는 예전 그대로다. 칩도 자세히 보기도 없다', async ({
  page,
  prep,
  report,
}) => {
  const today = ledgerToday();
  await prep.addTransaction({ amount: 25_000, on: today });

  // 목록을 받아 본 뒤에 없다고 말한다. 받기 전에는 칩도 자세히 보기도 없어 보인다.
  const listed = page.waitForResponse(
    (response) => response.url().endsWith('/api/v1/books') && response.request().method() === 'GET',
  );
  await report.open();
  await report.waitReady();
  await listed;

  await expect(report.total).toHaveText(formatCurrency(25_000));
  await expect(report.book.chip).toHaveCount(0);
  await expect(report.lead).toBeVisible();
  await expect(report.calendarLink).toBeVisible();
  await expect(report.adSlot).toHaveCount(1);
  await expect(report.insight.card).toHaveCount(0);
  expect(await adsShown(page)).toBe(0);
});

test.describe('좁은 화면', () => {
  test.use({ viewport: { width: 344, height: 740 } });

  test('344px 에서도 긴 가계부 이름과 풀린 자세히 보기가 가로로 넘치지 않는다', async ({
    prep,
    report,
    page,
  }) => {
    await seedUnlockedToday(page);
    // 이름 칸의 최대 길이(20자)를 채운다.
    await seedBook(prep, '우리 가족 여름 제주도 여행 기록장');
    await openBookReport(report, '우리 가족 여름 제주도 여행 기록장');

    await expect(report.insight.part('분류별 자세히')).toBeVisible();
    await report.insight.card.scrollIntoViewIfNeeded();
    const { content, visible } = await report.widths();
    expect(content).toBeLessThanOrEqual(visible);
  });
});
