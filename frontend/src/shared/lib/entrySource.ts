/**
 * 이 사람이 어디서 들어왔나.
 *
 * 앱이 뜰 때 주소에 두 값이 실려 온다.
 * - `referrer` : 토스가 붙인다. 전체탭 · 검색 · 공유 링크 · 토스애즈 같은 토스 쪽 입구다
 *   (앱인토스 문서 「유입경로 레퍼러」).
 * - `src` : 우리가 바깥 채널 링크에 붙이는 표시다(`intoss://pocket-ledger?src=threads_bio`).
 *   토스 유입경로만으로는 스레드에서 온 사람과 릴스에서 온 사람이 똑같이 `external_link` 다.
 *
 * **처음 들어온 길은 기기에 남긴다.** 다시 온 날의 `app_open` 에는 그날 입구만 실리는데,
 * 채널마다 다음 날 몇 명이 돌아왔는지를 보려면 그 사람이 처음 어디서 왔는지가 함께 있어야 한다.
 * 한 번 적으면 덮어쓰지 않는다.
 *
 * 값은 영문·숫자·밑줄만 받는다. 주소는 누구나 고쳐 칠 수 있어서, 아무 글자나 로그에
 * 실으면 사람이 적은 문장이 집계 칸으로 흘러든다.
 */

import type { KeyValueStore } from '../toss';

const FIRST_KEY = 'entry-first-source';
const VALUE = /^[a-z0-9_]{1,40}$/i;

export interface EntrySource {
  referrer: string | null;
  src: string | null;
}

function clean(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return VALUE.test(trimmed) ? trimmed.toLowerCase() : null;
}

/** 주소의 검색 부분에서 두 값을 읽는다. */
export function parseEntrySource(search: string): EntrySource {
  const params = new URLSearchParams(search);
  return { referrer: clean(params.get('referrer')), src: clean(params.get('src')) };
}

let captured: EntrySource | null = null;

/**
 * 이번 실행의 입구. 처음 부를 때 읽고 그 뒤로는 같은 값을 준다.
 *
 * 라우터가 주소를 바꾸기 전에 읽어야 한다. 그래서 앱을 그리기 전에 한 번 불러 둔다(`main.tsx`).
 */
export function entrySource(): EntrySource {
  if (captured == null) captured = parseEntrySource(window.location.search);
  return captured;
}

/** 첫 실행에 입구 표시가 하나도 없었던 사람. 저장소가 막혀 모르는 null 과 가른다. */
export const DIRECT_ENTRY = 'direct';

/**
 * 처음 들어온 길. 적어 둔 것이 있으면 그것을, 없고 첫 실행이면 이번 입구를 적는다.
 *
 * 우리 표시(`src`)가 있으면 그것을, 없으면 토스 입구(`referrer`)를 쓴다. 둘 다 없으면
 * `direct` 다. **첫 실행이 아닌데 적어 둔 것이 없으면 null** 이다. 이 기능이 들어오기 전부터
 * 쓰던 사람이라 처음 길을 모른다.
 *
 * 첫 실행이어도 먼저 읽는다. 방문 기록이 날아가 첫 실행으로 잘못 세어져도 처음 길은 안 바뀐다.
 * 저장이 막히면 이번 값만 싣고 넘어간다. 로그 한 칸이 비는 쪽이 앱이 멈추는 것보다 낫다.
 */
export async function firstEntrySource(
  store: KeyValueStore,
  entry: EntrySource,
  isFirstOpen: boolean,
): Promise<string | null> {
  let saved: string | null = null;
  try {
    saved = await store.get(FIRST_KEY);
  } catch {
    // 못 읽으면 없는 것으로 본다.
  }
  if (saved != null) return saved;
  if (!isFirstOpen) return null;
  const first = entry.src ?? entry.referrer ?? DIRECT_ENTRY;
  try {
    await store.set(FIRST_KEY, first);
  } catch {
    // 다음 실행에서는 모르게 되지만 이번 로그에는 싣는다.
  }
  return first;
}
