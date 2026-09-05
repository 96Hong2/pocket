import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cx } from '../lib/cx';

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** 딤·Esc·닫기 버튼으로 닫을 수 있는지. 저장 중처럼 닫히면 안 될 때만 false. */
  dismissible?: boolean;
  showHandle?: boolean;
  showCloseButton?: boolean;
  /** 제목이 없을 때 스크린리더가 읽을 이름. */
  ariaLabel?: string;
  className?: string;
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  dismissible = true,
  showHandle = true,
  showCloseButton = true,
  ariaLabel,
  className,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !sheetRef.current) return;

      // 시트 밖으로 포커스가 새지 않게 앞뒤를 이어 붙인다.
      // 감춘 탭도 DOM 에 남으므로 화면에 없는 것은 뺀다. 안 빼면 첫·끝이 안 보이는 버튼이 되어
      // Tab 이 시트 밖으로 샌다.
      const targets = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        isOnScreen,
      );
      if (targets.length === 0) {
        event.preventDefault();
        sheetRef.current.focus();
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="pk-sheet-root">
      <div className="pk-sheet-dim" onClick={dismissible ? onClose : undefined} />
      <div
        ref={sheetRef}
        className={cx('pk-sheet', className)}
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : ariaLabel}
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {showHandle ? <div className="pk-sheet__handle" /> : null}
        {title || (showCloseButton && dismissible) ? (
          <div className="pk-sheet__header">
            <div className="pk-sheet__title" id={titleId}>
              {title}
            </div>
            {showCloseButton && dismissible ? (
              <button type="button" className="pk-sheet__close" onClick={onClose} aria-label="닫기">
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path
                    d="M4 4l10 10M14 4L4 14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="pk-sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * 화면에 실제로 그려진 요소인지.
 *
 * `checkVisibility()` 가 없는 웹뷰가 있다. 그대로 부르면 Tab 처리가 통째로 죽어 포커스가
 * 시트 밖으로 샌다. 없으면 그린 자리가 있는지로 본다. 감춘 탭은 display:none 이라 자리가 없다.
 */
function isOnScreen(element: HTMLElement): boolean {
  return element.checkVisibility?.() ?? element.getClientRects().length > 0;
}
