import aitDevtools from '@apps-in-toss/devtools/unplugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// devtools 를 끄는 조건.
// - 유닛 테스트(VITEST): jsdom 에서 오버레이가 스스로 터진다.
// - POCKET_DISABLE_AIT_DEVTOOLS: 손으로 켜는 스위치. 브라우저에서 우리 MockMiniAppBridge 로
//   돌려 보고 싶을 때만 쓴다. 평소 dev·e2e 는 devtools 목 SDK 를 쓰므로 실기기와 같은
//   브릿지 코드(TossMiniAppBridge)가 돈다.
const disableDevtools =
  process.env.VITEST === 'true' || process.env.POCKET_DISABLE_AIT_DEVTOOLS === '1';

// https://vite.dev/config/
export default defineConfig({
  plugins: [...(disableDevtools ? [] : [aitDevtools.vite()]), react(), tailwindcss()],
  // 포트가 밀리면 백엔드 CORS 허용 목록(localhost:5173)에서 벗어나 API 가 전부 막힌다.
  // 조용히 다른 포트로 가는 대신 즉시 실패하게 둔다.
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // 유닛 테스트는 tests/ 와 src/ 양쪽에서 찾는다. e2e/ 는 Playwright 몫이라 뺀다.
    include: ['tests/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
    css: false,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/main.tsx'],
    },
  },
});
