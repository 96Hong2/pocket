/**
 * 오늘 광고 없이 읽을 수 있는 사진 장수.
 *
 * 사진 한 장은 우리가 실제로 돈을 내고 읽는다(실측 약 2.2원). 키패드로 적는 길은 공짜라
 * **값이 드는 유일한 행동**이다.
 *
 * **2026-09-23 에 3장에서 1장으로 내렸다.** 3장은 아무도 안 닿는 선이었다. 콘솔 실측으로
 * 한 사람이 하루에 넣는 사진이 0.4~0.7장이라, 천장이 한 번도 안 걸렸고 그래서 이 장치가
 * 버는 돈이 0 이었다. 동시에 **막는 방식도 버렸다.** 예전에는 다 쓰면 「오늘은 여기까지」
 * 라고 막고 광고를 봐야 한 장을 더 줬는데, 지금은 막지 않는다. 두 장째부터는 **읽는 동안**
 * 광고가 함께 돌 뿐이다(`usePhotoCredits` 의 `planFor`).
 *
 * | 무엇 | 광고 |
 * | --- | --- |
 * | 오늘 첫 한 장 | 없다 |
 * | 두 장째부터 (한 장씩) | 읽는 동안 전면 광고 한 편 |
 * | 한 번에 여러 장 | 읽는 동안 리워드 광고 한 편 |
 *
 * 그래서 여기 남은 것은 **오늘 무료분을 썼나** 하나뿐이다. 모아 두는 개념도 함께 없앴다.
 * 광고가 장수를 주지 않으니 모을 것이 없다.
 */

import type { KeyValueStore } from '../../shared/toss';

/** 날이 바뀌면 여기까지 채운다. 오늘 광고 없이 읽을 수 있는 장수다. */
export const DAILY_FREE = 1;

const KEY = 'photo-credits';

/** 남은 장수와, 그 장수를 마지막으로 채운 날. */
export interface PhotoCredits {
  /** 가계부 날짜(`2026-09-22`). 기기 시간대가 아니라 장부 시간대로 끊는다. */
  day: string;
  count: number;
}

/** 저장해 둔 줄을 읽는다. 모양이 어긋나면 없는 것으로 친다. */
export function parseCredits(raw: string | null | undefined): PhotoCredits | null {
  if (raw == null) return null;
  const [day, rest] = raw.split(':');
  // `Number('')` 은 0 이고 정수다. 값이 잘려 저장되면 그날이 0장으로 잠긴다.
  if (rest == null || rest.trim() === '') return null;
  const count = Number(rest);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(count) || count < 0) return null;
  return { day, count };
}

export function formatCredits(value: PhotoCredits): string {
  return `${value.day}:${value.count}`;
}

/**
 * 오늘 기준으로 채운 값.
 *
 * 처음 쓰는 사람과 하루가 지난 사람이 같은 길을 지난다. 둘 다 오늘치로 새로 채운다.
 *
 * **옛 판이 모아 둔 장수는 버린다.** 3장 제도에서 광고를 보고 모아 둔 사람이 있을 수
 * 있는데, 그 장수를 그대로 들고 오면 오늘 무료분이 며칠씩 이어진다. 세는 뜻이 달라져서
 * 같은 숫자를 다른 의미로 읽게 된다.
 */
export function refilled(record: PhotoCredits | null, today: string): PhotoCredits {
  if (record != null && record.day === today) {
    // 오늘 것이라도 옛 판이 남긴 큰 수는 오늘치로 깎는다. 안 그러면 오늘 하루가 3장이다.
    return { day: today, count: Math.min(record.count, DAILY_FREE) };
  }
  return { day: today, count: DAILY_FREE };
}

/** 사진 `count` 장을 읽었을 때의 값. 0 아래로 내려가지 않는다. */
export function spent(record: PhotoCredits, count = 1): PhotoCredits {
  return { day: record.day, count: Math.max(0, record.count - count) };
}

/**
 * 저장소가 막힌 기기를 위한 자리.
 *
 * 못 읽으면 앱을 열 때마다 무료 한 장이 새로 들어오는 셈이 되고, 그러면 셈이 아무것도 안 한다.
 * 앱이 떠 있는 동안만이라도 이어 세도록 모듈에 들고 있는다. 앱을 다시 열면 사라지는데,
 * 실제로 값을 내는 것은 우리가 세는 숫자가 아니라 광고라 손해는 광고 한 편이다.
 *
 * **읽기는 되고 쓰기만 막히는 기기가 있다**(용량이 찼을 때가 그렇다). 그 기기에서 저장된 값만
 * 믿으면 차감이 한 번도 안 남아 사진이 무제한이 된다. 그래서 한 번이라도 막힌 것을 본 뒤로는
 * 이쪽을 먼저 본다. 반대로 저장소가 멀쩡한 기기에서는 이 값을 아예 안 본다.
 */
let fallback: PhotoCredits | null = null;
let storageBroken = false;

/** 오늘 기준 남은 장수를 읽는다. 읽으면서 채운다. */
export async function readCredits(store: KeyValueStore, today: string): Promise<PhotoCredits> {
  let stored: PhotoCredits | null = null;
  try {
    stored = parseCredits(await store.get(KEY));
  } catch {
    storageBroken = true;
  }
  const base = storageBroken ? (fallback ?? stored) : stored;
  const next = refilled(base, today);
  fallback = next;
  return next;
}

/** 못 써도 조용히 넘어간다. 그 기기에서는 앱이 떠 있는 동안만 셈이 이어진다. */
export async function writeCredits(store: KeyValueStore, value: PhotoCredits): Promise<void> {
  fallback = value;
  try {
    await store.set(KEY, formatCredits(value));
  } catch {
    // 기록을 남기는 일이 사진을 읽는 일보다 중요하지 않다. 여기서 던지면 기능이 안 열린다.
    // 다만 막혔다는 것은 기억한다. 안 그러면 다음 읽기가 옛 값을 다시 읽어 차감이 증발한다.
    storageBroken = true;
  }
}

/** 테스트에서 모듈에 남은 셈을 지운다. 앱에서는 부르지 않는다. */
export function resetCreditsMemory(): void {
  fallback = null;
  storageBroken = false;
}
