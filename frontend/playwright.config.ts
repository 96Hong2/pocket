import { defineConfig, devices } from '@playwright/test';

import {
  E2E_API_PORT,
  E2E_API_URL,
  E2E_DATABASE_URL,
  E2E_WEB_PORT,
  E2E_WEB_URL,
} from './e2e/support/env';

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
  webServer: [
    {
      // 개발 백엔드(8000, DB pocket)를 주워 쓰지 않게 포트와 DB 를 갈라 둔다.
      command: `uv run uvicorn app.main:app --port ${E2E_API_PORT}`,
      cwd: '../backend',
      url: `${E2E_API_URL}/health`,
      env: {
        ENVIRONMENT: 'local',
        ALLOW_UNVERIFIED_ANON_KEY: 'true',
        DATABASE_URL: E2E_DATABASE_URL,
        // 프론트를 5173 이 아닌 포트로 띄우므로 백엔드 기본 허용 목록에서 벗어난다.
        // 소스를 고치지 않고 여기서 넘겨 준다.
        CORS_ORIGINS: E2E_WEB_URL,
      },
      // 기동 실패가 'url 대기 타임아웃' 으로만 보이지 않게 로그를 흘린다.
      stdout: 'pipe',
      stderr: 'pipe',
      // 남의 서버를 주워 쓰지 않는다. 포트가 물려 있으면 여기서 즉시 실패한다.
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // vite.config.ts 의 strictPort 는 살아 있다. CLI 인자가 설정 포트를 덮는다.
      command: `npm run dev -- --port ${E2E_WEB_PORT}`,
      url: E2E_WEB_URL,
      stdout: 'pipe',
      stderr: 'pipe',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
