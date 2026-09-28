/**
 * 「우리 집 광고 없이 쓰기」 에 「원해요」 를 눌렀는지.
 *
 * 결제는 아직 없다. 원하는 사람이 얼마나 되는지 세는 자리라, 누른 뒤에는 줄에
 * 「신청함」 을 보여 주고 같은 사람이 여러 번 세지지 않게 한다. 세는 것은 로그가 한다.
 */

import type { KeyValueStore } from '../toss';

const KEY = 'plus-interest';

export async function readPlusInterest(store: KeyValueStore): Promise<boolean> {
  try {
    return (await store.get(KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markPlusInterest(store: KeyValueStore): Promise<void> {
  try {
    await store.set(KEY, '1');
  } catch {
    /* 못 남기면 줄이 다시 「준비 중」 으로 보일 뿐이다. */
  }
}
