/**
 * 가계부마다 이 기기에서 초대장을 보낸 적이 있는지 남긴다.
 *
 * 만들자마자 우리 집 홈에 「초대장을 보냈어요」 알림과 「아직 혼자예요 [초대장 보내기]」 카드가
 * 함께 떠서 서로 다른 말을 했다. 보낸 적이 있으면 카드가 「보냈어요. 들어오면 알려 드려요」 로
 * 바뀌고 다시 보내기는 작은 글씨 버튼이 된다.
 *
 * 가계부 id 만 남긴다. 이름이나 코드는 남기지 않는다.
 */

import type { KeyValueStore } from '../toss';

const KEY = 'book-invite-sent';

type SentMap = Record<string, true>;

async function readAll(store: KeyValueStore): Promise<SentMap> {
  try {
    const raw = await store.get(KEY);
    if (raw == null || raw === '') return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) return {};
    const out: SentMap = {};
    for (const [bookId, value] of Object.entries(parsed)) {
      if (value === true) out[bookId] = true;
    }
    return out;
  } catch {
    return {};
  }
}

export async function readBookInviteSent(store: KeyValueStore, bookId: string): Promise<boolean> {
  return (await readAll(store))[bookId] === true;
}

export async function markBookInviteSent(store: KeyValueStore, bookId: string): Promise<void> {
  try {
    const all = await readAll(store);
    all[bookId] = true;
    await store.set(KEY, JSON.stringify(all));
  } catch {
    /* 못 남기면 카드가 「아직 혼자예요」 로 남을 뿐이다. */
  }
}
