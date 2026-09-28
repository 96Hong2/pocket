/**
 * 홈에서 마지막으로 본 공유 가계부를 기기에 남긴다.
 *
 * 공유 가계부만 쓰는 사람(초대받아 들어와 내 가계부에는 적은 것이 없는 사람)이 앱을 다시 열면
 * 빈 내 가계부 홈이 아니라 보던 가계부에서 시작하게 한다. 그 판정은 `BookViewProvider` 가 한다.
 *
 * 사람이 「내 가계부」 를 고르면 지운다. 못 읽으면 늘 하던 대로 내 가계부에서 시작할 뿐이다.
 */

import type { BookOut } from '../api';
import type { KeyValueStore } from '../toss';

const KEY = 'book-last-viewed';

/** 비었거나 못 읽으면 null 이다. 그 가계부가 아직 있는지는 부르는 쪽이 목록과 견준다. */
export async function readBookLastViewed(store: KeyValueStore): Promise<string | null> {
  try {
    const value = await store.get(KEY);
    return value == null || value === '' ? null : value;
  } catch {
    return null;
  }
}

/** `null` 이면 지운다. */
export async function writeBookLastViewed(
  store: KeyValueStore,
  bookId: string | null,
): Promise<void> {
  try {
    if (bookId == null) await store.remove(KEY);
    else await store.set(KEY, bookId);
  } catch {
    /* 못 남기면 다음에 내 가계부에서 시작할 뿐이다. */
  }
}

export interface StartBookInput {
  /** 기기에 남은 마지막 가계부. 없으면 null. */
  remembered: string | null;
  /** 물어볼 수 없는 상태(식별키 실패, 기능 꺼짐, 조회 실패). 그러면 내 가계부다. */
  unavailable: boolean;
  /** 지금 멤버인 가계부. 아직 못 받았으면 undefined. */
  books: readonly BookOut[] | undefined;
  /** 내 가계부에 기록이 하나라도 있나. 아직 못 받았으면 undefined. */
  hasPersonalRecords: boolean | undefined;
}

/**
 * 앱을 열 때 어느 가계부에서 시작하나. `undefined` 는 아직 모른다(더 기다린다),
 * `null` 은 내 가계부, 문자열은 그 공유 가계부다.
 *
 * 내 가계부에 적은 것이 하나라도 있으면 늘 내 가계부다. 공유 가계부를 보던 채로 다시 열어
 * 내 지출이 그 가계부 화면에서 적히는 일을 막는 원래 규칙이다. 기록이 없고, 마지막에 보던
 * 가계부가 아직 쓰는(끝나지 않은) 가계부일 때만 거기서 시작한다.
 */
export function resolveStartBook(input: StartBookInput): string | null | undefined {
  if (input.remembered == null || input.unavailable) return null;
  if (input.books == null || input.hasPersonalRecords == null) return undefined;
  if (input.hasPersonalRecords) return null;
  const book = input.books.find((item) => item.id === input.remembered && !item.ended);
  return book?.id ?? null;
}
