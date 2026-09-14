/**
 * 첫 안내를 이미 봤는지 기기에 남긴다.
 *
 * **서버에 두지 않는다.** 이 앱을 어떻게 쓰는지 배운 것은 그 사람이지 그 계정이 아니라는
 * 말도 되지만, 실제 이유는 더 단순하다. 못 읽어도 안내가 한 번 더 뜰 뿐 아무것도 틀어지지
 * 않는다. 그 값을 서버에 두면 첫 화면이 서버 응답을 기다리게 된다.
 *
 * `homeAddSeen.ts` 와 같은 방식이다.
 */

import type { KeyValueStore } from '../toss';

const KEY = 'onboarding-seen';

/** 저장소가 막혀 있으면 '아직 안 봤다' 로 본다. 한 번 더 뜨는 쪽이 덜 나쁘다. */
export async function readOnboardingSeen(store: KeyValueStore): Promise<boolean> {
  try {
    return (await store.get(KEY)) != null;
  } catch {
    return false;
  }
}

/** 저장에 실패해도 조용히 넘어간다. 안내를 닫는 것 자체를 막지 않는다. */
export async function markOnboardingSeen(store: KeyValueStore): Promise<void> {
  try {
    await store.set(KEY, '1');
  } catch {
    /* 저장소가 막힌 환경에서도 앱은 그대로 열린다. */
  }
}

/**
 * 다음 진입에서 첫 안내를 한 번 다시 열라는 표시.
 *
 * 앱 정보에서 「안내를 처음 상태로」 를 누르면 남는다. 표시만 지우면 실기기에서 이 화면을
 * 다시 볼 방법이 없어, 고칠 때마다 앱 데이터를 통째로 지워야 한다.
 */
const REPLAY_KEY = 'onboarding-replay';

export async function markOnboardingReplay(store: KeyValueStore): Promise<void> {
  try {
    await store.set(REPLAY_KEY, '1');
  } catch {
    /* 못 적으면 다시 열리지 않을 뿐이다. */
  }
}

/** 읽으면서 지운다. 한 번만 열어야 하므로 남겨 두면 안 된다. */
export async function takeOnboardingReplay(store: KeyValueStore): Promise<boolean> {
  try {
    const value = await store.get(REPLAY_KEY);
    if (value == null) return false;
    await store.remove(REPLAY_KEY);
    return true;
  } catch {
    return false;
  }
}
