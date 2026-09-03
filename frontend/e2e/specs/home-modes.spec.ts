import type { Page } from '@playwright/test';

import { formatCurrency } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 홈이 상황에 따라 다른 얼굴로 뜬다.
 *
 * 확인하려는 동작은 화면으로 하고, 그 배경이 되는 상태만 API 로 심는다.
 */

/**
 * devtools 목의 광고 다이얼을 미채움으로 돌린다.
 *
 * 이 함수 본문은 브라우저에서 돈다. 바깥 스코프를 참조하면 안 된다.
 * 익명키 트랩이 이미 `window.__ait` 에 setter 를 걸어 두었으므로 여기서 다시 정의하지 않는다.
 * 목이 붙는 순간을 놓치지 않게 짧은 주기로 확인만 하고, 값이 박히면 멈춘다.
 */
function forceAdNoFill(): void {
  interface AitManager {
    state?: { ads?: { forceNoFill?: boolean } };
    patch?: (slice: string, partial: Record<string, unknown>) => void;
  }

  const deadline = Date.now() + 10_000;
  const timer = setInterval(() => {
    const manager = (window as unknown as { __ait?: AitManager }).__ait;
    if (manager?.state?.ads?.forceNoFill === true || Date.now() > deadline) {
      clearInterval(timer);
      return;
    }
    manager?.patch?.('ads', { forceNoFill: true });
  }, 1);
}

/** 다이얼이 실제로 켜졌는지. 안 켜졌으면 미채움을 검증할 수 없으니 테스트를 세운다. */
async function adNoFillForced(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      (window as unknown as { __ait?: { state?: { ads?: { forceNoFill?: boolean } } } }).__ait
        ?.state?.ads?.forceNoFill === true,
  );
}

test('며칠 비우면 복구 카드가 뜨고, 오늘 기록하면 사라진다', async ({
  home,
  recordSheet,
  prep,
}) => {
  await test.step('나흘 전 기록만 있는 상태를 만든다', async () => {
    const foodId = await prep.categoryIdByName('식비');
    await prep.addExpense({ amount: 9_000, daysAgo: 4, categoryId: foodId });
  });

  await test.step('복구 카드가 뜬다', async () => {
    await home.open();
    await home.waitReady();
    await expect(home.catchUpButton).toBeVisible();
  });

  await test.step('오늘 기록하면 카드가 사라진다', async () => {
    await home.catchUpButton.click();
    await recordSheet.waitOpen();
    await recordSheet.enterAmount(5_000);
    await recordSheet.pickCategory('식비');
    await recordSheet.waitSaved();
    await recordSheet.confirmButton.click();
    await recordSheet.waitClosed();

    await expect(home.catchUpButton).toHaveCount(0);
  });
});

test('예산이 있으면 남은 예산이 먼저 보인다', async ({ home, prep }) => {
  // 확인하려는 것은 처음 열었을 때의 얼굴이다. 화면으로 예산을 정하면 이미 넘어간 뒤라
  // 콜드 로드 렌더를 못 본다. 그래서 배경 상태만 API 로 심는다.
  await prep.setBudget(300_000);
  await prep.addExpense({ amount: 20_000, daysAgo: 0 });

  await home.open();
  await home.waitReady();

  await expect(home.remainingBudget).toHaveText(formatCurrency(280_000));
  // 예산을 정한 뒤에는 예산을 다시 묻지 않는다.
  await expect(home.saveBudgetButton).toHaveCount(0);
});

test('광고가 붙지 않으면 빈 자리를 남기지 않는다', async ({ page, home }) => {
  // 목의 미채움 다이얼을 켠다. 목은 이때 초기화부터 실패시키고 배너도 붙이지 않는다.
  await page.addInitScript(forceAdNoFill);

  await home.open();
  await home.waitReady();

  expect(await adNoFillForced(page), '목의 미채움 다이얼이 켜지지 않았다').toBe(true);

  // 슬롯 자체는 항상 DOM 에 있다. 홈이 모드를 바꿀 때 다시 붙는 것을 막으려고 최상위에 둔 자리다.
  await expect(home.adSlot).toHaveCount(1);

  // 채울 광고가 없으면 자리를 접는다. 높이가 남으면 화면에 빈 칸이 생긴다.
  await expect(home.adSlot).not.toBeVisible();
  expect(await home.adSlot.boundingBox(), '접힌 광고 자리가 아직 크기를 차지한다').toBeNull();
});

test('광고가 붙으면 그 자리를 규격대로 차지한다', async ({ home }) => {
  await home.open();
  await home.waitReady();

  // 슬롯 안은 SDK 가 직접 그린다. 안에 무엇이 생겼으면 배너가 붙은 것이다.
  await expect(home.adBanner).toBeVisible();

  const box = await home.adSlot.boundingBox();
  expect(box?.height, `광고 자리 높이가 ${box?.height}px 다`).toBe(96);
});
