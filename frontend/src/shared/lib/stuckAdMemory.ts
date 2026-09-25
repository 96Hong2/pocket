import {
  STUCK_DEATHS_BLOCK,
  clearStuckDeaths,
  markStuckSeen,
  readStuckState,
  type StuckState,
} from './stuckAd';
import type { KeyValueStore } from '../toss';

/**
 * 광고에 갇힌 적을 **화면이 그 자리에서 읽을 수 있게** 들고 있는 자리.
 *
 * **왜 훅 밖인가.** 화면마다 광고 훅이 따로 도는데 사람과 기기는 하나다. 훅 안에 두면
 * 캡처 탭에서 갇힌 사람이 영수증 탭에서 다시 갇힌다.
 *
 * **왜 구독을 두나.** 값이 그림 밖에서 바뀐다. 저장소는 앱을 열고 네이티브를 다녀온 뒤에
 * 닿고, 갇힘 판정은 광고가 뜬 지 90초 뒤에 온다. 알리지 않으면 화면은 「광고 보고 받기」
 * 를 계속 권하는데 누르면 그냥 지나간다.
 *
 * **왜 약속(`ensureStuckMemory`)도 두나.** 구독은 값이 **온 뒤에** 다시 그리게 할 뿐,
 * 아직 안 온 값을 기다리게 하지 못한다. 그림은 모르는 동안 「뜬다」 로 보고(ADR-0029 와
 * 같은 선택이다), **누른 직후의 판정만** 이 약속을 기다린다. 그래야 갇힌 기기에서 광고가
 * 한 편 더 뜨는 일이 없다.
 */
let memory: StuckState = { seen: false, deaths: 0 };
const listeners = new Set<() => void>();
let loading: Promise<void> | undefined;

function set(next: StuckState): void {
  // 같은 값이면 안 알린다. `useSyncExternalStore` 가 매번 새 객체를 보면 끝없이 다시 그린다.
  if (next.seen === memory.seen && next.deaths === memory.deaths) return;
  memory = next;
  for (const listener of listeners) listener();
}

/**
 * 저장소에서 한 번만 읽어 온다. 두 번째부터는 같은 약속을 돌려준다.
 *
 * 부르는 자리를 화면 하나에 묶지 않는다. 앱을 여는 자리가 못 부르거나 늦게 불러도
 * 광고를 띄우려는 쪽이 스스로 기다릴 수 있어야 한다.
 */
export function ensureStuckMemory(store: KeyValueStore): Promise<void> {
  loading ??= readStuckState(store).then((state) => {
    // 그 사이에 갇힌 것을 봤으면 그쪽이 이긴다. 저장소 값이 덮어쓰면 안 된다.
    set({ seen: memory.seen || state.seen, deaths: Math.max(memory.deaths, state.deaths) });
  });
  return loading;
}

export function subscribeStuckMemory(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getStuckMemory(): StuckState {
  return memory;
}

/** 갇힌 것을 직접 봤다. 이것만으로 이 기기의 전면 광고를 닫는다. */
export function noteStuckSeen(): void {
  set({ ...memory, seen: true });
}

/** 광고가 덮인 채 죽은 횟수를 얹는다. 광고가 제대로 걷히면 0으로 되돌린다. */
export function noteStuckDeaths(deaths: number): void {
  set({ ...memory, deaths });
}

/**
 * 지금 전면 광고를 띄우면 안 되나.
 *
 * 갇힌 것을 직접 봤거나, 광고가 덮인 채로 **연달아** 두 번 죽었으면 닫는다.
 */
export function adsBlockedByStall(state: StuckState = memory): boolean {
  return state.seen || state.deaths >= STUCK_DEATHS_BLOCK;
}

/**
 * 갇힌 것을 직접 봤다. **기억과 저장소를 한 번에 적는다.**
 *
 * 둘로 나눠 두면 한쪽만 부르는 배선이 생기고, 그 어긋남은 90초짜리 판이라 검사가 못
 * 닿는다. 부르는 자리를 한 줄로 줄여 둔다.
 */
export function rememberStuckSeen(store: KeyValueStore): void {
  noteStuckSeen();
  void markStuckSeen(store);
}

/** 광고 한 편이 제대로 걷혔다. 연달아 죽은 기록을 기억과 저장소에서 함께 끊는다. */
export function rememberAdFinished(store: KeyValueStore): void {
  if (memory.deaths === 0) return;
  noteStuckDeaths(0);
  void clearStuckDeaths(store);
}

/** 테스트 사이에 기억을 비운다. */
export function resetStuckMemory(): void {
  memory = { seen: false, deaths: 0 };
  loading = undefined;
  listeners.clear();
}
