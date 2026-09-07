/**
 * 그 달 결산을 이미 봤는지 기기에 남긴다.
 *
 * 서버에 두지 않는 이유는 이것이 돈에 관한 사실이 아니기 때문이다. 결산을 열어 봤다는 것은
 * 그 기기에서 한 일이고, 못 읽어도 카드가 한 번 더 뜰 뿐 아무것도 틀어지지 않는다.
 * `quick-record/lastRecord.ts` 와 같은 방식이다.
 *
 * 여기 있는 이유는 두 화면이 나눠 쓰기 때문이다. 홈이 읽어 진입 카드를 띄울지 정하고,
 * 리포트의 결산 오버레이가 열릴 때 남긴다. 한쪽 feature 안에 두면 다른 쪽이 그 안을 들여다본다.
 */

import type { KeyValueStore } from '../toss';

/**
 * 홈에 결산 진입 카드를 띄우는 창. 달이 바뀐 뒤 이 날짜까지만 알린다.
 *
 * 더 길게 두면 지난달 이야기가 이번 달 내내 홈에 남아, 오늘 기록하러 온 사람의 자리를 뺏는다.
 * 홈 화면과 e2e 가 같은 값을 봐야 해서 순수 모듈인 여기에 둔다.
 */
export const CLOSING_ENTRY_WINDOW_DAYS = 7;

/** `closing-seen-2026-08`. 달마다 키가 따로라 지난달 것을 지울 이유가 없다. */
function keyFor(month: string): string {
  return `closing-seen-${month}`;
}

/** 저장소가 막혀 있으면 '아직 안 봤다' 로 본다. 카드가 한 번 더 뜨는 쪽이 덜 나쁘다. */
export async function readClosingSeen(store: KeyValueStore, month: string): Promise<boolean> {
  try {
    return (await store.get(keyFor(month))) != null;
  } catch {
    return false;
  }
}

/** 저장에 실패해도 조용히 넘어간다. 결산을 보는 것 자체를 막지 않는다. */
export async function markClosingSeen(store: KeyValueStore, month: string): Promise<void> {
  try {
    await store.set(keyFor(month), '1');
  } catch {
    /* 저장소가 막힌 환경에서도 결산은 그대로 열린다. */
  }
}
