/**
 * 초대받아 들어온 사람에게 한 번 보이는 안내 카드를 이미 봤는지 기기에 남긴다.
 *
 * 카드는 「기록할 때 두 곳 중 한 곳을 고른다」 는 한 가지만 말한다. 한 번 읽으면 끝이라
 * 가계부마다 따로 세지 않는다.
 *
 * 저장소가 막혀 있으면 「이미 봤다」 로 본다. 이 카드는 없어도 적는 데 지장이 없고,
 * 닫아도 매번 다시 뜨는 쪽이 더 성가시다.
 */

import type { KeyValueStore } from '../toss';

const KEY = 'book-intro-seen';

export async function readBookIntroSeen(store: KeyValueStore): Promise<boolean> {
  try {
    return (await store.get(KEY)) != null;
  } catch {
    return true;
  }
}

export async function markBookIntroSeen(store: KeyValueStore): Promise<void> {
  try {
    await store.set(KEY, '1');
  } catch {
    /* 저장소가 막힌 환경에서도 화면은 그대로 돈다. */
  }
}
