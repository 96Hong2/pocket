import { createContext, useContext } from 'react';

export interface BookViewContextValue {
  /** 홈이 지금 보여 주는 공유 가계부. `null` 이면 내 가계부다. */
  viewingBookId: string | null;
  /** 고른 가계부를 기기에도 남긴다. `null`(내 가계부)이면 지운다. */
  setViewingBookId(bookId: string | null): void;
  /**
   * 앱을 막 열어 어느 가계부에서 시작할지 아직 정하는 중이다. 홈은 이 동안 내 가계부를
   * 그리지 않고 기다린다. 공유 가계부에서 시작할 사람에게 빈 내 가계부가 한 번 비치지 않게.
   */
  restoring: boolean;
}

export const BookViewContext = createContext<BookViewContextValue | null>(null);

/**
 * 홈이 지금 어느 가계부를 보고 있나.
 *
 * 기록 시트의 「적을 곳」 기본값과 리포트의 첫 가계부가 이 값을 따른다. 앱을 열면 보통
 * 내 가계부에서 시작하고, 내 가계부에 적은 것이 없는 사람만 마지막에 보던 가계부에서 시작한다.
 */
export function useBookView(): BookViewContextValue {
  const value = useContext(BookViewContext);
  if (value == null) {
    throw new Error('useBookView 는 BookViewProvider 안에서만 쓸 수 있어요.');
  }
  return value;
}
