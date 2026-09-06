import { defineConfig, devices } from '@playwright/test';

import { E2E_WEB_URL } from './e2e/support/env';
import { E2E_SERVERS } from './e2e/support/servers';

/**
 * 엣지케이스 스위트.
 *
 * `playwright.config.ts` 가 지키는 것은 "이 기능이 된다" 이고, 여기가 지키는 것은
 * **"몰릴 때·비었을 때·틀렸을 때 무엇이 되나"** 다. 출시 전과 무엇을 크게 고친 뒤에 돌린다.
 *
 *   npm run e2e:edge
 *
 * ## 왜 갈라 뒀나
 *
 * 매번 돌리지 않기 때문이다. 이쪽은 경계값·실패 주입·긴 목록이 많아 검증 한 바퀴가 길고,
 * 고장이 나도 "지금 만든 것이 깨졌다" 가 아니라 "원래 이랬다" 인 경우가 많다.
 * 기본 검증에 섞으면 매 회차가 느려지고, 느려지면 결국 아무도 안 돌린다.
 *
 * 스택과 화면 객체와 규약은 기본 검증과 **같은 것**을 쓴다. 갈라진 것은 언제 돌리냐뿐이다.
 * 포트가 하나뿐이라 기본 검증·데모 녹화와 동시에 돌릴 수 없다.
 */
export default defineConfig({
  testDir: './e2e/edge',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  // 실패를 주입하는 테스트가 많다. 재시도로 넘어가면 진짜 불안정한 자리를 못 본다.
  retries: 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-edge' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-edge' }]],
  use: {
    baseURL: E2E_WEB_URL,
    trace: 'retain-on-failure',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 8'] } }],
  webServer: E2E_SERVERS,
});
