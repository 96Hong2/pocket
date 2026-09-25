import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { cx } from '../lib/cx';

import { trapTab } from './focusTrap';
import {
  AT_REST,
  beginTracking,
  canStartDrag,
  isHandle,
  shouldDismiss,
  trackMove,
  type DragState,
  type Tracker,
} from './sheetDrag';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** 딤·Esc·손잡이로 닫을 수 있는지. 저장 중처럼 닫히면 안 될 때만 false. */
  dismissible?: boolean;
  /**
   * 시트 높이.
   *
   * - `auto`  내용만큼. 짧은 시트의 기본이다.
   * - `tall`  화면 위쪽까지 늘 같은 높이로 연다. **고칠 것이 많은 시트에 쓴다.**
   *
   * 내용만큼 여는 시트에서 칸이 여럿이면, 화면에 보이는 자리가 손바닥만 해서 아래 저장
   * 버튼이 접힌 아래로 밀린다. 그 버튼을 못 찾아 고치다 만 사람이 실제로 있었다.
   */
  size?: 'auto' | 'tall';
  /** 제목이 없을 때 스크린리더가 읽을 이름. */
  ariaLabel?: string;
  className?: string;
}

/**
 * 바텀시트.
 *
 * **닫기 X 를 두지 않는다.** 손잡이를 누르거나 아래로 밀면 닫힌다. 딤·Esc·시스템 뒤로가기도
 * 그대로다. 오른쪽 위 X 는 토스가 그리는 미니앱 닫기 버튼과 같은 자리·같은 모양이라,
 * 시트를 닫으려다 앱을 닫는 일이 실기기에서 실제로 있었다.
 *
 * 손잡이가 곧 닫기 버튼이다. 별도의 버튼을 두면 화면에 닫는 자리가 둘이 되고,
 * 키보드·스크린리더에는 손잡이가 잡히지 않아 닫을 길이 없어진다.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  dismissible = true,
  size = 'auto',
  ariaLabel,
  className,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const trackerRef = useRef<Tracker | null>(null);
  /** 끌고 나서 손을 뗀 자리에서 클릭이 한 번 더 온다. 되돌아온 시트를 그것으로 닫지 않는다. */
  const swallowClick = useRef(false);
  /*
    지금 내려와 있는 거리. **상태가 아니라 여기를 보고 닫을지 정한다.**

    예전에는 손을 뗄 때 `drag.offset` 을 읽었는데, 그것은 마지막으로 **그려진** 값이다.
    빠르게 쓸어내리면 마지막 몇 번의 움직임이 아직 안 그려진 채로 pointerup 이 와서,
    160px 을 내렸는데도 30px 로 읽혀 시트가 안 닫혔다. 시트가 길수록(그릴 것이 많을수록)
    자주 났다. 화면에 보여 줄 값과 판단에 쓸 값을 갈라 둔다.
  */
  const offsetRef = useRef(0);
  /*
    마지막으로 무언가 굴러간 시각.

    🔴 **두 번 신고된 자리다.** 되올리는 손짓은 여러 번 튕기고, 그 사이에 맨 위(0)에
    닿는다. 위치만 보면 닿은 다음 한 번이 닫기로 읽힌다. 굴리기가 가라앉았는지를 함께
    봐야 사람이 「같은 손짓을 이어서 하는 중」 인지 가를 수 있다.

    `scroll` 은 거품을 안 타서 캡처 단계로 듣는다. 그래야 시트 안쪽에서 자기만 굴러가는
    상자(`.tx-edit__scroll` · 아이콘 격자)의 것까지 한 자리에서 받는다.
  */
  const lastScrollAt = useRef(Number.NEGATIVE_INFINITY);
  const [drag, setDrag] = useState<DragState>(AT_REST);
  const titleId = useId();

  /*
    리스너가 **늘 지금 값을 본다.**

    예전에는 `onClose` 와 `dismissible` 을 효과의 deps 에 넣었다. 둘 다 그릴 때마다 새로
    만들어지는 값이라 효과가 매번 다시 돌았고, 그때마다 시트가 포커스를 도로 가져갔다
    (분류 만들기에서 이름 칸의 자판이 내려간 원인이 이것이었다).

    deps 에서 빼면 이번에는 리스너가 **처음 그릴 때의 함수**를 쥔 채로 남는다. 줄글을
    적자마자 Esc 를 누르면 「적어 둔 것이 있다」 를 모르던 그 함수가 돌아 확인 없이 닫혔다.
    ref 로 넘기면 둘 다 안 난다. 리스너는 한 번만 달고, 부르는 값은 늘 최신이다.
  */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && dismissibleRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !sheetRef.current) return;
      // 시트 밖으로 포커스가 새지 않게 앞뒤를 이어 붙인다. 규칙은 오버레이와 한 곳에 있다.
      trapTab(sheetRef.current, event);
    }

    function onScroll(): void {
      lastScrollAt.current = performance.now();
      // 끌던 중에 무언가 굴렀으면 그 손짓은 끌기가 아니었다. 되돌린다.
      if (trackerRef.current == null) return;
      trackerRef.current = null;
      offsetRef.current = 0;
      setDrag(AT_REST);
    }

    const sheet = sheetRef.current;
    document.addEventListener('keydown', onKeyDown);
    sheet?.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      sheet?.removeEventListener('scroll', onScroll, true);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  // 끄는 동안에는 시트 안의 어떤 버튼도 눌리지 않으므로, 끌던 중에 저장이 시작될 수 없다.
  // 그래서 `dismissible` 이 꺼지는 순간을 따로 되돌릴 필요가 없다.
  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (!dismissible || trackerRef.current != null) return;
    const sheet = sheetRef.current;
    if (sheet == null) return;
    if (!canStartDrag(event.target, sheet, performance.now() - lastScrollAt.current)) return;
    trackerRef.current = beginTracking(
      event.pointerId,
      event.clientX,
      event.clientY,
      event.timeStamp,
      isHandle(event.target),
    );
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const tracker = trackerRef.current;
    if (tracker == null || tracker.pointerId !== event.pointerId) return;

    const next = trackMove(tracker, event.clientX, event.clientY);
    if (next == null) {
      trackerRef.current = null;
      offsetRef.current = 0;
      setDrag(AT_REST);
      return;
    }
    if (next.dragging) {
      // 끌기로 확정된 뒤에는 포인터를 붙잡는다. 손가락이 시트 밖으로 나가도 이어진다.
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    offsetRef.current = next.offset;
    setDrag(next);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>): void {
    const tracker = trackerRef.current;
    if (tracker == null || tracker.pointerId !== event.pointerId) return;
    trackerRef.current = null;

    const offset = offsetRef.current;
    // 끌기로 확정됐는지도 상태가 아니라 추적기가 안다. 같은 이유다.
    const engaged = tracker.engaged;
    offsetRef.current = 0;
    setDrag(AT_REST);
    if (!engaged) return;

    swallowClick.current = true;
    if (shouldDismiss(offset, event.timeStamp - tracker.startedAt)) onClose();
  }

  function handleClick(): void {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    onClose();
  }

  /*
    끌고 손을 뗀 자리에서 클릭이 한 번 더 온다. 그것을 여기서 한 번만 삼킨다.

    예전에는 손잡이의 클릭 하나만 봤다. 본문에서 시작한 끌기는 손잡이 클릭을 안 만드니
    표시가 켜진 채로 남고, **다음에 손잡이를 누른 한 번이 통째로 죽었다.** 확인 창이
    생기면서 닫히지 않고 남는 길이 늘어 이 자리를 밟는 일이 잦아졌다.
  */
  function onRootClickCapture(event: ReactMouseEvent<HTMLDivElement>): void {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    if (isHandle(event.target)) return;
    event.stopPropagation();
  }

  return createPortal(
    <div className="pk-sheet-root" onClickCapture={onRootClickCapture}>
      <div className="pk-sheet-dim" onClick={dismissible ? onClose : undefined} />
      <div
        ref={sheetRef}
        className={cx(
          'pk-sheet',
          size === 'tall' && 'pk-sheet--tall',
          drag.dragging && 'pk-sheet--dragging',
          className,
        )}
        style={drag.offset > 0 ? { transform: `translateY(${drag.offset}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : ariaLabel}
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {dismissible ? (
          /*
              손잡이가 곧 닫기다. 누르면 닫히고 아래로 밀어도 닫힌다.
              `touch-action: none` 이 없으면 브라우저가 세로 손짓을 스크롤로 먼저 가져간다.
            */
          <button
            type="button"
            data-sheet-handle=""
            className="pk-sheet__handle pk-sheet__handle--hit"
            aria-label="닫기"
            onClick={handleClick}
          >
            <span className="pk-sheet__grip" aria-hidden="true" />
          </button>
        ) : (
          <div className="pk-sheet__handle">
            <span className="pk-sheet__grip" aria-hidden="true" />
          </div>
        )}
        {title ? (
          <div className="pk-sheet__header">
            <div className="pk-sheet__title" id={titleId}>
              {title}
            </div>
          </div>
        ) : null}
        <div className="pk-sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
