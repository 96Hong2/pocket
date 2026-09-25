/**
 * 시트를 아래로 밀어 닫기.
 *
 * X 버튼을 없앤 자리를 이것이 대신한다. 화면 오른쪽 위에 닫기 아이콘 하나를 더 두는 것보다,
 * 시트를 잡고 내리는 쪽이 배울 것이 없다.
 *
 * **본문이 맨 위에 있고, 방금 굴린 참이 아닐 때만 잡는다.** 맨 위인지만 보면, 되올리려고
 * 여러 번 튕기는 손짓의 마지막 한 번이 닫기로 읽힌다. 손잡이는 언제나 닫는다.
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

/** 이 상자가 세로로 굴러가나. 굴러갈 것이 남아 있어야 스크롤 상자로 친다. */
function scrollsVertically(node: Element): boolean {
  if (node.scrollHeight <= node.clientHeight + 1) return false;
  const overflow = getComputedStyle(node).overflowY;
  return overflow === 'auto' || overflow === 'scroll';
}

/**
 * 굴린 지 이만큼 안 지났으면 이 손짓도 굴리려는 것이다.
 *
 * 🔴 **여기가 두 번 신고된 자리의 핵심이다.** 폰에서 되올리는 손짓은 한 번으로 안 끝나고
 * 여러 번 튕긴다. 그 사이에 맨 위(0)에 닿는데, 위치만 보면 닿은 다음 한 번이 「맨 위니까
 * 닫아도 된다」 가 된다. 사람은 같은 손짓을 이어서 하고 있을 뿐이다.
 *
 * 그래서 **위치가 아니라 방금 굴렸는지**를 함께 본다. 굴리기가 가라앉은 뒤에 새로 시작한
 * 손짓만 닫기로 읽는다. 관성 스크롤이 내는 `scroll` 이 그동안 계속 이 시각을 밀어 준다.
 */
export const SCROLL_SETTLE_MS = 400;

/**
 * 손이 얹힌 자리에 **이미 굴려 놓은** 안쪽 상자가 있나.
 *
 * 시트 자체는 세지 않는다. 그쪽은 「맨 위에 있을 때만 끈다」 는 규칙이 그대로 산다.
 *
 * **굴러갈 수 있다는 것만으로 막지 않는다.** 한때 그렇게 넓혔다가, `overflow-y: auto` 가
 * 박힌 시트 전체가 걸려들어 iPhone 14 크기에서 시트 일곱의 밀어 닫기가 통째로 죽었다.
 * 기록 시트 키패드까지 죽었고, 기기 크기에 따라 됐다 안 됐다 했다. 리뷰가 재서 잡았다.
 */
function scrolledInnerBox(target: Element, sheet: HTMLElement): boolean {
  let node: Element | null = target;
  while (node != null && node !== sheet) {
    if (node.scrollTop > 0 && scrollsVertically(node)) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * 여기서 시작한 손짓을 끌기로 볼 것인가.
 *
 * 가르는 것 셋이다.
 *
 * - **방금 굴렸으면 안 끈다**(`SCROLL_SETTLE_MS`). 튕겨 올리는 손짓의 마지막 한 번을 막는다
 * - **이미 굴려 놓은 안쪽 상자 위에서는 안 끈다.** 그 상자는 자기만 굴러서 시트의
 *   스크롤 자리가 늘 0이라, 그 0을 맨 위로 읽으면 읽던 자리를 되올리다 시트가 닫힌다
 * - **버튼·입력칸 위에서는 안 끈다.** 키패드 숫자를 누르다 손가락이 몇 픽셀 흐르면
 *   시트가 내려가는데, 이 앱에서 그것보다 나쁜 일이 없다
 *
 * 손잡이는 예외다. 거기서 시작한 것은 언제나 닫으려던 손짓이다.
 */
export function canStartDrag(
  target: EventTarget | null,
  sheet: HTMLElement,
  /** 마지막으로 굴린 지 몇 ms 지났나. 안 주면 굴린 적이 없는 것으로 본다. */
  sinceScrollMs: number = Number.POSITIVE_INFINITY,
): boolean {
  if (isHandle(target)) return true;
  if (!(target instanceof Element)) return sheet.scrollTop === 0;
  if (target.closest(INTERACTIVE) != null) return false;
  if (sinceScrollMs < SCROLL_SETTLE_MS) return false;
  if (scrolledInnerBox(target, sheet)) return false;
  return sheet.scrollTop === 0;
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
