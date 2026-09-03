import { defineConfig, devices } from '@playwright/test';

import { E2E_WEB_URL } from './e2e/support/env';
import { E2E_SERVERS } from './e2e/support/servers';

// 실기기 SDK 없이 브라우저에서 앱 전체를 돌린다.
// 앱인토스 devtools 플러그인이 목 SDK 를 주입하므로 실기기와 같은 브릿지 코드가 돌고,
// 광고 초기화·부착·해제와 NoFill 분기까지 여기서 확인된다.
//
// ⚠ MockScenario(권한 거부·미지원 등)는 여기서 쓸 수 없다. 그건 우리 MockMiniAppBridge 의 것이고
// e2e 는 devtools 경로를 탄다. 엣지 상태는 vitest 에서 createBridge({forceMock, scenario}) 로 본다.
//
// 규약과 새 spec 을 만드는 순서는 e2e/README.md 에 있다. 먼저 읽는다.
export default defineConfig({
  testDir: './e2e',
  // 데모 녹화는 검증이 아니라 산출물 만들기다. 여기서 같이 돌면 CI 가 영상까지 찍는다.
  testIgnore: '**/demo/**',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: E2E_WEB_URL,
    trace: 'on-first-retry',
    // '오늘' 판정과 금액 표기가 실행 환경 설정에 흔들리면 안 된다.
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },
  // 미니앱은 토스 앱 WebView 안에서 돈다. 데스크탑 폭으로 재면 레이아웃 확인이 거짓이 된다.
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 8'] } }],
  webServer: E2E_SERVERS,
});
