import type { Page } from '@playwright/test';

import { shiftMonth, toLedgerDate } from '../../src/shared/lib/format';
import { logsNamed } from '../support/aitMock';
import type { PrepApi } from '../support/api';
import { expect, test } from '../support/fixtures';
import type { ReportScreen } from '../screens/ReportScreen';

/**
 * 🔴 **광고가 뜬 채 멈춰 갇히던 자리**(2026-09-25 사용자 신고).
 *
 * 「전면광고가 나왔는데 직접 눌러서 플레이하라면서 눌리지도 않고 ... 2분 넘게 지나도
 * 아무런 반응 없고 눌러지지도 않아. X버튼도 안 생겨.」
 *
 * **그 광고는 우리가 못 닫는다.** 토스가 띄운 네이티브라 우리 웹뷰 위에 있고, SDK 에
 * 닫는 함수가 없다(`load` · `show` · 이벤트 구독뿐이다). 1호 제품에서 같은 신고를 받고
 * 확인한 결과다.
 *
 * 그래서 여기서 지키는 것은 **닫는 것이 아니라 세는 것**이다. 갇힌 사람은 답을 기다리지
 * 않고 앱을 끄므로, 결과만 보면 가장 나쁜 결말이 통계에서 통째로 빠진다. 광고가 뜨는
 * 순간 표를 적고 끝나면 지워, 다음에 열었을 때 남아 있으면 그 판이 갇힌 판이다.
 *
 * 우리 쪽 시간 제한(180초 → 90초)과 닫힘 폴백은 `fullScreenAdFlow.test.ts` 가 표로 잰다.
 * 브라우저 목은 늘 닫힘 신호를 주기 때문에 그 길을 화면으로 밟을 수가 없다.
 *
 * 상한을 세는 전면 광고는 지난달 결산 한 자리라(ADR-0039) 그 입구로 광고를 띄운다.
 */

/** 결산 입구는 끝난 달에 기록이 있을 때만 선다. 지난달 한가운데에 한 건 심고 그 달을 연다. */
async function openLastMonthReport(prep: PrepApi, report: ReportScreen): Promise<void> {
  const lastMonth = shiftMonth(toLedgerDate(new Date()).slice(0, 7), -1);
  await prep.addTransaction({ amount: 12_000, on: `${lastMonth}-15` });
  await report.open({ month: lastMonth });
  await report.waitReady();
}

/** 지난번이 광고에 갇힌 채 끝난 사람으로 연다. 목 SDK 저장소는 접두사를 붙인 localStorage 다. */
async function seedStuckMark(page: Page, where: string): Promise<void> {
  await page.addInitScript((value: string) => {
    try {
      window.localStorage.setItem('__ait_storage:ad-on-screen', value);
    } catch {
      /* 저장소를 못 여는 문서에서는 이 앱이 돌지 않는다. */
    }
  }, where);
}

async function readStuckMark(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem('__ait_storage:ad-on-screen'));
}

/** 광고가 덮인 채로 이만큼 연달아 죽은 사람으로 연다. */
async function seedStuckDeaths(page: Page, deaths: number): Promise<void> {
  await page.addInitScript((value: string) => {
    try {
      window.localStorage.setItem('__ait_storage:ad-stuck-deaths', value);
    } catch {
      /* 저장소를 못 여는 문서에서는 이 앱이 돌지 않는다. */
    }
  }, String(deaths));
}

async function readStuckDeaths(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem('__ait_storage:ad-stuck-deaths'));
}

test.describe('광고에 갇힌 판을 센다', () => {
  test('지난번에 갇힌 채 끝났으면 앱을 열 때 한 번 센다', async ({ page, home }) => {
    await seedStuckMark(page, 'photo');
    await home.open();
    await home.waitReady();

    await expect
      .poll(async () => (await logsNamed(page, 'ad_stuck_exit')).length)
      .toBeGreaterThan(0);

    const [log] = await logsNamed(page, 'ad_stuck_exit');
    // 어느 자리의 광고였는지가 함께 남아야 튀는 자리를 찾을 수 있다.
    expect(log.params?.where).toBe('photo');
  });

  test('세고 나면 표를 지운다', async ({ page, home }) => {
    // 안 지우면 한 번 갇힌 사람이 앱을 열 때마다 계속 세어진다.
    await seedStuckMark(page, 'closing');
    await home.open();
    await home.waitReady();

    await expect.poll(() => readStuckMark(page)).toBe(null);
  });

  test('갇힌 적이 없으면 아무것도 안 센다', async ({ page, home }) => {
    await home.open();
    await home.waitReady();
    // 홈이 다 서고도 로그가 없어야 한다. 잠깐 기다렸다가 센다.
    await page.waitForTimeout(500);
    expect(await logsNamed(page, 'ad_stuck_exit')).toHaveLength(0);
  });

  test('🔴 광고가 떠 있는 동안 표가 적힌다', async ({ page, prep, report }) => {
    /*
      **여기가 이 기능의 전부다.** 갇힌 사람은 답을 기다리지 않고 앱을 끄므로, 뜨는 순간
      적어 두지 않으면 그 판은 아무 데도 안 남는다. 아래 검사들은 심어 둔 표를 읽는 쪽만
      보므로, 적는 배선을 통째로 지워도 전부 초록이다. 이 검사가 그 자리를 잡는다.

      광고가 도는 동안을 노려야 해서 목이 덮개를 걷기 전에 폴링한다.
    */
    await openLastMonthReport(prep, report);
    await report.closing.card.click();
    await report.closing.adConsentConfirm.click();

    await expect
      .poll(() => readStuckMark(page), { timeout: 20_000, intervals: [50] })
      .toBe('closing');
  });

  test('광고가 정상으로 끝나면 표가 안 남는다', async ({ page, prep, report }) => {
    /*
      목 SDK 의 광고는 떴다가 스스로 닫힌다. 그 한 편을 실제로 지나온 뒤 표가 비어 있는지
      본다. **표를 적기만 하고 안 지우면 멀쩡한 사람이 전부 갇힌 것으로 세어진다.**
    */
    await openLastMonthReport(prep, report);
    await report.closing.card.click();
    await report.closing.adConsentConfirm.click();

    await expect
      .poll(async () => (await logsNamed(page, 'interstitial_result')).length, { timeout: 20_000 })
      .toBeGreaterThan(0);

    await expect.poll(() => readStuckMark(page)).toBe(null);
  });
});

