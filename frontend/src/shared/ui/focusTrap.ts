/**
 * 열린 시트·오버레이가 포커스를 자기 안에 붙들 때 쓰는 규칙 한 곳.
 *
 * 바텀시트와 전체화면 오버레이가 같은 규칙을 써야 한다. 각자 적으면 한쪽만 고쳐져서,
 * 어떤 창에서는 Tab 이 뒤 화면으로 새고 스크린리더가 가려진 목록을 읽는다.
 */

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * 컨테이너 안에서 실제로 화면에 그려진 포커스 대상.
 *
 * 감춘 탭도 DOM 에 남으므로 화면에 없는 것은 뺀다. 안 빼면 첫·끝이 안 보이는 버튼이 되어
 * Tab 이 창 밖으로 샌다.
 */
export function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isOnScreen);
}

/** Tab 이 창 밖으로 새지 않게 앞뒤를 이어 붙인다. `Tab` 키일 때만 부른다. */
export function trapTab(container: HTMLElement, event: KeyboardEvent): void {
  const targets = focusableIn(container);
  if (targets.length === 0) {
    event.preventDefault();
    container.focus();
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

/**
 * 화면에 실제로 그려진 요소인지.
 *
 * `checkVisibility()` 가 없는 웹뷰가 있다. 그대로 부르면 Tab 처리가 통째로 죽어 포커스가
 * 창 밖으로 샌다. 없으면 그린 자리가 있는지로 본다. 감춘 탭은 display:none 이라 자리가 없다.
 */
function isOnScreen(element: HTMLElement): boolean {
  return element.checkVisibility?.() ?? element.getClientRects().length > 0;
}
