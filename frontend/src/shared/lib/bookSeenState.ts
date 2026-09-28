/**
 * 공유 가계부를 마지막으로 봤을 때의 모습을 기기에 남긴다.
 *
 * 우리 집 홈의 한 번뿐인 알림(「준호님이 들어왔어요」·「은홍님이 가계부를 끝냈어요」)이 이 값과
 * 지금 모습을 견줘서 나온다. 한 번 보여 주고 곧바로 지금 모습으로 덮는다. 따로 닫을 것이 없다.
 *
 * 서버에 두지 않는다. 알림은 이 기기에서 본 적이 있나의 문제이고, 못 읽으면 알림이
 * 한 번 빠질 뿐이다. 처음 보는 가계부는 알림 없이 모습만 적는다.
 */

import type { BookOut } from '../api';
import type { KeyValueStore } from '../toss';

const KEY = 'book-seen-state';

/** 가계부 하나를 본 모습. 멤버 id 와 끝났는지만 남긴다. 이름은 남기지 않는다. */
export interface BookSeen {
  members: string[];
  ended: boolean;
}

export type BookNotice =
  { kind: 'joined'; memberId: string; name: string } | { kind: 'ended'; name: string | null };

type SeenMap = Record<string, BookSeen>;

function isSeen(value: unknown): value is BookSeen {
  if (typeof value !== 'object' || value == null) return false;
  const candidate = value as Partial<BookSeen>;
  return (
    Array.isArray(candidate.members) &&
    candidate.members.every((id) => typeof id === 'string') &&
    typeof candidate.ended === 'boolean'
  );
}

async function readAll(store: KeyValueStore): Promise<SeenMap> {
  try {
    const raw = await store.get(KEY);
    if (raw == null || raw === '') return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) return {};
    const out: SeenMap = {};
    for (const [bookId, value] of Object.entries(parsed)) {
      if (isSeen(value)) out[bookId] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** 그 가계부를 본 적이 없거나 못 읽으면 null 이다. */
export async function readBookSeen(store: KeyValueStore, bookId: string): Promise<BookSeen | null> {
  const all = await readAll(store);
  return all[bookId] ?? null;
}

export async function writeBookSeen(
  store: KeyValueStore,
  bookId: string,
  seen: BookSeen,
): Promise<void> {
  try {
    const all = await readAll(store);
    all[bookId] = seen;
    await store.set(KEY, JSON.stringify(all));
  } catch {
    /* 못 남기면 다음에 같은 알림이 한 번 더 뜰 뿐이다. */
  }
}

/** 지금 모습. 나간 멤버는 빼고 센다. */
export function snapshotBook(book: BookOut): BookSeen {
  return {
    members: book.members.filter((member) => !member.left).map((member) => member.id),
    ended: book.ended,
  };
}

/**
 * 지난번에 본 뒤로 바뀐 것.
 *
 * 처음 보는 가계부는 아무 말도 안 한다. 방금 만들었거나 방금 들어온 사람에게
 * 「누가 들어왔어요」 를 쏟아 내지 않는다. 나 자신과 내가 끝낸 것도 알리지 않는다.
 */
export function bookNotices(previous: BookSeen | null, book: BookOut): BookNotice[] {
  if (previous == null) return [];
  const known = new Set(previous.members);
  const notices: BookNotice[] = [];

  for (const member of book.members) {
    if (member.left || member.is_me || known.has(member.id)) continue;
    notices.push({ kind: 'joined', memberId: member.id, name: member.name ?? '' });
  }

  if (book.ended && !previous.ended && book.my_role !== 'owner') {
    const owner = book.members.find((member) => member.role === 'owner' && !member.left);
    notices.push({ kind: 'ended', name: owner?.name ?? null });
  }

  return notices.filter((notice) => notice.kind === 'ended' || notice.name !== '');
}
