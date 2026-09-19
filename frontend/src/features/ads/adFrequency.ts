/**
 * 전면 광고를 하루에 몇 번까지 볼지.
 *
 * 자리를 넷으로 늘리면서 상한을 함께 둔다. 자리마다 「여기는 괜찮다」 고 생각해 하나씩
 * 더하면, 한 사람이 겪는 총량은 아무도 안 세게 된다. 그 총량을 여기 한 곳에서 센다.
 *
 * **세는 것은 실제로 본 광고뿐이다.** 채울 광고가 없거나 실패해서 그냥 지나간 경우는
 * 사람의 시간을 쓰지 않았으므로 세지 않는다. 그래야 광고가 안 붙는 기기에서 상한만
 * 차올라 정작 붙었을 때 못 보여 주는 일이 없다.
 */

import type { KeyValueStore } from '../../shared/toss';

/** 앱을 연 한 번에 볼 수 있는 편 수. */
export const SESSION_CAP = 1;

/** 하루에 볼 수 있는 편 수. 세션을 여러 번 열어도 이 선을 넘지 않는다. */
export const DAILY_CAP = 2;

const DAY_KEY = 'ad-fullscreen-day';

/** 그날 몇 편을 봤나. 날짜가 바뀌면 처음부터 다시 센다. */
export interface DayCount {
  /** 가계부 날짜(`2026-09-19`). 기기 시간대가 아니라 장부 시간대로 끊는다. */
  day: string;
  count: number;
}

/** 저장해 둔 줄을 읽는다. 모양이 어긋나면 없는 것으로 친다. */
export function parseDayCount(raw: string | null | undefined): DayCount | null {
  if (raw == null) return null;
  const [day, rest] = raw.split(':');
  const count = Number(rest);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(count) || count < 0) return null;
  return { day, count };
}

export function formatDayCount(value: DayCount): string {
  return `${value.day}:${value.count}`;
}

/** 오늘 한 편 더 봐도 되나. 어제 것은 세지 않는다. */
export function allowedToday(record: DayCount | null, today: string): boolean {
  if (record == null || record.day !== today) return true;
  return record.count < DAILY_CAP;
}

/** 한 편을 본 뒤의 값. 날이 바뀌었으면 1 부터 시작한다. */
export function countedToday(record: DayCount | null, today: string): DayCount {
  if (record == null || record.day !== today) return { day: today, count: 1 };
  return { day: today, count: record.count + 1 };
}

/**
 * 저장소에서 오늘 기록을 읽는다.
 *
 * **막혀 있으면 없는 것으로 친다.** 못 읽었다고 광고를 막으면, 저장소가 조용히 안 되는
 * 기기에서 이 앱의 유일한 수익 자리가 통째로 사라진다. 그래도 세션 상한은 살아 있어서
 * 한 번에 여러 편이 뜨지는 않는다.
 */
export async function readDayCount(store: KeyValueStore): Promise<DayCount | null> {
  try {
    return parseDayCount(await store.get(DAY_KEY));
  } catch {
    return null;
  }
}

/** 못 써도 조용히 넘어간다. 다음 세션에 한 편 더 볼 뿐이다. */
export async function writeDayCount(store: KeyValueStore, value: DayCount): Promise<void> {
  try {
    await store.set(DAY_KEY, formatDayCount(value));
  } catch {
    // 광고 집계는 기록보다 덜 중요하다. 여기서 던지면 기능이 안 열린다.
  }
}
