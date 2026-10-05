/**
 * 예산과 리포트의 「한 달」.
 *
 * 사용자가 정한 시작일(1 ~ 28)에 시작해 다음 달 시작일 전날에 끝난다. 1 이면 달력 월이다.
 * 기간의 이름(「10월」)은 그 기간에 날이 가장 많이 든 달이다. 시작일이 15 이하면 시작한 달,
 * 16 이상이면 끝나는 달이다. 서버 `domain/period.py` 와 같은 규칙이고 같은 표로 시험한다.
 *
 * 날짜는 `2026-09-25`, 이름 달은 `2026-10` 문자열로만 다룬다. 기기 시간대를 타지 않는다.
 */

export const DEFAULT_START_DAY = 1;
export const MIN_START_DAY = 1;
export const MAX_START_DAY = 28;
/** 이 날부터 시작하면 기간의 날 대부분이 다음 달에 든다. 그래서 끝나는 달 이름을 붙인다. */
const NAMED_BY_END_FROM = 16;

export interface MonthPeriod {
  /** 이름 달. `2026-10` */
  key: string;
  /** 첫날. `2026-09-25` */
  start: string;
  /** 끝날. `2026-10-24` */
  end: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function monthKey(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

function shift(year: number, month: number, delta: number): [number, number] {
  const index = year * 12 + (month - 1) + delta;
  return [Math.floor(index / 12), (index % 12) + 1];
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function clampStartDay(startDay: number): number {
  if (!Number.isInteger(startDay)) return DEFAULT_START_DAY;
  return Math.min(Math.max(startDay, MIN_START_DAY), MAX_START_DAY);
}

/** 그 달 `startDay` 일에 시작하는 한 달. */
function starting(year: number, month: number, startDay: number): MonthPeriod {
  const start = `${monthKey(year, month)}-${pad(startDay)}`;
  const end =
    startDay === 1
      ? `${monthKey(year, month)}-${pad(daysInMonth(year, month))}`
      : (() => {
          const [ny, nm] = shift(year, month, 1);
          return `${monthKey(ny, nm)}-${pad(startDay - 1)}`;
        })();
  const [ky, km] = startDay >= NAMED_BY_END_FROM ? shift(year, month, 1) : [year, month];
  return { key: monthKey(ky, km), start, end };
}

/** 이름이 `month`(`2026-10`)인 한 달. */
export function periodOfMonth(month: string, startDay: number): MonthPeriod {
  const day = clampStartDay(startDay);
  const [year, monthNumber] = month.split('-').map(Number);
  const [sy, sm] = day >= NAMED_BY_END_FROM ? shift(year, monthNumber, -1) : [year, monthNumber];
  return starting(sy, sm, day);
}

/** 그 날(`2026-10-05`)이 든 한 달. */
export function periodContaining(day: string, startDay: number): MonthPeriod {
  const start = clampStartDay(startDay);
  const [year, month, date] = day.split('-').map(Number);
  const [sy, sm] = date < start ? shift(year, month, -1) : [year, month];
  return starting(sy, sm, start);
}

function dayIndex(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date) / 86_400_000;
}

/** 그 날이 기간의 며칠째인가. 첫날이 1. */
export function dayOfPeriod(day: string, startDay: number): number {
  return dayIndex(day) - dayIndex(periodContaining(day, startDay).start) + 1;
}

function dayWords(day: string): { month: number; date: number } {
  const [, month, date] = day.split('-').map(Number);
  return { month, date };
}

/** `9.25 ~ 10.24` */
export function formatPeriodRange(period: MonthPeriod): string {
  const start = dayWords(period.start);
  const end = dayWords(period.end);
  return `${start.month}.${start.date} ~ ${end.month}.${end.date}`;
}

/** `10월은 9월 25일부터 10월 24일까지예요`. 같은 달에 끝나면 끝 쪽 달을 뺀다. */
export function describePeriod(period: MonthPeriod): string {
  const name = Number(period.key.slice(5, 7));
  const start = dayWords(period.start);
  const end = dayWords(period.end);
  const until = start.month === end.month ? `${end.date}일` : `${end.month}월 ${end.date}일`;
  return `${name}월은 ${start.month}월 ${start.date}일부터 ${until}까지예요`;
}
