import { createContext, useContext } from 'react';

import type { SafeAreaInsets } from '../../shared/toss';

export const ZERO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export const SafeAreaContext = createContext<SafeAreaInsets>(ZERO_INSETS);

/**
 * 인셋 픽셀 값이 필요할 때만 쓴다.
 * 레이아웃은 대부분 CSS 변수(--safe-top 등)로 처리하는 쪽이 다시 그리지 않아 낫다.
 */
export function useSafeArea(): SafeAreaInsets {
  return useContext(SafeAreaContext);
}
