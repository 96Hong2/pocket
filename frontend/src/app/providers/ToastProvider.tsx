import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Toast } from '../../shared/ui';

import { useOverlay } from './overlayContext';
import { ToastContext, type ToastOptions } from './toastContext';

const DEFAULT_DURATION_MS = 5_000;
/** 알림과 함께 창을 띄우는 자리가 있다. 이보다 늦게 열린 창만 앞선 알림을 걷는다. */
const SAME_MOMENT_MS = 300;

interface ShownToast extends ToastOptions {
  id: number;
  shownAt: number;
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
  const overlay = useOverlay();
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
      setToast({ ...options, id, shownAt: Date.now() });
      timer.current = setTimeout(() => {
        timer.current = null;
        setToast((current) => (current?.id === id ? null : current));
      }, options.durationMs ?? DEFAULT_DURATION_MS);
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  /*
    **새 창(시트, 고르기 창)이 열리면 앞서 떠 있던 알림을 걷는다.** 창을 연 사람은 이미 다음 일로
    넘어갔다. 남겨 두면 창 안의 줄을 덮는다. 공유 기록을 내 가계부로 옮긴 뒤 가계부 고르기 창을
    열면 「내 가계부」 줄 바로 위에 「되돌리기」 가 겹쳐, 줄을 누른 손가락이 되돌리기를 눌렀다.
    창 안에서 새로 띄운 알림은 그대로 둔다.
  */
  const { onOpen } = overlay;
  useEffect(
    () =>
      onOpen(() => {
        setToast((current) => {
          if (current == null || Date.now() - current.shownAt < SAME_MOMENT_MS) return current;
          clearTimer();
          return null;
        });
      }),
    [onOpen, clearTimer],
  );

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
