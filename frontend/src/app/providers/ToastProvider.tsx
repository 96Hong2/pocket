import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Toast } from '../../shared/ui';

import { ToastContext, type ToastOptions } from './toastContext';

const DEFAULT_DURATION_MS = 5_000;

interface ShownToast extends ToastOptions {
  id: number;
}

/**
 * 한 줄 알림을 앱에 하나만 둔다.
 *
 * 화면마다 알림을 들고 있으면 지우고 곧바로 화면을 옮길 때(가계부 지우기 → 목록) 알림이
 * 떠난 화면과 함께 사라진다. 여기 두면 화면을 옮겨도 남는다.
 *
 * 새 알림은 앞 알림을 바로 갈아 끼운다. 줄을 세우면 「지웠어요」 가 사라지기 전에
 * 다음 일을 한 사람이 엉뚱한 되돌리기를 누른다.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ShownToast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const clearTimer = useCallback(() => {
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const show = useCallback(
    (options: ToastOptions) => {
      clearTimer();
      seq.current += 1;
      const id = seq.current;
      setToast({ ...options, id });
      timer.current = setTimeout(() => {
        timer.current = null;
        setToast((current) => (current?.id === id ? null : current));
      }, options.durationMs ?? DEFAULT_DURATION_MS);
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo(() => ({ show, hide }), [show, hide]);
  const action = toast?.onAction;

  return (
    <ToastContext value={value}>
      {children}
      {toast != null ? (
        <Toast
          // 갈아 끼울 때마다 다시 그려 떠오르는 모습이 한 번 더 보이게 한다.
          key={toast.id}
          text={toast.text}
          actionLabel={toast.actionLabel}
          onAction={
            action == null
              ? undefined
              : () => {
                  // 먼저 걷는다. 두 번 눌러 되돌리기가 두 번 나가지 않게 한다.
                  hide();
                  action();
                }
          }
        />
      ) : null}
    </ToastContext>
  );
}
