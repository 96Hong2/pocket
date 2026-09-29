import { createContext, useContext, useEffect, useRef } from 'react';

export interface OverlayContextValue {
  /** 지금 열려 있는 오버레이가 있는지. */
  hasOpen: boolean;
  /**
   * 오버레이가 열릴 때마다 부른다. 앞서 떠 있던 알림을 걷는 데 쓴다. 반환값을 부르면 풀린다.
   * 값으로 두지 않는다. 값이 바뀌면 열린 오버레이가 모두 다시 등록되어 끝없이 돈다.
   */
  onOpen(listener: () => void): () => void;
  /** 가장 나중에 열린 오버레이를 닫는다. 닫을 게 없으면 false. */
  closeTop(): boolean;
  /** 오버레이가 열릴 때 자기 닫기 함수를 맡긴다. 반환값을 부르면 등록이 풀린다. */
  register(close: () => void): () => void;
}

export const OverlayContext = createContext<OverlayContextValue | null>(null);

export function useOverlay(): OverlayContextValue {
  const value = useContext(OverlayContext);
  if (value == null) {
    throw new Error('useOverlay 는 OverlayProvider 안에서만 쓸 수 있어요.');
  }
  return value;
}

/**
 * 시트·모달이 열려 있는 동안 뒤로가기를 자기 닫기로 가져간다.
 * 바텀시트 컴포넌트가 이 훅 하나만 부르면 뒤로가기 처리가 끝난다.
 *
 * `locked` 는 저장·분석이 도는 중처럼 닫으면 안 되는 상태다. 이때도 **등록은 유지하고**
 * 뒤로가기를 삼키기만 한다. 등록을 풀면 스택이 비어 뒤로가기가 미니앱을 통째로 닫는다.
 */
export function useOverlayBackClose(isOpen: boolean, onClose: () => void, locked = false): void {
  const overlay = useOverlay();
  const latest = useRef(onClose);
  latest.current = onClose;
  const isLocked = useRef(locked);
  isLocked.current = locked;

  useEffect(() => {
    if (!isOpen) return;
    return overlay.register(() => {
      if (isLocked.current) return;
      latest.current();
    });
  }, [isOpen, overlay]);
}
