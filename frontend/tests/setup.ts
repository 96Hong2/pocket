import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { resetBridge } from '../src/shared/toss';

// 테스트끼리 DOM 과 브릿지 캐시를 물려받지 않게 매번 비운다.
afterEach(() => {
  cleanup();
  resetBridge();
});
