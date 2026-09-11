/**
 * 앱 어디서든 같은 로거 하나를 꺼내 쓴다.
 *
 * 만드는 자리는 `app/providers/AnalyticsProvider.tsx` 다. 브릿지를 아는 쪽이 거기다.
 * 여기에는 꺼내는 방법만 둔다(shared 가 app 을 import 하지 않게).
 */

import { createContext, useContext } from 'react';

import type { Analytics } from './analytics';

export const AnalyticsContext = createContext<Analytics | null>(null);

export function useAnalytics(): Analytics {
  const analytics = useContext(AnalyticsContext);
  if (analytics == null) {
    throw new Error('useAnalytics 는 AnalyticsProvider 안에서만 쓸 수 있어요.');
  }
  return analytics;
}
