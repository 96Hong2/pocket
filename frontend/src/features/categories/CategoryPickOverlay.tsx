import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useOverlayBackClose } from '../../app/providers';
import type { CategoryOut } from '../../shared/api';
import { CategoryPicker } from '../../shared/ledger';
import { cx } from '../../shared/lib/cx';
import { SheetHeader } from '../../shared/ui';
import { trapTab } from '../../shared/ui/focusTrap';
import { useDragToDismiss } from '../../shared/ui/useDragToDismiss';

export interface CategoryPickOverlayProps {
  open: boolean;
  /** 고를 수 있는 분류. 고치기 시트의 분류 칸과 같은 목록을 넘긴다. */
  categories: CategoryOut[];
  selectedId: string | null;
  onPick: (category: CategoryOut) => void;
  /** 「새 분류」. 안 넘기면 그 칸이 없다. */
  onCreate?: () => void;
  /** 토스 ‹, 폰 뒤로가기, Esc, 아래로 미는 손짓. 고르지 않고 돌아간다. 창 안에 뒤로 버튼은 없다. */
  onBack: () => void;
}

/**
 * 기록 고치기 맨 위 그림을 눌러 여는 분류 고르기. 화면을 덮는 한 장이다.
 *
 * 고치기 시트의 분류 칸은 칸이 많은 시트 맨 아래라 작은 화면에서는 굴려야 나온다.
 * 그림을 누르면 전부 펼친 목록이 바로 서고, 하나 고르면 시트로 돌아간다.
 * 뒤로 새는 길은 `CategoryComposeOverlay` 와 같은 방법으로 막는다(캡처 단계 Esc, 화면 끝까지 가는 바탕).
 */
export function CategoryPickOverlay({
  open,
  categories,
  selectedId,
  onPick,
  onCreate,
  onBack,
}: CategoryPickOverlayProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  // 부르는 쪽이 인라인 함수를 넘겨도 아래 효과가 다시 돌아 포커스를 옮기지 않게 칸에 둔다.
  const backRef = useRef(onBack);
  useEffect(() => {
    backRef.current = onBack;
  });

  useOverlayBackClose(open, onBack);

  const dismiss = useDragToDismiss({ boxRef, active: open, enabled: open, onDismiss: onBack });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // 고른 칩에 손이 먼저 가게 한다. 없으면 첫 칩이다.
    const box = boxRef.current;
    const first =
      box?.querySelector<HTMLElement>('button[aria-pressed="true"]') ??
      box?.querySelector<HTMLElement>('button');
    first?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        // 뒤의 시트도 같은 document 에서 Esc 를 듣는다. 캡처에서 삼켜야 한 겹만 접힌다.
        event.preventDefault();
        event.stopImmediatePropagation();
        backRef.current();
        return;
      }
      if (event.key !== 'Tab' || !boxRef.current) return;
      trapTab(boxRef.current, event);
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={cx('cat-pick', dismiss.dragging && 'cat-pick--dragging')}
      role="dialog"
      aria-modal="true"
      aria-label="카테고리 바꾸기"
      ref={boxRef}
      style={dismiss.offset > 0 ? { transform: `translateY(${dismiss.offset}px)` } : undefined}
      onClickCapture={dismiss.onClickCapture}
      {...dismiss.handlers}
    >
      <SheetHeader title="카테고리 바꾸기" />
      <CategoryPicker
        ariaLabel="카테고리 고르기"
        categories={categories}
        selectedId={selectedId}
        onPick={onPick}
        onCreate={onCreate}
        manageNote={false}
        expanded
      />
    </div>,
    document.body,
  );
}
