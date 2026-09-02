import { useEffect, useState, type ReactNode } from 'react';

import type { SafeAreaInsets } from '../../shared/toss';

import { useBridge } from './bridgeContext';
import { SafeAreaContext, ZERO_INSETS } from './safeAreaContext';

const CSS_VARS = {
  top: '--safe-top',
  right: '--safe-right',
  bottom: '--safe-bottom',
  left: '--safe-left',
} as const;

/**
 * 인셋을 CSS 변수로 내린다. 값이 0이면 변수를 지워서 스타일시트의 env() 기본값이 살아남게 한다.
 * (브라우저에서는 브릿지가 0을 주지만 실제 기기에는 노치가 있을 수 있다)
 */
function applyInsets(insets: SafeAreaInsets): void {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(CSS_VARS)) {
    const value = insets[key as keyof SafeAreaInsets];
    if (value > 0) {
      root.style.setProperty(cssVar, `${value}px`);
    } else {
      root.style.removeProperty(cssVar);
    }
  }
}

export function SafeAreaProvider({ children }: { children: ReactNode }) {
  const bridge = useBridge();
  const [insets, setInsets] = useState<SafeAreaInsets>(ZERO_INSETS);

  useEffect(() => {
    if (!bridge.supports('safeArea')) return;

    const update = (next: SafeAreaInsets) => {
      setInsets(next);
      applyInsets(next);
    };

    try {
      update(bridge.getSafeAreaInsets());
    } catch {
      // 인셋을 못 읽어도 앱은 뜬다. env() 기본값으로 둔다.
    }

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = bridge.subscribeSafeArea(update);
    } catch {
      unsubscribe = undefined;
    }

    return () => {
      unsubscribe?.();
    };
  }, [bridge]);

  return <SafeAreaContext value={insets}>{children}</SafeAreaContext>;
}
