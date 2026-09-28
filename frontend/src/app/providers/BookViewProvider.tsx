import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { ApiError, queryKeys, useBooks, useBudget, useMe } from '../../shared/api';
import { markBookFirstDay } from '../../shared/lib/bookFirstDay';
import {
  readBookLastViewed,
  resolveStartBook,
  writeBookLastViewed,
} from '../../shared/lib/bookLastViewed';
import { toLedgerDate } from '../../shared/lib/format';
import { withJosa } from '../../shared/lib/josa';

import { useBridge } from './bridgeContext';
import { BookViewContext } from './bookViewContext';
import { useIdentity } from './identityContext';
import { useToast } from './toastContext';

/** 어디서 시작할지 이보다 오래 못 정하면 내 가계부에서 시작한다. 서버가 멀어도 홈은 선다. */
const RESTORE_LIMIT_MS = 5_000;

/**
 * 홈이 보고 있는 가계부를 앱에 하나만 둔다.
 *
 * **앱을 열면 보통 내 가계부에서 시작한다.** 공유 가계부를 보던 채로 앱을 닫고 다시 열었을 때
 * 내 기록이 그 가계부 화면에 섞여 적히는 일을 막는다.
 * 예외는 **내 가계부에 적은 것이 하나도 없는 사람**이다. 초대받아 우리 집만 쓰는 사람이
 * 빈 내 가계부 홈으로 열리면 다음 「기록하기」 가 내 가계부로 잘못 간다. 이 사람은
 * 마지막에 보던 가계부(`book-last-viewed`)가 아직 쓰는 가계부면 거기서 시작한다.
 * 그걸 정하는 동안(`restoring`) 홈은 내 가계부를 그리지 않고 기다린다. 깜빡임을 막는다.
 *
 * **보던 가계부가 사라지면 내 가계부로 돌린다.** 관리자가 지웠거나, 내보내졌거나, 다른 기기에서
 * 나간 경우다. 목록을 다시 읽었을 때 그 가계부가 빠져 있으면 한 줄로 알린다. 목록에서 한 번이라도
 * 본 가계부만 센다. 방금 만든 가계부는 목록이 따라오기 전에도 보고 있을 수 있어서다.
 *
 * 우리 집 화면이 다시 읽다가 404 를 받으면 목록을 다시 읽어 위 판정을 앞당긴다.
 */
export function BookViewProvider({ children }: { children: ReactNode }) {
  const bridge = useBridge();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { state: identity } = useIdentity();
  const me = useMe();
  const books = useBooks();
  const [viewingBookId, setViewing] = useState<string | null>(null);
  /** 기기에 남은 마지막 가계부. `undefined` 는 아직 읽는 중이다. */
  const [remembered, setRemembered] = useState<string | null | undefined>(undefined);
  /** 어디서 시작할지 정했나. 정하기 전에 누가 먼저 고르면(초대 합류, 만들기) 그 선택을 따른다. */
  const [restored, setRestored] = useState(false);
  /** 목록에서 본 적 있는 가계부 id 와 이름. 사라졌을 때 이름으로 알린다. */
  const known = useRef(new Map<string, string>());
  const firstDayMarked = useRef(false);

  // 내 가계부에 적은 것이 있나. 기억해 둔 가계부가 있을 때만 묻는다. 홈과 같은 키라 한 번만 간다.
  const budget = useBudget(undefined, { enabled: remembered != null && !restored });
  const items = books.data?.items;

  const setViewingBookId = useCallback(
    (bookId: string | null) => {
      setRestored(true);
      setViewing(bookId);
      void writeBookLastViewed(bridge.storage, bookId);
    },
    [bridge],
  );

  useEffect(() => {
    let alive = true;
    void readBookLastViewed(bridge.storage).then((value) => {
      if (alive) setRemembered(value);
    });
    const timer = setTimeout(() => {
      if (alive) setRestored(true);
    }, RESTORE_LIMIT_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [bridge]);

  /*
    어디서 시작할지 정한다. 효과로 미루지 않고 그리는 중에 정한다. 미루면 한 번 더 그리는 사이
    내 가계부 홈이 한 프레임 비친다.
  */
  if (!restored && remembered !== undefined) {
    const start = resolveStartBook({
      remembered,
      unavailable:
        identity.status === 'unsupported' ||
        identity.status === 'failed' ||
        me.isError ||
        me.data?.shared_books_enabled === false ||
        books.isError ||
        budget.isError,
      books: items,
      hasPersonalRecords: budget.data?.has_any_transaction,
    });
    if (start !== undefined) {
      setRestored(true);
      if (start != null) setViewing(start);
    }
  }

  useEffect(() => {
    if (items == null) return;
    const present = new Set(items.map((book) => book.id));

    if (viewingBookId != null && !present.has(viewingBookId)) {
      const name = known.current.get(viewingBookId);
      if (name != null) {
        setViewingBookId(null);
        toast.show({ text: `${withJosa(name, '을/를')} 더 볼 수 없어요` });
      }
    }

    for (const book of items) known.current.set(book.id, book.name);

    // 같이 쓰기 시작한 날. 앱을 연 로그가 며칠째인지 싣는다.
    if (!firstDayMarked.current && items.some((book) => !book.ended)) {
      firstDayMarked.current = true;
      void markBookFirstDay(bridge.storage, toLedgerDate(new Date()));
    }
  }, [items, viewingBookId, toast, bridge, setViewingBookId]);

  useEffect(() => {
    if (viewingBookId == null) return;
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'error') return;
      const [root, scope, bookId] = event.query.queryKey;
      if (root !== 'pocket' || scope !== 'book' || bookId !== viewingBookId) return;
      const error = event.action.error;
      if (error instanceof ApiError && error.status === 404) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.books() });
      }
    });
  }, [queryClient, viewingBookId]);

  const value = useMemo(
    () => ({ viewingBookId, setViewingBookId, restoring: !restored }),
    [viewingBookId, setViewingBookId, restored],
  );

  return <BookViewContext value={value}>{children}</BookViewContext>;
}
