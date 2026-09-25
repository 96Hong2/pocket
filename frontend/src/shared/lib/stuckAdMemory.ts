import { STUCK_BLOCK_SCORE } from './stuckAd';

/**
 * 광고에 갇힌 적을 **화면이 바로 읽을 수 있게** 들고 있는 자리.
 *
 * 두 가지를 함께 둔다.
 *
 * - `score`  이 기기에 쌓인 갇힘 점수. 저장소에 남고, 앱을 열 때 한 번 읽어 온다
 * - `stalled`  이 세션에서 갇힌 것을 직접 봤나. 앱을 끄면 함께 사라진다
 *
 * **왜 훅 밖인가.** 화면마다 광고 훅이 따로 도는데 사람과 기기는 하나다. 훅 안에 두면
 * 캡처 탭에서 갇힌 사람이 영수증 탭에서 다시 갇힌다.
 *
 * **왜 구독을 두나.** 둘 다 그림 밖에서 바뀐다. 점수는 앱을 열고 저장소를 다녀온 뒤에,
 * 갇힘은 광고가 뜬 지 90초 뒤에 정해진다. 알리지 않으면 화면은 「광고 보고 받기」 를
 * 계속 권하는데 누르면 그냥 지나간다. 저장소가 느린 기기에서는 첫 광고가 그대로 뜬다.
 */
interface StuckMemory {
  score: number;
  stalled: boolean;
}

let memory: StuckMemory = { score: 0, stalled: false };
const listeners = new Set<() => void>();

function set(next: StuckMemory): void {
  // 같은 값이면 안 알린다. `useSyncExternalStore` 가 매번 새 객체를 보면 무한히 다시 그린다.
  if (next.score === memory.score && next.stalled === memory.stalled) return;
  memory = next;
  for (const listener of listeners) listener();
}

export function subscribeStuckMemory(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getStuckMemory(): StuckMemory {
  return memory;
}

/** 앱을 열 때 저장소에서 읽어 온 점수를 얹는다. */
export function setDeviceStuckScore(score: number): void {
  set({ ...memory, score });
}

/** 갇힌 것을 직접 봤다. 점수도 함께 올려 이번 실행 내내 닫아 둔다. */
export function markStalledNow(score: number): void {
  set({ score, stalled: true });
}

/**
 * 지금 전면 광고를 띄우면 안 되나.
 *
 * 세션에서 한 번 갇혔거나(`stalled`), 기기에 갇힘이 쌓였으면(`score`) 닫는다.
 */
export function adsBlockedByStall(state: StuckMemory = memory): boolean {
  return state.stalled || state.score >= STUCK_BLOCK_SCORE;
}

/** 테스트 사이에 기억을 비운다. */
export function resetStuckMemory(): void {
  memory = { score: 0, stalled: false };
  listeners.clear();
}
