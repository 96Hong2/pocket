/**
 * 공유 리포트 「자세히 보기」 광고를 본 날.
 *
 * 광고 한 편을 보면 그날은 모든 가계부, 모든 달의 자세히 보기가 열린다. 날짜가 바뀌면
 * 다시 잠긴다. 날짜는 가계부 시간대의 `2026-09-28` 문자열이다.
 *
 * 서버에 두지 않는다. 자세히 보기의 값은 늘 서버가 주고, 잠금은 화면의 일이다.
 * 못 읽으면 광고를 한 번 더 보자고 할 뿐이다.
 */

import type { KeyValueStore } from '../toss';

const KEY = 'ad-report-day';

export async function readReportAdDay(store: KeyValueStore): Promise<string | null> {
  try {
    const value = await store.get(KEY);
    return value == null || value === '' ? null : value;
  } catch {
    return null;
  }
}

export async function markReportAdDay(store: KeyValueStore, today: string): Promise<void> {
  try {
    await store.set(KEY, today);
  } catch {
    /* 못 남겨도 지금 화면은 열린다. 다음에 다시 잠길 뿐이다. */
  }
}

/** 오늘 이미 열었나. */
export function isReportUnlocked(storedDay: string | null, today: string): boolean {
  return storedDay != null && storedDay === today;
}
