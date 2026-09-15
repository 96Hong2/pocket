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