/**
 * 🔴 **세 번째 신고**(2026-09-25 밤).
 *
 * 「15초 지나도 광고 안꺼져서 그냥 앱을 꺼야해. 이거 제대로 해줘.」
 *
 * 15초에 푸는 것은 우리 화면이고 광고는 토스가 띄운 것이라 그대로 덮고 있다. 세션 기억은
 * 앱을 끄면 함께 사라져서 다시 열면 또 걸렸다. 그래서 저장소에 남기고, 쌓이면 그
 * 기기에서는 전면 광고를 아예 안 띄운다(ADR-0038).
 *
 * ⚠ **연달아 두 번이다.** 표는 고장에만 남는 것이 아니라 지겨워서 끈 사람에게도 남는다.
 */
test.describe('갇힌 적이 쌓인 기기에서는 광고를 안 띄운다', () => {
  test('🔴 연달아 두 번이면 결산이 광고 없이 열린다', async ({ page, prep, report }) => {
    await seedStuckDeaths(page, 2);
    await openLastMonthReport(prep, report);
    // 심은 값이 실제로 닿았는지 먼저 본다. 헛돌면 아래가 통째로 무의미해진다.
    expect(await readStuckDeaths(page)).toBe('2');

    await report.closing.card.click();

    /*
      광고를 띄운다는 예고(동의 창)부터 안 뜬다. 못 서는 곳에 예고를 적지 않는다.
      그대로 결산이 열리고, 표도 안 적힌다.
    */
    await expect(report.closing.overlay).toBeVisible();
    await expect(report.closing.adConsentConfirm).toHaveCount(0);
    expect(await readStuckMark(page)).toBe(null);

    /*
      **지나간 이유가 `stalled` 여야 한다.** 이것이 없으면 광고 그룹이 안 잡힌 판
      (`no_group`)으로도 이 검사가 초록으로 남는다.
    */
    const logs = await logsNamed(page, 'interstitial_result');
    expect(logs.at(-1)?.params).toMatchObject({ result: 'skipped', reason: 'stalled' });
  });

  test('한 번만 죽었으면 아직 안 끈다. 지겨워서 끈 사람까지 걸린다', async ({
    page,
    prep,
    report,
  }) => {
    await seedStuckDeaths(page, 1);
    await openLastMonthReport(prep, report);
    expect(await readStuckDeaths(page)).toBe('1');

    await report.closing.card.click();
    await expect(report.closing.adConsentConfirm).toBeVisible();
  });

  test('앱이 광고에 덮인 채 죽었으면 한 칸 오른다', async ({ page, home }) => {
    await seedStuckMark(page, 'photo');
    await home.open();
    await home.waitReady();

    await expect.poll(() => readStuckDeaths(page)).toBe('1');
  });

  test('🔴 광고 한 편이 제대로 걷히면 연속 기록이 끊긴다', async ({ page, prep, report }) => {
    /*
      누적으로 세면 오래 쓰는 사람은 거의 전원이 문턱에 닿는다. 사이에 멀쩡한 판이
      하나라도 있으면 그건 연속이 아니다. 목 SDK 의 광고는 떴다가 스스로 닫힌다.
    */
    await seedStuckDeaths(page, 1);
    await openLastMonthReport(prep, report);
    await report.closing.card.click();
    await report.closing.adConsentConfirm.click();

    await expect
      .poll(async () => (await logsNamed(page, 'interstitial_result')).length, { timeout: 20_000 })
      .toBeGreaterThan(0);

    await expect.poll(() => readStuckDeaths(page)).toBe(null);
  });
});
