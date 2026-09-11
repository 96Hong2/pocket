import { useMemo, type ReactNode } from 'react';

import { Analytics, AnalyticsContext } from '../../shared/analytics';

import { useBridge } from './bridgeContext';

/**
 * 로거를 앱에 하나 놓는다.
 *
 * 세션 id 가 이 인스턴스에 붙어 있어, 다시 만들면 한 번 연 앱이 두 세션으로 세어진다.
 * 브릿지가 바뀔 때만 새로 만든다(테스트에서 목을 갈아 끼우는 경우다).
 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const bridge = useBridge();
  const analytics = useMemo(() => new Analytics(bridge), [bridge]);

  return <AnalyticsContext value={analytics}>{children}</AnalyticsContext>;
}
