import { test as base, expect } from '@playwright/test';

import { AccountScreen } from '../screens/AccountScreen';
import { AppShell } from '../screens/AppShell';
import { AssetsScreen } from '../screens/AssetsScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { CategoriesScreen } from '../screens/CategoriesScreen';
import { GoalScreen } from '../screens/GoalScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ManageScreen } from '../screens/ManageScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { ReportScreen } from '../screens/ReportScreen';
import { RecordSheet } from '../screens/RecordSheet';
import { SettingsScreen } from '../screens/SettingsScreen';

import { installShareSheetStub } from './aitMock';
import { anonKeyFor, installAnonKeyTrap, probeAnonKey } from './anonKey';
import { PrepApi } from './api';
import { DEV_STACK_URLS, FONT_CDN } from './env';

/**
 * 모든 spec 의 유일한 진입점.
 * spec 은 `@playwright/test` 를 직접 import 하지 않는다. 여기서 test 와 expect 를 가져간다.
 */

interface PocketFixtures {
  /** 이 테스트만의 익명키. 백엔드에서 이 테스트만의 사용자가 된다. */
  anonKey: string;
  /** 콘솔 오류를 하나 눈감아 줄 때 여기에 정규식을 넣는다. 이유를 주석으로 남긴다. */
  consoleErrorAllowList: RegExp[];
  /**
   * 처음 안내를 띄운 채로 연다.
   *
   * 기본은 꺼져 있다. 안 그러면 모든 spec 이 첫 화면에서 그 오버레이에 막힌다.
   * 안내 자체를 확인하는 spec 에서만 `test.use({ showOnboarding: true })` 로 켠다.
   */
  showOnboarding: boolean;
  appShell: AppShell;
  /** 내 계정. 앱 설정 아래 하위 화면이라 URL 이 달라 별도 화면이다. */
  account: AccountScreen;
  home: HomeScreen;
  recordSheet: RecordSheet;
  /** 월간 달력. 달력·선택한 날 목록·검색·수정 시트를 한 화면이 가진다. */
  calendar: CalendarScreen;
  /** 관리 탭. 예산 카드·카테고리 예산·이어쓰기 배너·설정을 한 화면이 가진다. */
  manage: ManageScreen;
  /** 리포트 탭. 총액·도넛·조각 목록·6개월 흐름을 한 화면이 가진다. */
  report: ReportScreen;
  /** 카테고리 관리. 관리 탭 아래 하위 화면이라 URL 이 달라 별도 화면이다. */
  categories: CategoriesScreen;
  /** 앱 설정. 홈 표시 방식과 개인정보 안내를 한 화면이 가진다. */
  settings: SettingsScreen;
  /** 알림 설정. 앱 설정 아래 하위 화면이라 URL 이 달라 별도 화면이다. */
  notifications: NotificationsScreen;
  /** 자산. 관리 탭 아래 하위 화면이라 URL 이 달라 별도 화면이다. */
  assets: AssetsScreen;
  /** 목표. 관리 탭 아래 하위 화면이라 URL 이 달라 별도 화면이다. */
  goal: GoalScreen;
  /** 처음 안내. `showOnboarding` 을 켠 spec 에서만 실제로 뜬다. */
  onboarding: OnboardingScreen;
  /** 확인하려는 동작의 배경 상태를 심는다. 브라우저와 같은 익명키를 쓴다. */
  prep: PrepApi;
}

