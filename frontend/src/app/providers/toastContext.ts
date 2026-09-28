import { createContext, useContext } from 'react';

export interface ToastOptions {
  text: string;
  /** 「되돌리기」 처럼 알림 안에서 바로 할 일. */
  actionLabel?: string;
  onAction?: () => void;
  /** 떠 있는 시간. 기본 5초. */
  durationMs?: number;
}

export interface ToastContextValue {
  /** 한 줄 알림을 띄운다. 떠 있던 것은 바로 갈아 끼운다. */
  show(options: ToastOptions): void;
  /** 떠 있는 알림을 걷는다. 없으면 아무 일도 안 한다. */
  hide(): void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (value == null) {
    throw new Error('useToast 는 ToastProvider 안에서만 쓸 수 있어요.');
  }
  return value;
}
