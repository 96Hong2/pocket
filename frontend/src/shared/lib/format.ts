/**
 * 금액·날짜 표기를 한 곳에서 만든다. 화면마다 다른 포맷이 생기지 않게 여기만 쓴다.
 */

const numberFormat = new Intl.NumberFormat('ko-KR');

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 12345 → `12,345` */
export function formatNumber(value: number): string {
  return numberFormat.format(Math.round(value));
}

/** 12345 → `12,345원` */
export function formatCurrency(value: number): string {
  return `${formatNumber(value)}원`;
}

/**
 * 부호를 앞에 붙인다. 500000 → `+500,000원`, -500 → `-500원`, 0 → `0원`.
 * 금액은 항상 양수로 저장하므로, 부호는 거래 종류를 아는 쪽에서 정해 넘긴다.
 */
export function formatSignedCurrency(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return '0원';
  const sign = rounded > 0 ? '+' : '-';
  return `${sign}${formatNumber(Math.abs(rounded))}원`;
}

/** 0.42 → `42%` */
export function formatPercent(ratio: number, fractionDigits = 0): string {
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}

// ── 날짜 ────────────────────────────────────────────────
// 서버와 주고받는 날짜는 `YYYY-MM-DD`, 월은 `YYYY-MM` 문자열이다.
// UTC 로 밀리지 않도록 항상 로컬 기준으로 만든다.

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Date → `2026-09-03` (로컬 기준) */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * 가계부가 날짜를 세는 기준 시간대.
 *
 * 서버가 '오늘'과 월 경계를 이 시간대로 판정하고(`users.timezone`, 기본값), 기기 시간대는
 * 보지 않는다. 응답에 시간대가 실려 오기 시작하면 상수 대신 그 값을 읽는다.
 */
export const LEDGER_TIME_ZONE = 'Asia/Seoul';

// sv-SE 로케일이 `YYYY-MM-DD` 를 준다. 서버가 쓰는 날짜 표기와 같은 모양이다.
const ledgerDateFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: LEDGER_TIME_ZONE,
});

/** Date → `2026-09-03` (기기가 어디에 있든 가계부 기준 시간대) */
export function toLedgerDate(date: Date): string {
  return ledgerDateFormat.format(date);
}

/** `2026-09-03` → 로컬 자정 Date */
export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Date → `2026-09` */
export function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

/** `2026-09` 를 delta 달만큼 옮긴다. -1 이면 `2026-08`. */
export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  return toMonthKey(new Date(year, month - 1 + delta, 1));
}

/** `2026-09` 또는 Date → `2026년 9월` */
export function formatMonthLabel(month: string | Date): string {
  if (typeof month === 'string') {
    const [year, monthNumber] = month.split('-').map(Number);
    return `${year}년 ${monthNumber}월`;
  }
  return `${month.getFullYear()}년 ${month.getMonth() + 1}월`;
}

/** `2026-09-03` → `9월 3일` */
export function formatDayLabel(date: string | Date): string {
  const value = typeof date === 'string' ? parseIsoDate(date) : date;
  return `${value.getMonth() + 1}월 ${value.getDate()}일`;
}

/** `2026-09-03` → `9.3` */
export function formatShortDate(date: string | Date): string {
  const value = typeof date === 'string' ? parseIsoDate(date) : date;
  return `${value.getMonth() + 1}.${value.getDate()}`;
}

/** `2026-09-03` → `수` */
export function formatWeekday(date: string | Date): string {
  const value = typeof date === 'string' ? parseIsoDate(date) : date;
  return WEEKDAYS[value.getDay()];
}

/** 오늘·어제만 말로 바꾸고 그보다 지난 날짜는 `9월 1일` 로 적는다. */
export function formatRelativeDay(date: string | Date, today: Date = new Date()): string {
  const target = typeof date === 'string' ? parseIsoDate(date) : date;
  const targetIso = toIsoDate(target);
  if (targetIso === toIsoDate(today)) return '오늘';

  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (targetIso === toIsoDate(yesterday)) return '어제';

  return formatDayLabel(target);
}
