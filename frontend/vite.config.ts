import aitDevtools from '@apps-in-toss/devtools/unplugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// devtools 오버레이를 끄는 조건.
// - 유닛 테스트: jsdom 에서 오버레이가 스스로 터진다.
// - e2e: 오버레이가 목 SDK 를 주입해 브릿지가 실기기 경로로 잡힌다. 브라우저 스모크는 목 브릿지로 돌린다.
const disableDevtools =
  process.env.VITEST === 'true' || process.env.POCKET_DISABLE_AIT_DEVTOOLS === '1';

// https://vite.dev/config/
export default defineConfig({
  plugins: [...(disableDevtools ? [] : [aitDevtools.vite()]), react(), tailwindcss()],
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
