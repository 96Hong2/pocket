import type { ReactNode } from 'react';

import type { MiniAppBridge } from '../../shared/toss';

import { ApiProvider } from './ApiProvider';
import { BridgeProvider } from './BridgeProvider';
import { IdentityProvider } from './IdentityProvider';
import { OverlayProvider } from './OverlayProvider';
import { QueryProvider } from './QueryProvider';
import { SafeAreaProvider } from './SafeAreaProvider';

interface AppProvidersProps {
  children: ReactNode;
  /** 테스트에서 목 브릿지를 주입한다. */
  bridge?: MiniAppBridge;
}

/**
 * 브릿지가 가장 바깥이다. 나머지 프로바이더가 전부 브릿지를 쓴다.
 * ApiProvider 는 IdentityProvider 안이다. 익명 식별키를 읽어야 클라이언트를 만들 수 있다.
 */
export function AppProviders({ children, bridge }: AppProvidersProps) {
  return (
    <BridgeProvider bridge={bridge}>
      <QueryProvider>
        <SafeAreaProvider>
          <IdentityProvider>
            <ApiProvider>
              <OverlayProvider>{children}</OverlayProvider>
            </ApiProvider>
          </IdentityProvider>
        </SafeAreaProvider>
      </QueryProvider>
    </BridgeProvider>
  );
}
