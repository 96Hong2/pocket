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
 * 몇 번 적었나. 안내를 한 번 더 띄울 때만 쓴다.
 *
 * **서버에 두지 않는다.** 위와 같은 이유다. 홈 화면 추가는 그 휴대폰에서 하는 일이라,
 * 기기를 바꾼 사람에게는 다시 세는 것이 맞다. 저장이 막혀 있으면 안내가 한 번 덜 뜰 뿐이다.
 *
 * 한 번의 저장이 한 번이다. 캡처로 여덟 건을 한꺼번에 넣어도 적은 횟수는 한 번이다.
 * 세는 것은 건수가 아니라 「이 앱을 몇 번 썼나」 다.
 */
const COUNT_KEY = 'record-count';

/** 못 읽으면 0 으로 본다. 안내가 늦게 뜨는 쪽이 덜 나쁘다. */
export async function readRecordCount(store: KeyValueStore): Promise<number> {
  try {
    const raw = await store.get(COUNT_KEY);
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** 한 번 적었다고 올린다. 실패해도 저장 자체를 막지 않는다. */
export async function bumpRecordCount(store: KeyValueStore): Promise<void> {
  try {
    const next = (await readRecordCount(store)) + 1;
    await store.set(COUNT_KEY, String(next));
  } catch {
    /* 저장소가 막힌 환경에서도 기록은 그대로 저장된다. */
  }
}

/** 두 번째 안내(몇 번 써 본 뒤)를 이미 띄웠나. */
const AGAIN_KEY = 'home-add-prompted-again';

export async function readHomeAddAgainPrompted(store: KeyValueStore): Promise<boolean> {
  try {
    return (await store.get(AGAIN_KEY)) != null;
  } catch {
    return false;
  }
}

export async function markHomeAddAgainPrompted(store: KeyValueStore): Promise<void> {
  try {
    await store.set(AGAIN_KEY, '1');
  } catch {
    /* 못 적으면 다음에 한 번 더 뜬다. 그 정도는 감수한다. */
  }
}
