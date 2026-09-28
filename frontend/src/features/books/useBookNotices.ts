import { useEffect, useState } from 'react';

import { useBridge } from '../../app/providers';
import type { BookOut } from '../../shared/api';
import {
  bookNotices,
  readBookSeen,
  snapshotBook,
  writeBookSeen,
  type BookNotice,
} from '../../shared/lib/bookSeenState';

/** 읽고 쓰기를 한 줄로 세운다. 겹치면 같은 알림이 두 번 나오거나 한 번도 안 나온다. */
let queue: Promise<unknown> = Promise.resolve();

function noticeKey(notice: BookNotice): string {
  return notice.kind === 'joined' ? `joined:${notice.memberId}` : 'ended';
}

/**
 * 우리 집 홈 맨 위 한 번뿐인 알림(「준호님이 들어왔어요」).
 *
 * 지난번에 이 기기에서 본 모습과 지금을 견주고, 곧바로 지금 모습으로 덮는다. 그래서 따로
 * 닫을 것이 없다. 화면이 떠 있는 동안 다시 읽어 누가 들어오면 그때도 한 줄이 는다.
 */
export function useBookNotices(book: BookOut | undefined): BookNotice[] {
  const bridge = useBridge();
  const [shown, setShown] = useState<{ bookId: string; items: BookNotice[] }>({
    bookId: '',
    items: [],
  });
  const bookId = book?.id ?? null;
  const snapshot = book == null ? '' : JSON.stringify(snapshotBook(book));

  useEffect(() => {
    if (book == null) return;
    const current = book;
    queue = queue.then(async () => {
      const previous = await readBookSeen(bridge.storage, current.id);
      const fresh = bookNotices(previous, current);
      await writeBookSeen(bridge.storage, current.id, snapshotBook(current));
      if (fresh.length === 0) return;
      // 화면이 먼저 닫혔어도 그대로 둔다. 이미 본 것으로 적었으니 여기서 버리면 영영 안 뜬다.
      setShown((prev) => {
        const kept = prev.bookId === current.id ? prev.items : [];
        const known = new Set(kept.map(noticeKey));
        return {
          bookId: current.id,
          items: [...kept, ...fresh.filter((notice) => !known.has(noticeKey(notice)))],
        };
      });
    });
    // 모습(멤버·끝남)이 바뀔 때만 견준다. 다시 읽을 때마다 새 객체가 와도 같은 모습이면 넘어간다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, snapshot, bridge]);

  return shown.bookId === bookId ? shown.items : [];
}
