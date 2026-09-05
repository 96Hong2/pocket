import type { Page } from '@playwright/test';

/**
 * 앱인토스 devtools 목의 다이얼을 돌린다.
 *
 * 실기기에서만 일어나는 일(광고 미채움, 시스템 뒤로가기)을 브라우저에서 재현하는 통로다.
 * 브릿지는 실기기와 같은 코드로 그대로 돌고, 여기서는 목이 들고 있는 상태만 건드린다.
 *
 * 목 내부 구조(`window.__ait`)에 기대는 코드라 devtools 를 올리면 여기가 먼저 깨진다.
 * 그래서 "켜졌는지" 를 확인하는 짝을 함께 둔다. 조용히 안 켜지면 아무것도 검증하지 못한다.
 */

interface AitManager {
  state?: { ads?: { forceNoFill?: boolean } };
  patch?: (slice: string, partial: Record<string, unknown>) => void;
  trigger?: (event: string) => void;
}

/**
 * 광고 다이얼을 미채움으로 돌린다. `page.addInitScript` 로 심는다.
 *
 * 이 함수 본문은 브라우저에서 돈다. 바깥 스코프를 참조하면 안 된다.
 * 익명키 트랩이 이미 `window.__ait` 에 setter 를 걸어 두었으므로 여기서 다시 정의하지 않는다.
 * 목이 붙는 순간을 놓치지 않게 짧은 주기로 확인만 하고, 값이 박히면 멈춘다.
 */
export function forceAdNoFill(): void {
  interface Manager {
    state?: { ads?: { forceNoFill?: boolean } };
    patch?: (slice: string, partial: Record<string, unknown>) => void;
  }

  const deadline = Date.now() + 10_000;
  const timer = setInterval(() => {
    const manager = (window as unknown as { __ait?: Manager }).__ait;
    if (manager?.state?.ads?.forceNoFill === true || Date.now() > deadline) {
      clearInterval(timer);
      return;
    }
    manager?.patch?.('ads', { forceNoFill: true });
  }, 1);
}

/** 다이얼이 실제로 켜졌는지. 안 켜졌으면 미채움을 보고 있는 것이 아니다. */
export async function adNoFillForced(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as { __ait?: AitManager }).__ait?.state?.ads?.forceNoFill === true,
  );
}

/**
 * 시스템 뒤로가기를 쏜다.
 *
 * 목이 `__ait:backEvent` 를 window 에 던지고, 앱의 BackHandler 가 그것을 받는다.
 * 브라우저 뒤로가기(`page.goBack`)와 다르다. 앱이 이 이벤트를 어떻게 가로채는지가 확인 대상이다.
 */
export async function pressSystemBack(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __ait?: AitManager }).__ait?.trigger?.('backEvent');
  });
}

/**
 * 미니앱이 닫혔는지 지켜본다.
 *
 * 목의 `Screen.close()` 는 화면을 없애지 않고 콘솔에 한 줄을 적는다. 그래서 "시트가 아니라
 * 미니앱이 닫혔다" 는 사고가 브라우저에서는 눈에 안 보인다. 그 한 줄을 보고 판정한다.
 */
export function watchAppClose(page: Page): () => boolean {
  let closed = false;
  page.on('console', (message) => {
    if (message.text().includes('closeView called')) closed = true;
  });
  return () => closed;
}
