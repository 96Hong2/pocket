/**
 * 홈 화면에 추가하라는 안내를 이미 보여 줬는지 기기에 남긴다.
 *
 * **서버에 두지 않는다.** 홈 화면 추가는 그 휴대폰에서 하는 일이다. 서버에 두면 기기를
 * 바꾼 사람에게 다시는 안내가 안 간다. 못 읽어도 안내가 한 번 더 뜰 뿐이라 손해가 없다.
 *
 * `closingSeen.ts` 와 같은 방식이고, 두 화면(홈 카드·앱 설정)이 나눠 쓰기 때문에 여기 있다.
 */

import type { KeyValueStore } from '../toss';

const KEY = 'home-add-prompted';

/** 저장소가 막혀 있으면 '아직 안 봤다' 로 본다. 안내가 한 번 더 뜨는 쪽이 덜 나쁘다. */
export async function readHomeAddPrompted(store: KeyValueStore): Promise<boolean> {
  try {
    return (await store.get(KEY)) != null;
  } catch {
    return false;
  }
}

/** 저장에 실패해도 조용히 넘어간다. 안내를 보는 것 자체를 막지 않는다. */
export async function markHomeAddPrompted(store: KeyValueStore): Promise<void> {
  try {
    await store.set(KEY, '1');
  } catch {
    /* 저장소가 막힌 환경에서도 안내는 그대로 열린다. */
  }
}

/**
 * 다음 홈 진입에서 안내를 한 번 다시 열라는 표시.
 *
 * 안내는 「기록 없음 → 있음」 으로 바뀌는 순간에만 뜬다. 그래서 표시만 지워서는 다시 못 본다.
 * 이미 적어 둔 기록이 있는 사람에게 그 전이가 다시 일어나지 않기 때문이다.
 * 실기기에서 안내 화면을 확인하려면 전이 대신 이 표시로 한 번 열어야 한다.
 */
const REPLAY_KEY = 'home-add-replay';

export async function markHomeAddReplay(store: KeyValueStore): Promise<void> {
  try {
    await store.set(REPLAY_KEY, '1');
  } catch {
    /* 못 적으면 다시 열리지 않을 뿐이다. */
  }
}

/** 읽으면서 지운다. 한 번만 열어야 하므로 남겨 두면 안 된다. */
export async function takeHomeAddReplay(store: KeyValueStore): Promise<boolean> {
  try {
    const value = await store.get(REPLAY_KEY);
    if (value == null) return false;
    await store.remove(REPLAY_KEY);
    return true;
  } catch {
    return false;
  }
}

