import { defineConfig, devices } from '@playwright/test';

import { E2E_WEB_URL } from './e2e/support/env';
import { E2E_SERVERS } from './e2e/support/servers';

/**
 * 화면 동작 영상을 찍는 설정.
 *
 * 검증(playwright.config.ts)과 스택은 같고 목적만 다르다. 여기서 나오는 것은 판정이 아니라 영상이다.
 * 같은 포트를 쓰므로 검증과 동시에 돌릴 수 없다.
 *
 *   npm run demo                     레포 안 demo-videos/ 에 모은다
 *   POCKET_DEMO_OUT=<경로> npm run demo   그 폴더로 내보낸다
 *
 * 장면을 더하는 방법은 e2e/README.md 의 「데모 녹화」 절에 있다.
 */
/**
 * 녹화 화면 크기.
 *
 * Pixel 8 프리셋의 viewport 는 브라우저 UI 를 뺀 값이라 실제 그려지는 높이와 다르다.
 * 영상 크기와 뷰포트가 어긋나면 화면이 캔버스 한쪽에 몰리고 나머지가 회색으로 남는다.
 * 두 값을 여기 하나로 묶어 둔다.
 */
const DEMO_VIEWPORT = { width: 412, height: 839 };

export default defineConfig({
  testDir: './e2e/demo',
  testMatch: '**/*.demo.ts',
  fullyParallel: true,
  // 녹화는 인코딩까지 함께 돈다. 워커를 더 늘리면 프레임이 떨어져 영상이 끊긴다.
  workers: 3,
  // 재시도하면 같은 장면이 두 번 찍히고 뒤엣것이 앞엣것을 덮는다.
  retries: 0,
  reporter: [['list']],
  // 사람이 볼 수 있게 곳곳에서 멈춘다. 검증보다 한 장면이 훨씬 길다.
  timeout: 180_000,
  use: {
    baseURL: E2E_WEB_URL,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    // 뷰포트와 같은 크기로 받는다. 스크린캐스트는 CSS 픽셀 기준이라 이보다 크게 잡으면
    // 확대되는 것이 아니라 남는 자리가 회색으로 채워진다. 선명도는 mp4 로 옮길 때 올린다.
    video: { mode: 'on', size: DEMO_VIEWPORT },
    // 조작이 즉시 끝나면 무엇을 눌렀는지 눈으로 못 쫓는다.
    launchOptions: { slowMo: 220 },
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 8'], viewport: DEMO_VIEWPORT } },
  ],
  webServer: E2E_SERVERS,
});
