import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';

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

/**
 * 아래로 밀어 닫기. 시트와 덮는 창이 **같은 규칙 한 벌**을 쓴다.
 *
 * 나눠 두었더니 한쪽만 고쳐졌다. 시트는 굴리는 손짓을 가리게 됐는데 분류 만들기 창은
 * 아예 손짓을 안 받아서, 같은 화면인데 어디서 열었느냐에 따라 닫는 법이 달랐다.
 *
 * 쓰는 쪽이 하는 일은 셋이다. 굴러가는 상자의 `ref` 를 넘기고, `handlers` 를 그 상자에
 * 붙이고, `offset` 만큼 아래로 옮겨 그린다.
 */
export function useDragToDismiss({
  boxRef,
  active,
  enabled,
  onDismiss,
}: {
  /** 굴러가는 상자. 손짓의 기준도 이 상자다. 쓰는 쪽이 만들어 넘긴다. */
  boxRef: RefObject<HTMLDivElement | null>;
  /**
   * 이 화면이 떠 있나. 굴린 시각을 재는 것은 여기에 달렸다.
   *
   * **닫을 수 있는지와 가른다.** 저장이 도는 동안에도 사람은 굴려 읽는다. 그동안 시각을
   * 안 재면, 저장이 끝나 닫기가 풀리는 순간의 첫 손짓이 「한참 전에 굴렸다」 로 읽힌다.
   */
  active: boolean;
  /** 지금 닫을 수 있나. 저장 중처럼 닫히면 안 될 때 끈다. */
  enabled: boolean;
  /** 닫기로 판정됐다. 물어볼 것이 있으면 부르는 쪽이 여기서 묻는다. */
  onDismiss: () => void;
}) {
  const trackerRef = useRef<Tracker | null>(null);
  /** 끌고 나서 손을 뗀 자리에서 클릭이 한 번 더 온다. 되돌아온 화면을 그것으로 닫지 않는다. */
  const swallowClick = useRef(false);
  /*
    지금 내려와 있는 거리. **상태가 아니라 여기를 보고 닫을지 정한다.**

    예전에는 손을 뗄 때 그려진 값을 읽었다. 빠르게 쓸어내리면 마지막 몇 번의 움직임이 아직
    안 그려진 채로 pointerup 이 와서, 160px 을 내렸는데도 30px 로 읽혀 안 닫혔다.
  */
  const offsetRef = useRef(0);
  /*
    마지막으로 무언가 굴러간 시각.

    🔴 **두 번 신고된 자리다.** 되올리는 손짓은 여러 번 튕기고, 그 사이에 맨 위(0)에 닿는다.
    위치만 보면 닿은 다음 한 번이 닫기로 읽힌다. `scroll` 은 거품을 안 타서 캡처 단계로 듣고,
    그래야 안쪽에서 자기만 굴러가는 상자의 것까지 한 자리에서 받는다.
  */
  const lastScrollAt = useRef(Number.NEGATIVE_INFINITY);
  const [drag, setDrag] = useState<DragState>(AT_REST);

  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!active) return;
    const box = boxRef.current;
    if (box == null) return;

    function onScroll(): void {
      lastScrollAt.current = performance.now();
      // 끌던 중에 무언가 굴렀으면 그 손짓은 끌기가 아니었다. 되돌린다.
      if (trackerRef.current == null) return;
      trackerRef.current = null;
      offsetRef.current = 0;
      setDrag(AT_REST);
    }

    box.addEventListener('scroll', onScroll, true);
    return () => box.removeEventListener('scroll', onScroll, true);
  }, [active]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    /*
      🔴 **새로 누르면 앞 끌기의 잔상 표시를 버린다.**

      끌고 손을 떼면 따라오는 클릭이 하나 오는데, 그것이 **안 오는 판이 있다.** 누른 자리와
      뗀 자리가 서로 다른 나무에 있으면 브라우저가 `body` 에 쏘고, 그 클릭은 우리 처리기에
      안 닿는다. 그러면 표시가 켜진 채로 남아 **그다음에 사람이 누른 한 번을 먹는다.**
      CI 에서 확인 창의 「그만두기」 가 그렇게 죽었다(창은 떠 있고 버튼에 포커스까지 갔는데
      아무 일도 안 일어났다). 새 누름이 왔다는 것은 그 잔상이 영영 안 온다는 뜻이다.
    */
    swallowClick.current = false;
    if (!enabled || trackerRef.current != null) return;
    const box = boxRef.current;
    if (box == null) return;
    if (!canStartDrag(event.target, box, performance.now() - lastScrollAt.current)) return;
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
      // 끌기로 확정된 뒤에는 포인터를 붙잡는다. 손가락이 밖으로 나가도 이어진다.
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
    if (shouldDismiss(offset, event.timeStamp - tracker.startedAt)) dismissRef.current();
  }

  /*
    끌고 손을 뗀 자리에서 클릭이 한 번 더 온다. 그것을 여기서 한 번만 삼킨다.

    예전에는 손잡이의 클릭 하나만 봤다. 본문에서 시작한 끌기는 손잡이 클릭을 안 만드니
    표시가 켜진 채로 남고, **다음에 손잡이를 누른 한 번이 통째로 죽었다.**

    🔴 **포털로 띄운 창 위의 클릭은 안 삼킨다.** 확인 창은 `body` 에 붙지만 리액트
    안에서는 여전히 자식이라 이 잡기가 그 클릭까지 받는다. 끌어서 확인 창을 띄운 직후,
    사람이 누른 「그만두기」 한 번이 끌기의 잔상으로 오인돼 죽었다(CI 가 잡았다).
    **DOM 으로 가른다.** 딤은 이 상자 안에 있고 포털은 밖에 있다.

    표시는 어느 쪽이든 내린다. 따라오는 클릭은 한 번뿐이라, 남겨 두면 그다음에 사람이
    누른 한 번을 먹는다. 위에 적힌 그 사고다.
  */
  function onClickCapture(event: ReactMouseEvent<HTMLDivElement>): void {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    if (isHandle(event.target)) return;
    event.stopPropagation();
  }

  /** 끌고 난 뒤에 따라온 클릭인가. 맞으면 한 번만 삼키고 표시를 끈다. 손잡이가 읽는다. */
  function takeSwallowedClick(): boolean {
    if (!swallowClick.current) return false;
    swallowClick.current = false;
    return true;
  }

  return {
    offset: drag.offset,
    dragging: drag.dragging,
    takeSwallowedClick,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
    onClickCapture,
  };
}
