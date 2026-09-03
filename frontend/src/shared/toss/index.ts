import { Environment } from '@apps-in-toss/web-framework';

import { MockMiniAppBridge, type MockScenario } from './mockBridge';
import { TossMiniAppBridge } from './tossBridge';
import type { MiniAppBridge } from './types';

export * from './types';
export { MockMiniAppBridge, type MockScenario } from './mockBridge';
export { TossMiniAppBridge } from './tossBridge';

/**
 * 토스 앱(또는 샌드박스) 안에서 돌고 있는지 본다.
 *
 * `Environment.environment` 는 호스트가 주입한 상수를 읽는다. 일반 브라우저에는 그 값이 없어
 * 던지므로, 'toss' | 'sandbox' 일 때만 실기기로 본다.
 * (구 `getOperationalEnvironment()` 는 3.2.0 에서 deprecated 다)
 * dev 서버에서는 `@apps-in-toss/devtools` 플러그인이 목 SDK 를 주입해 'sandbox' 로 잡힌다.
 */
function isInsideToss(): boolean {
  try {
    const env = Environment.environment;
    return env === 'toss' || env === 'sandbox';
  } catch {
    return false;
  }
}

let cached: MiniAppBridge | null = null;

/**
 * 앱 전체가 쓰는 브릿지 하나를 만든다.
 *
 * 테스트는 `createBridge({ forceMock: true, scenario })` 로 원하는 엣지 상태를 주입한다.
 */
export function createBridge(options?: {
  forceMock?: boolean;
  scenario?: MockScenario;
}): MiniAppBridge {
  if (options?.forceMock) {
    return new MockMiniAppBridge(options.scenario);
  }
  cached ??= isInsideToss() ? new TossMiniAppBridge() : new MockMiniAppBridge();
  return cached;
}

/** 테스트 사이에 캐시를 비운다. */
export function resetBridge(): void {
  cached = null;
}
