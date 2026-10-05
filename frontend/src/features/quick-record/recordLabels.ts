import type { CSSProperties } from 'react';

import type { TagOut } from '../../shared/api';
import { formatDayLabel, formatWeekday, shiftDay } from '../../shared/lib/format';
import { tagColorVar, tagInkVar } from '../../shared/lib/tagColors';

/** 첫 화면과 「언제예요?」 가 함께 쓰는 가까운 사흘. */
export const NEAR_DAYS = [
  { delta: 0, word: '오늘' },
  { delta: -1, word: '어제' },
  { delta: -2, word: '그저께' },
] as const;

/** `2026-10-05` → `10월 5일 (일)` */
export function dayWithWeekday(day: string): string {
  return `${formatDayLabel(day)} (${formatWeekday(day)})`;
}

/** 오늘, 어제, 그저께면 그 말. 그 밖의 날은 `null`. */
export function nearDayWord(day: string, today: string): string | null {
  return NEAR_DAYS.find((item) => shiftDay(today, item.delta) === day)?.word ?? null;
}

/** 태그 칩 색. 고른 칩은 이 색으로 채운다. */
export function tagStyle(tag: TagOut): CSSProperties {
  return {
    '--tag-color': tagColorVar(tag.color),
    '--tag-ink': tagInkVar(tag.color),
  } as CSSProperties;
}
