/**
 * 사진으로 적을 수 있는 장수.
 *
 * 사진 한 장은 우리가 실제로 돈을 내고 읽는다(실측 약 2.2원). 키패드로 적는 길은 공짜라
 * **값이 드는 유일한 행동**이다. 그런데 지금까지 이 길만 상한이 없었다.
 *
 * 세는 단위를 새로 만들지 않았다. 「크레딧」·「이용권」 같은 말을 들여오면 그것이 무엇인지
 * 부터 배워야 한다. 화면에 적는 것은 **사진 몇 장**이고, 그게 곧 할 수 있는 일의 개수다.
 *
 * | 규칙 | 값 |
 * | --- | --- |
 * | 처음 열면 | 3장 |
 * | 날이 바뀌면 | 3장 아래일 때만 3장으로 채운다. 그 위는 건드리지 않는다 |
 * | 광고 한 편 | 1장. 상한 없다 |
 * | 사진 한 장을 읽으면 | 1장 |
 *
 * **하루 3장은 일반적인 쓰임에 닿지 않는 선이다.** 실측 사용량이 하루 한 장 아래라,
 * 광고는 몰아서 적는 사람에게만 보인다. 그러면서도 한 사람이 하루에 태울 수 있는 값에
 * 천장이 생긴다. 무제한이던 것이 유한해지는 것 자체가 이 장치의 목적이다.
 *
 * 날이 바뀌어도 **깎지 않는다.** 미리 모아 둘 수 있어야 「오늘 광고 세 편 보고 주말에
 * 몰아 적기」 가 성립한다. 깎으면 모을 이유가 사라지고 그 자리에서 광고를 봐야만 한다.
 */

import type { KeyValueStore } from '../../shared/toss';

/** 날이 바뀔 때 여기까지 저절로 채운다. 이 위로는 채우지도, 깎지도 않는다. */
export const DAILY_FREE = 3;

/** 광고 한 편에 몇 장. */
export const AD_GRANT = 1;

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
 * 처음 쓰는 사람과 하루가 지난 사람이 같은 길을 지난다. 둘 다 「3장 아래면 3장으로」 다.
 * 모아 둔 것이 3장을 넘으면 그대로 둔다.
 */
export function refilled(record: PhotoCredits | null, today: string): PhotoCredits {
  if (record == null) return { day: today, count: DAILY_FREE };
  if (record.day === today) return record;
  return { day: today, count: Math.max(record.count, DAILY_FREE) };
}

/** 한 장 썼을 때의 값. 0 아래로 내려가지 않는다. */
export function spent(record: PhotoCredits): PhotoCredits {
  return { day: record.day, count: Math.max(0, record.count - 1) };
}

/** 광고를 끝까지 봤을 때의 값. */
export function earned(record: PhotoCredits): PhotoCredits {
  return { day: record.day, count: record.count + AD_GRANT };
}

/**
 * 저장소가 막힌 기기를 위한 자리.
 *
 * 못 읽으면 앱을 열 때마다 3장이 새로 들어오는 셈이 되고, 그러면 셈이 아무것도 안 막는다.
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
