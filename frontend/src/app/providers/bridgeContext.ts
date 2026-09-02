import { createContext, useContext } from 'react';

import type { MiniAppBridge } from '../../shared/toss';

export const BridgeContext = createContext<MiniAppBridge | null>(null);

/** 앱 어디서든 같은 브릿지 하나를 꺼내 쓴다. 화면은 SDK 를 직접 부르지 않는다. */
export function useBridge(): MiniAppBridge {
  const bridge = useContext(BridgeContext);
  if (bridge == null) {
    throw new Error('useBridge 는 BridgeProvider 안에서만 쓸 수 있어요.');
  }
  return bridge;
}
