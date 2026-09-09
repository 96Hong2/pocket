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

/**
 * 위쪽 인셋을 뗀다.
 *
 * 브릿지가 주는 것은 **기기의** 인셋(노치 높이)인데, 우리 웹뷰는 플랫폼이 그리는 상단바
 * 아래에서 시작한다(`apps-in-toss.config.ts` 의 `navigationBar.withTitle`). 그 자리는 이미
 * 상단바가 먹었으므로 다시 더하면 화면마다 노치 높이만큼 빈 띠가 생긴다.
 * 실기기에서 제목 위가 80px 가까이 비어 보인 원인이 이것이다.
 *
 * 상단바를 끄게 되면 이 함수를 지우고 값을 그대로 내려보내면 된다.
 */
function withoutTopInset(insets: SafeAreaInsets): SafeAreaInsets {
  return { ...insets, top: 0 };
}

export function SafeAreaProvider({ children }: { children: ReactNode }) {
  const bridge = useBridge();
  const [insets, setInsets] = useState<SafeAreaInsets>(ZERO_INSETS);

  useEffect(() => {
    if (!bridge.supports('safeArea')) return;

    const update = (raw: SafeAreaInsets) => {
      const next = withoutTopInset(raw);
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
