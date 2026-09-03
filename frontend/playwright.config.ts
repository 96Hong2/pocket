import { defineConfig, devices } from '@playwright/test';

// 실기기 SDK 없이 브라우저에서 앱 전체를 돌린다.
// 앱인토스 devtools 플러그인이 목 SDK 를 주입하므로 실기기와 같은 브릿지 코드가 돌고,
// 광고 초기화·부착·해제와 NoFill 분기까지 여기서 확인된다.
//
// ⚠ MockScenario(권한 거부·미지원 등)는 여기서 쓸 수 없다. 그건 우리 MockMiniAppBridge 의 것이고
// e2e 는 devtools 경로를 탄다. 엣지 상태는 vitest 에서 createBridge({forceMock, scenario}) 로 본다.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
