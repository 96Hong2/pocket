import type { Page } from '@playwright/test';

import type { RecordedLog } from '../../src/shared/toss';

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
  state?: {
    ads?: { forceNoFill?: boolean };
    notification?: { nextResult?: string };
    failureModes?: Record<string, unknown>;
  };
  patch?: (slice: string, partial: Record<string, unknown>) => void;
  trigger?: (event: string) => void;
}

/** 목이 알림 동의 요청에 돌려줄 결과. 거절도 오류가 아니라 결과의 한 종류다. */
export type AgreementResult = 'newAgreement' | 'alreadyAgreed' | 'agreementRejected';

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

/**
 * 알림 동의 요청의 결과를 정한다. `page.addInitScript` 로 넘긴다.
 *
 * 본문은 브라우저에서 돈다. 바깥 스코프를 참조하면 안 된다.
 * 목의 기본값은 `newAgreement` 라, 거절을 보려면 반드시 이 다이얼을 돌려야 한다.
 */
export function forceAgreementResult(result: AgreementResult): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript((next: string) => {
      interface Manager {
        state?: { notification?: { nextResult?: string } };
        patch?: (slice: string, partial: Record<string, unknown>) => void;
      }

      const deadline = Date.now() + 10_000;
      const timer = setInterval(() => {
        const manager = (window as unknown as { __ait?: Manager }).__ait;
        if (manager?.state?.notification?.nextResult === next || Date.now() > deadline) {
          clearInterval(timer);
          return;
        }
        manager?.patch?.('notification', { nextResult: next });
      }, 1);
    }, result);
  };
}

/** 다이얼이 실제로 켜졌는지. 안 켜졌으면 목의 기본 결과를 보고 있는 것이다. */
export async function agreementResultForced(page: Page, result: AgreementResult): Promise<boolean> {
  return page.evaluate(
    (expected) =>
      (window as unknown as { __ait?: AitManager }).__ait?.state?.notification?.nextResult ===
      expected,
    result,
  );
}

/**
 * 알림 동의 요청을 실패로 돌린다. 화면을 연 채로 부른다.
 *
 * `forceAgreementResult` 는 `addInitScript` 라 화면을 여는 순간 한 번 정해진다. 한 번 실패한
 * 뒤 다시 켜서 성공하는 흐름은 열린 화면에서 다이얼을 돌려야 만들 수 있다.
 * `code` 가 없으면 실패를 푼다.
 */
export async function setAgreementFailure(page: Page, code: string | undefined): Promise<void> {
  await page.evaluate((next) => {
    (window as unknown as { __ait?: AitManager }).__ait?.patch?.('failureModes', {
      requestNotificationAgreement: next,
    });
  }, code);
}

/** 실패 다이얼이 실제로 켜졌는지. 안 켜졌으면 실패가 아니라 성공을 보고 있는 것이다. */
export async function agreementFailureForced(page: Page, code: string): Promise<boolean> {
  return page.evaluate(
    (expected) =>
      (window as unknown as { __ait?: AitManager }).__ait?.state?.failureModes
        ?.requestNotificationAgreement === expected,
    code,
  );
}

/**
 * 알림 동의 화면을 몇 번 띄웠는지 센다.
 *
 * 목이 요청을 받을 때마다 콘솔에 한 줄을 적는다. 화면에는 아무 흔적이 안 남아서,
 * "켜는 그 순간에만 묻는다" 는 것을 이 줄 수로만 확인할 수 있다.
 */
export function watchAgreementRequests(page: Page): () => number {
  let count = 0;
  page.on('console', (message) => {
    if (message.text().includes('requestNotificationAgreement:')) count += 1;
  });
  return () => count;
}

/**
 * 지금까지 남은 행동 로그.
 *
 * 실기기 운영 판에서는 토스 수집기로만 가고 이 배열이 없다. 개발·샌드박스에서만
 * 브릿지가 사본을 남긴다(`shared/toss/types.ts` 의 `recordLog`).
 * 로그는 부수적인 일이라, 없으면 빈 배열이다.
 */
export async function readLogs(page: Page): Promise<RecordedLog[]> {
  return page.evaluate(() => window.__pocketLogs ?? []);
}

/** 그 이름으로 남은 로그만. 순서는 찍힌 순서 그대로다. */
export async function logsNamed(page: Page, name: string): Promise<RecordedLog[]> {
  return (await readLogs(page)).filter((log) => log.name === name);
}