export const test = base.extend<PocketFixtures>({
  anonKey: async ({}, use, testInfo) => {
    await use(anonKeyFor(testInfo));
  },

  consoleErrorAllowList: async ({}, use) => {
    await use([]);
  },

  showOnboarding: [false, { option: true }],

  appShell: async ({ page }, use) => {
    await use(new AppShell(page));
  },

  account: async ({ page }, use) => {
    await use(new AccountScreen(page));
  },

  home: async ({ page }, use) => {
    await use(new HomeScreen(page));
  },

  recordSheet: async ({ page }, use) => {
    await use(new RecordSheet(page));
  },

  calendar: async ({ page }, use) => {
    await use(new CalendarScreen(page));
  },

  manage: async ({ page }, use) => {
    await use(new ManageScreen(page));
  },

  report: async ({ page }, use) => {
    await use(new ReportScreen(page));
  },

  categories: async ({ page }, use) => {
    await use(new CategoriesScreen(page));
  },

  settings: async ({ page }, use) => {
    await use(new SettingsScreen(page));
  },

  notifications: async ({ page }, use) => {
    await use(new NotificationsScreen(page));
  },

  assets: async ({ page }, use) => {
    await use(new AssetsScreen(page));
  },

  goal: async ({ page }, use) => {
    await use(new GoalScreen(page));
  },

  onboarding: async ({ page }, use) => {
    await use(new OnboardingScreen(page));
  },

  prep: async ({ anonKey }, use) => {
    const api = await PrepApi.create(anonKey);
    await use(api);
    await api.dispose();
  },

  // 기본 page 를 감싼다. 격리 트랩 주입과 감시가 모든 테스트에 자동으로 걸린다.
  page: async ({ page, anonKey, consoleErrorAllowList, showOnboarding }, use) => {
    await page.addInitScript(installAnonKeyTrap, anonKey);
    // 공유 시트는 웹 페이지 바깥에서 뜬다. 놔두면 실행 환경에 따라 진짜 OS 창이 떠서 멈춘다.
    await page.addInitScript(installShareSheetStub);
    await page.addInitScript(silenceHomeAddPrompt);
    if (!showOnboarding) await page.addInitScript(silenceOnboarding);

    const violations: string[] = [];
    const consoleErrors: string[] = [];

    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      // 글꼴만 예외다. 비차단으로 받고 못 받아도 폴백 스택으로 읽힌다(frontend/index.html).
      // 주소로 가르므로 우리 자원이 실패하면 같은 문구여도 그대로 터진다.
      if (FONT_CDN.test(message.location().url)) return;
      consoleErrors.push(message.text());
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

/**
 * 홈 화면 추가 안내를 「이미 봤다」 로 두고 시작한다.
 *
 * 이 안내는 첫 기록을 마치는 순간 스스로 열린다. 실제 동작이 그렇지만, 기록으로 시작하는
 * 다른 테스트에서는 그 시트가 다음 조작을 가로막는다(예산·달력·리포트 아홉 건이 그렇게 깨졌다).
 * 안내 자체는 `specs/home-add.spec.ts` 가 이 표시를 지우고 확인한다.
 *
 * 토스 devtools 목 SDK 의 저장소는 `__ait_storage:` 접두사를 붙인 localStorage 다.
 */
function silenceHomeAddPrompt(): void {
  /*
    init script 는 about:blank 처럼 저장소를 못 여는 문서에서도 돈다.
    거기서 던지면 그 오류가 콘솔 감시에 잡혀 관계없는 테스트가 깨진다(플랫폼 엣지 넷이 그랬다).
  */
  try {
    window.localStorage.setItem('__ait_storage:home-add-prompted', '1');
    // 몇 번 적고 나면 한 번 더 뜬다. 세 건씩 심는 spec 한가운데서 시트가 끼어들지 않게 함께 막는다.
    window.localStorage.setItem('__ait_storage:home-add-prompted-again', '1');
  } catch {
    /* 저장소를 못 여는 문서에서는 이 앱이 돌지 않는다. */
  }
}

/**
 * 처음 안내를 이미 본 것으로 둔다.
 *
 * 안 두면 **모든 spec 이** 첫 화면에서 이 오버레이에 막힌다. 안내 자체를 확인하는 spec 만
 * `showOnboarding` 픽스처로 이 표시를 걷어 낸다.
 */
function silenceOnboarding(): void {
  try {
    window.localStorage.setItem('__ait_storage:onboarding-seen', '1');
  } catch {
    /* 저장소를 못 여는 문서에서는 이 앱이 돌지 않는다. */
  }
}
