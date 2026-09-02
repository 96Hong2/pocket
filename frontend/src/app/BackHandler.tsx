import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useBridge, useOverlay } from './providers';
import { ROUTES, isTabRoot, parentOf } from './router/routes';

/**
 * 시스템 뒤로가기 한 곳.
 *
 * ⚠ 구독하는 순간 플랫폼 기본 뒤로가기가 막힌다. 그래서 여기서 전부 처리한다.
 * 1. 열린 오버레이가 있으면 그것부터 닫는다.
 * 2. 하위 화면이면 상위 화면으로 간다.
 * 3. 탭 루트면 미니앱을 닫는다.
 */
export function BackHandler() {
  const bridge = useBridge();
  const overlay = useOverlay();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleBack = useCallback(() => {
    if (overlay.closeTop()) return;

    const parent = parentOf(pathname);
    if (parent != null) {
      navigate(parent, { replace: true });
      return;
    }

    if (isTabRoot(pathname)) {
      void bridge.closeApp().catch(() => {
        // 닫기에 실패해도 할 수 있는 게 없다. 화면은 그대로 둔다.
      });
      return;
    }

    // 어디에도 없는 경로. 홈으로 되돌린다.
    navigate(ROUTES.home, { replace: true });
  }, [bridge, navigate, overlay, pathname]);

  const latest = useRef(handleBack);
  useEffect(() => {
    latest.current = handleBack;
  }, [handleBack]);

  useEffect(() => {
    // 네이티브 리스너는 한 번만 붙인다. 화면이 바뀔 때마다 떼었다 붙이지 않는다.
    return bridge.subscribeBackPress(() => latest.current());
  }, [bridge]);

  return null;
}
