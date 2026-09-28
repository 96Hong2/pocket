/**
 * 이 기기에서 처음으로 공유 가계부 멤버인 것을 본 날.
 *
 * `app_open` 의 `shared_days` 가 이 값에서 나온다. 같이 쓰기 시작한 사람이 며칠째 남아
 * 있는지를 코호트 질의 없이 센다. `visitLog.ts` 와 같은 생각이다.
 *
 * 한 번 적으면 바꾸지 않는다. 날짜는 가계부 시간대의 `2026-09-28` 문자열이다.
 */

import type { KeyValueStore } from '../toss';

const KEY = 'book-first-day';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** 없거나 모양이 틀렸거나 못 읽으면 null 이다. */
export async function readBookFirstDay(store: KeyValueStore): Promise<string | null> {
  try {
    const value = await store.get(KEY);
    return value != null && DAY.test(value) ? value : null;
  } catch {
    return null;
  }
}

/** 처음 한 번만 적는다. 이미 있으면 그대로 둔다. */
export async function markBookFirstDay(store: KeyValueStore, today: string): Promise<void> {
  if (!DAY.test(today)) return;
  try {
    if ((await readBookFirstDay(store)) != null) return;
    await store.set(KEY, today);
  } catch {
    /* 못 남기면 로그에 이 값이 빠질 뿐이다. */
  }
}

/**
 * 두 날짜 사이 날 수. 문자열로 센다.
 *
 * 둘 다 이미 가계부 시간대의 날짜라 UTC 자정끼리 빼면 정확히 날 수가 나온다.
 * 기기 시계가 뒤로 가 음수가 나오면 0 으로 눌러 둔다.
 */
export function daysBetweenDays(from: string, to: string): number {
  const toUtc = (day: string): number => {
    const [year, month, date] = day.split('-').map(Number);
    return Date.UTC(year, month - 1, date);
  };
  return Math.max(0, Math.round((toUtc(to) - toUtc(from)) / 86_400_000));
}
