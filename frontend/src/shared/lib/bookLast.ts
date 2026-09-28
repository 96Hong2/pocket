/**
 * 마지막으로 공유 기록을 적은 가계부를 기기에 남긴다.
 *
 * 기록 시트의 「적을 곳」 둘째 칩이 이 값을 쓴다. 내 가계부를 보다가 시트를 열어도
 * 늘 적던 공유 가계부가 한 번에 눌리게 한다.
 *
 * 서버에 두지 않는다. 시트가 뜨는 순간 값이 있어야 하고, 못 읽어도 가장 최근 가계부가
 * 대신 설 뿐이다. `lastRecord.ts` 와 같은 방식이다.
 */

import type { KeyValueStore } from '../toss';

const KEY = 'book-last';

/** 저장소가 막혔거나 비어 있으면 null 이다. 그 가계부가 아직 있는지는 부르는 쪽이 목록과 견준다. */
export async function readBookLast(store: KeyValueStore): Promise<string | null> {
  try {
    const value = await store.get(KEY);
    return value == null || value === '' ? null : value;
  } catch {
    return null;
  }
}

export async function writeBookLast(store: KeyValueStore, bookId: string): Promise<void> {
  try {
    await store.set(KEY, bookId);
  } catch {
    /* 못 남겨도 기록은 된다. 다음에 다른 칩이 설 뿐이다. */
  }
}
