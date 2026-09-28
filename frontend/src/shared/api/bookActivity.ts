/**
 * 공유 가계부를 얼마나 자주 다시 읽나.
 *
 * 웹소켓 없이 다시 읽기만으로 맞춘다. 화면이 보이는 동안 30초마다 읽고, 내가 공유 기록을
 * 적었거나 새 기록이 들어온 뒤 2분 동안은 10초마다 읽는다. 같이 적는 사람이 방금 움직였으면
 * 곧 또 움직일 가능성이 높아서다.
 *
 * 시각을 모듈에 둔다. 쓰기 훅(shared/api)과 읽기 옵션(features/books)이 같은 값을 봐야 하고,
 * 화면을 옮겨도 남아야 한다.
 */

export const BOOK_POLL_SLOW_MS = 30_000;
export const BOOK_POLL_FAST_MS = 10_000;
/** 움직임이 있은 뒤 빠르게 읽는 시간. */
export const BOOK_ACTIVE_WINDOW_MS = 120_000;

let lastBookActivity = Number.NEGATIVE_INFINITY;

/** 공유 가계부에서 무언가 움직였다. 쓰기가 성공했거나 모르던 기록이 들어왔을 때 부른다. */
export function markBookActivity(now: number = Date.now()): void {
  lastBookActivity = now;
}

/** 다음 다시 읽기까지 기다릴 시간. */
export function bookRefetchInterval(now: number = Date.now()): number {
  return now - lastBookActivity < BOOK_ACTIVE_WINDOW_MS ? BOOK_POLL_FAST_MS : BOOK_POLL_SLOW_MS;
}

/** 테스트가 앞 테스트의 움직임을 지운다. */
export function resetBookActivity(): void {
  lastBookActivity = Number.NEGATIVE_INFINITY;
}
