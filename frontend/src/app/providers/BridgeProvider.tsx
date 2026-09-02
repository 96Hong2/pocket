import { useMemo, type ReactNode } from 'react';

import { createBridge, type MiniAppBridge } from '../../shared/toss';

import { BridgeContext } from './bridgeContext';

interface BridgeProviderProps {
  children: ReactNode;
  /** 테스트·스토리에서 목 브릿지를 밀어 넣을 때만 쓴다. */
  bridge?: MiniAppBridge;
}

export function BridgeProvider({ children, bridge }: BridgeProviderProps) {
  // createBridge 는 내부적으로 한 번만 만들고 캐시한다.
  const value = useMemo(() => bridge ?? createBridge(), [bridge]);

  return <BridgeContext value={value}>{children}</BridgeContext>;
}
