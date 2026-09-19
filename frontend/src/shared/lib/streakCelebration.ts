/**
 * 이어서 적은 날을 축하할지, 무엇이라고 말할지.
 *
 * **7일을 채울 때마다 한 번이다.** 7·14·21일… 그 사이의 날은 아무 말도 안 한다.
 * 「오늘로 9일째」 처럼 날마다 세어 보여 주면, 하루 쉬는 순간 그 숫자가 0 으로 돌아가는
 * 것이 눈에 보인다. 이 앱은 끊긴 것을 말하지 않는다(PRD 「연속 기록 실패 표시」 금지).
 *
 * 문장과 판정을 한 곳에 둔다. 홈과 e2e 가 같은 값을 보고, 순수 모듈이라 Node 에서도 돈다.
 */

import type { KeyValueStore } from '../toss';

export const STREAK_MILESTONE_DAYS = 7;

/** 서버가 준 이어진 날. `started_on` 은 첫날이다. */
export interface StreakFact {
  started_on: string;
  days: number;
}

/** 지금 이어진 날로 닿은 가장 큰 7의 배수. 7일이 안 됐으면 null. */
export function reachedMilestone(days: number): number | null {
  const reached = Math.floor(days / STREAK_MILESTONE_DAYS) * STREAK_MILESTONE_DAYS;
  return reached >= STREAK_MILESTONE_DAYS ? reached : null;
}

/**
 * 같은 축하를 두 번 띄우지 않기 위한 표. 이어진 날의 첫날과 닿은 날 수로 만든다.
 *
 * 첫날이 들어가야 한다. 끊겼다가 다시 7일을 채운 것은 새 축하다.
 */
export function celebrationToken(streak: StreakFact, milestone: number): string {
  return `${streak.started_on}:${milestone}`;
}

/** 큰 글씨 한 줄. 7일은 「일주일」, 그 뒤는 몇 주인지로 말한다. */
export function streakLead(milestone: number): string {
  return milestone === STREAK_MILESTONE_DAYS
    ? '일주일을 다 채웠어요'
    : `${milestone / STREAK_MILESTONE_DAYS}주를 다 채웠어요`;
}

/** 작은 머리글. 무엇을 축하하는지 숫자로 적는다. */
export function streakTitle(milestone: number): string {
  return `${milestone}일 연속 기록`;
}

/**
 * 아래 한 줄. **다음 목표를 걸지 않는다.** 「이번 주도 이어가요」 는 숙제가 되고,
 * 숙제가 된 가계부는 가장 먼저 지워진다. 한 일이 얼마나 가벼웠는지만 말한다.
 */
export const STREAK_FOOT = '하루 10초씩이면 충분해요';

const SEEN_KEY = 'streak-celebrated';

/** 마지막으로 띄운 축하의 표. 못 읽으면 null 이라 한 번 더 뜬다. 덜 나쁜 쪽이다. */
export async function readCelebrated(store: KeyValueStore): Promise<string | null> {
  try {
    return (await store.get(SEEN_KEY)) ?? null;
  } catch {
    return null;
  }
}

/** 띄운 그 순간에 남긴다. 저장이 막혀도 축하 자체는 그대로 보인다. */
export async function markCelebrated(store: KeyValueStore, token: string): Promise<void> {
  try {
    await store.set(SEEN_KEY, token);
  } catch {
    /* 저장소가 막힌 환경에서도 축하는 그대로 뜬다. */
  }
}
