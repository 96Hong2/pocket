import type { Page } from '@playwright/test';

import { logsNamed } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

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
 */

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
    await seedStuckMark(page, 'goal');
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

  test('광고가 정상으로 끝나면 표가 안 남는다', async ({ page, manage }) => {
    /*
      목 SDK 의 광고는 떴다가 스스로 닫힌다. 그 한 편을 실제로 지나온 뒤 표가 비어 있는지
      본다. **표를 적기만 하고 안 지우면 멀쩡한 사람이 전부 갇힌 것으로 세어진다.**
    */
    await manage.open();
    await manage.waitReady();
    await manage.subScreenRow('카테고리 관리').click();
    await manage.adConsentConfirm.click();

    await expect
      .poll(async () => (await logsNamed(page, 'interstitial_result')).length, { timeout: 20_000 })
      .toBeGreaterThan(0);

    await expect.poll(() => readStuckMark(page)).toBe(null);
  });
});
