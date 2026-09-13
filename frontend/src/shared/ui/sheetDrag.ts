/**
 * 시트를 아래로 밀어 닫기.
 *
 * X 버튼을 없앤 자리를 이것이 대신한다. 화면 오른쪽 위에 닫기 아이콘 하나를 더 두는 것보다,
 * 시트를 잡고 내리는 쪽이 배울 것이 없다.
 *
 * **본문이 맨 위에 있을 때만 잡는다.** 시트 자체가 스크롤 상자라, 중간까지 내려 읽던 중에
 * 아래로 끌면 그건 스크롤이지 닫기가 아니다.
 *
 * **버튼·입력칸 위에서는 시작하지 않는다.** 손잡이만 예외다. 키패드 숫자를 누르다 손가락이
 * 몇 픽셀 흐르면 시트가 내려가는데, 이 앱에서 그것보다 나쁜 일이 없다.
 */

/** 이만큼 내려가면 닫는다. 화면 높이가 아니라 고정값이다. 시트마다 높이가 달라서다. */
export const DISMISS_DISTANCE = 96;

/** 짧게 튕겨도 닫는다. px/ms. 빠르게 쳐내는 손짓은 거리가 짧다. */
export const DISMISS_VELOCITY = 0.5;

/** 이만큼 움직이기 전에는 스크롤인지 끌기인지 정하지 않는다. */
const SLOP = 8;

export interface DragState {
  /** 지금 내려와 있는 거리(px). 0 이면 제자리다. */
  offset: number;
  dragging: boolean;
}

export const AT_REST: DragState = { offset: 0, dragging: false };

interface Tracker {
  pointerId: number;
  startY: number;
  startX: number;
  startedAt: number;
  /** 손잡이에서 시작했나. 그렇다면 스크롤 위치를 따지지 않는다. */
  fromHandle: boolean;
  /** 끌기로 확정됐나. SLOP 을 넘으면 true. */
  engaged: boolean;
}

/** 이 위에서 시작한 손짓은 끌기가 아니다. 누르려던 것이다. */
const INTERACTIVE = 'button, a, input, textarea, select, [role="radio"], [role="switch"]';

export function isHandle(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-sheet-handle]') != null;
}

export function canStartDrag(target: EventTarget | null, scrollTop: number): boolean {
  if (isHandle(target)) return true;
  if (scrollTop > 0) return false;
  return !(target instanceof Element && target.closest(INTERACTIVE) != null);
}

export function beginTracking(
  pointerId: number,
  x: number,
  y: number,
  now: number,
  fromHandle: boolean,
): Tracker {
  return { pointerId, startX: x, startY: y, startedAt: now, fromHandle, engaged: false };
}

/**
 * 움직인 결과. `null` 이면 이 손짓은 끌기가 아니다(가로로 갔거나 위로 갔다).
 *
 * 아직 SLOP 안이면 `engaged` 가 false 로 남고 화면은 움직이지 않는다.
 */
export function trackMove(tracker: Tracker, x: number, y: number): DragState | null {
  const dy = y - tracker.startY;
  const dx = x - tracker.startX;

  if (!tracker.engaged) {
    if (Math.abs(dy) < SLOP && Math.abs(dx) < SLOP) return AT_REST;
    // 가로로 먼저 움직였으면 끌기가 아니다. 위로 올린 것도 마찬가지다.
    if (Math.abs(dx) > Math.abs(dy) || dy <= 0) return null;
    tracker.engaged = true;
  }

  // 위로는 안 따라간다. 시트가 천장에 붙어 있어 올릴 자리가 없다.
  return { offset: Math.max(0, dy), dragging: true };
}

/** 손을 뗐을 때 닫을지. 거리가 모자라도 빠르게 쳐냈으면 닫는다. */
export function shouldDismiss(offset: number, elapsedMs: number): boolean {
  if (offset >= DISMISS_DISTANCE) return true;
  if (elapsedMs <= 0) return false;
  return offset > SLOP && offset / elapsedMs >= DISMISS_VELOCITY;
}

export type { Tracker };
