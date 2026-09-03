import { test as base, expect } from '@playwright/test';

import { AppShell } from '../screens/AppShell';
import { HomeScreen } from '../screens/HomeScreen';
import { RecordSheet } from '../screens/RecordSheet';

import { anonKeyFor, installAnonKeyTrap, probeAnonKey } from './anonKey';
import { PrepApi } from './api';
import { DEV_STACK_URLS } from './env';

/**
 * 모든 spec 의 유일한 진입점.
 * spec 은 `@playwright/test` 를 직접 import 하지 않는다. 여기서 test 와 expect 를 가져간다.
 */

interface PocketFixtures {
  /** 이 테스트만의 익명키. 백엔드에서 이 테스트만의 사용자가 된다. */
  anonKey: string;
  /** 콘솔 오류를 하나 눈감아 줄 때 여기에 정규식을 넣는다. 이유를 주석으로 남긴다. */
  consoleErrorAllowList: RegExp[];
  appShell: AppShell;
  home: HomeScreen;
  recordSheet: RecordSheet;
  /** 화면으로 만들 수 없는 사전 조건을 심는다. 브라우저와 같은 익명키를 쓴다. */
  prep: PrepApi;
}

export const test = base.extend<PocketFixtures>({
  anonKey: async ({}, use, testInfo) => {
    await use(anonKeyFor(testInfo));
  },

  consoleErrorAllowList: async ({}, use) => {
    await use([]);
  },

  appShell: async ({ page }, use) => {
    await use(new AppShell(page));
  },

  home: async ({ page }, use) => {
    await use(new HomeScreen(page));
  },

  recordSheet: async ({ page }, use) => {
    await use(new RecordSheet(page));
  },

  prep: async ({ anonKey }, use) => {
    const api = await PrepApi.create(anonKey);
    await use(api);
    await api.dispose();
  },

  // 기본 page 를 감싼다. 격리 트랩 주입과 감시가 모든 테스트에 자동으로 걸린다.
  page: async ({ page, anonKey, consoleErrorAllowList }, use) => {
    await page.addInitScript(installAnonKeyTrap, anonKey);

    const violations: string[] = [];
    const consoleErrors: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    page.on('request', (request) => {
      const url = request.url();

      const devStack = DEV_STACK_URLS.find((origin) => url.startsWith(origin));
      if (devStack) {
        violations.push(`개발 스택(${devStack})으로 요청이 나갔다: ${url}`);
      }

      const sent = request.headers()['x-anon-key'];
      if (sent !== undefined && sent !== anonKey) {
        violations.push(`익명키가 기대값과 다르다. 보낸 값=${sent} 기대값=${anonKey}\n  → ${url}`);
      }
    });

    await use(page);

    if (!page.isClosed()) {
      const probe = await probeAnonKey(page);
      if (probe.navigated && !probe.mockPresent) {
        violations.push(
          'devtools 목 상태(window.__ait)가 없다. 격리 트랩이 걸 자리가 사라졌다.\n' +
            '  @apps-in-toss/devtools 를 올렸다면 e2e/support/anonKey.ts 를 다시 맞춰야 한다.',
        );
      } else if (probe.navigated && probe.key !== anonKey) {
        violations.push(
          `devtools 목의 익명키가 덮이지 않았다. 목이 든 값=${probe.key} 기대값=${anonKey}\n` +
            '  이 상태로 두면 모든 테스트가 백엔드에서 한 사용자로 합쳐진다.',
        );
      }
    }

    expect(violations, `격리 가드가 잡은 것:\n${violations.join('\n')}`).toEqual([]);

    const unexpected = consoleErrors.filter(
      (text) => !consoleErrorAllowList.some((pattern) => pattern.test(text)),
    );
    expect(unexpected, `콘솔 오류:\n${unexpected.join('\n')}`).toEqual([]);
  },
});

export { expect };
