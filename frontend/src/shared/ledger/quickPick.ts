/**
 * 기록 화면 앞자리에 설 분류를 고르는 규칙.
 *
 * 화면 코드가 아니라 여기에 두는 이유는 e2e 가 같은 숫자를 다시 적지 않게 하려는 것이다.
 * 부수효과 없는 상수·순수 함수만 둔다.
 */

import type { CategoryOut } from '../api';

/**
 * 앞자리에 세우는 개수.
 *
 * 열둘째 칸은 「더 보기」가 쓴다. 3열 격자라 열한 개 + 더 보기가 딱 네 줄이다.
 * 분류가 늘수록 고르기가 어려워지는 것이 문제였다. 다 보여 주는 대신 **앞자리를 좁힌다.**
 */
export const QUICK_LIMIT = 11;

export interface QuickSplit {
  /** 접혀 있을 때 보이는 것. 최대 QUICK_LIMIT 개. */
  front: CategoryOut[];
  /** 「더 보기」 뒤에 있는 것. 꺼 둔 분류와 열한 개를 넘긴 것이 함께 들어온다. */
  rest: CategoryOut[];
}

/**
 * 앞자리와 그 뒤로 가른다. 목록 순서는 서버가 준 그대로 쓴다(사용자가 정한 순서다).
 *
 * 꺼 둔 분류(`is_quick=false`)는 개수와 무관하게 뒤로 간다. 없애는 것이 아니라 뒤로만
 * 보내는 것이라, 「더 보기」를 열면 그대로 고를 수 있다.
 */
export function splitQuick(categories: CategoryOut[]): QuickSplit {
  const front: CategoryOut[] = [];
  const rest: CategoryOut[] = [];
  for (const category of categories) {
    if (category.is_quick && front.length < QUICK_LIMIT) front.push(category);
    else rest.push(category);
  }
  return { front, rest };
}

/** 자주 쓴 순서. 같은 횟수면 지금 순서를 지킨다(안정 정렬이라 손이 기억한 자리가 덜 흔들린다). */
export function byUsage(categories: CategoryOut[]): CategoryOut[] {
  return [...categories].sort((a, b) => b.usage_count - a.usage_count);
}
