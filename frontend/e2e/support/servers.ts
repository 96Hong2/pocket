import type { PlaywrightTestConfig } from '@playwright/test';

import { E2E_API_PORT, E2E_API_URL, E2E_DATABASE_URL, E2E_WEB_PORT, E2E_WEB_URL } from './env';

/**
 * e2e 스택을 띄우는 방법 한 곳.
 *
 * 검증(playwright.config.ts)과 데모 녹화(playwright.demo.config.ts)가 같은 스택을 쓴다.
 * 두 곳에 같은 명령을 적어 두면 한쪽만 고쳐져 "데모는 되는데 CI 는 깨지는" 상태가 된다.
 *
 * 포트가 하나뿐이라 둘을 동시에 돌릴 수는 없다. 검증이 돌고 있으면 녹화는 기다린다.
 */
export const E2E_SERVERS: PlaywrightTestConfig['webServer'] = [
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
      // 자동 이어쓰기를 화면으로 보려면 지난달 예산이 이미 있어야 하는데, 끝난 기간의 쓰기를
      // 제품 규칙이 막아 둔다. 시간을 앞당길 수 없어 그 상태를 만들 길이 이것뿐이다.
      // 잠금 자체(422)는 이 스위치가 꺼진 백엔드 API 테스트가 지킨다. 자세한 배경은 docs/SECRETS.md §3.1.
      ALLOW_PAST_PERIOD_BUDGET_WRITE: 'true',
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
    // 이 줄이 없으면 프론트가 개발 백엔드(8000)를 찌르고 fixtures 의 개발 스택 가드가 잡는다.
    env: { VITE_API_BASE_URL: E2E_API_URL },
    stdout: 'pipe',
    stderr: 'pipe',
    reuseExistingServer: false,
    timeout: 60_000,
  },
];
