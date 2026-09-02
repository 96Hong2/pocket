import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

import { OverlayContext } from './overlayContext';

/**
 * 열려 있는 오버레이(바텀시트·전체화면 확인) 스택을 한 곳에서 센다.
 * 뒤로가기가 화면을 옮기기 전에 이 스택부터 비운다.
 */
export function OverlayProvider({ children }: { children: ReactNode }) {
  const stack = useRef<Array<() => void>>([]);
  const [hasOpen, setHasOpen] = useState(false);

  const sync = useCallback(() => {
    setHasOpen(stack.current.length > 0);
  }, []);

  const register = useCallback(
    (close: () => void) => {
      stack.current = [...stack.current, close];
      sync();
      return () => {
        stack.current = stack.current.filter((item) => item !== close);
        sync();
      };
    },
    [sync],
  );

  const closeTop = useCallback(() => {
    const top = stack.current.at(-1);
    if (top == null) return false;
    top();
    // 스택에서 빼는 것은 오버레이가 실제로 닫히며 register 해제로 처리한다.
    return true;
  }, []);

  const value = useMemo(
    () => ({ hasOpen, closeTop, register }),
    [hasOpen, closeTop, register],
  );

  return <OverlayContext value={value}>{children}</OverlayContext>;
}
