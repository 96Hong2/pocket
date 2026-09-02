import { createContext, useContext, useEffect, useRef } from 'react';

export interface OverlayContextValue {
  /** 지금 열려 있는 오버레이가 있는지. */
  hasOpen: boolean;
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
 */
export function useOverlayBackClose(isOpen: boolean, onClose: () => void): void {
  const overlay = useOverlay();
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    return overlay.register(() => latest.current());
  }, [isOpen, overlay]);
}
