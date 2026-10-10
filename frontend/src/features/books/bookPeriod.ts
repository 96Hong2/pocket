/**
 * 공유 가계부의 「이번 달」.
 *
 * 가계부마다 시작일(`month_start_day`)이 있다. 기간과 그 이름(「10월」)은 개인 가계부와 같은
 * 규칙(`shared/lib/monthPeriod`)으로 만든다. 화면이 날짜 글자를 잘라 달을 짓지 않게 이 한 곳을 지난다.
 */

import type { BookOut } from '../../shared/api';
import { toLedgerDate } from '../../shared/lib/format';
import { periodContaining, type MonthPeriod } from '../../shared/lib/monthPeriod';

/** 그 날(`2026-10-05`)이 든 이 가계부의 기간. */
export function bookPeriodOn(book: Pick<BookOut, 'month_start_day'>, day: string): MonthPeriod {
  return periodContaining(day, book.month_start_day);
}

/** 오늘이 든 이 가계부의 기간. */
export function bookPeriodNow(book: Pick<BookOut, 'month_start_day'>): MonthPeriod {
  return bookPeriodOn(book, toLedgerDate(new Date()));
}
