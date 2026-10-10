/**
 * 회비 비율 계산. 회비 시트의 막대 여럿이 같은 규칙으로 움직이게 한 곳에 둔다.
 *
 * 비율은 멤버 id → 0~100 의 10 단위 정수다. `null` 은 「똑같이」(인원수대로)다. 서버가 같은
 * 규칙(합 100, 10 단위, 지금 멤버 모두)으로 다시 본다. 부수효과 없는 함수만 둔다.
 */

export type SharePercents = Record<string, number>;

/** 막대 한 칸. 서버도 10의 배수만 받는다. */
export const PERCENT_STEP = 10;

/** 똑같이 나눌 때 한 사람 몫. 셋이면 33.3 처럼 10 단위가 아닐 수 있다. */
export function equalShare(count: number): number {
  return count <= 0 ? 0 : 100 / count;
}

/** 0~100 안으로 넣고 10 단위로 맞춘다. */
export function snapPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.min(Math.max(value, 0), 100);
  return Math.round(clamped / PERCENT_STEP) * PERCENT_STEP;
}

/** 저장된 비율이 지금 멤버 모두와 꼭 맞나. 멤버가 바뀐 뒤 남은 값이면 「똑같이」 로 본다. */
export function matchesMembers(ids: readonly string[], percents: SharePercents | null): boolean {
  if (percents == null) return false;
  const keys = Object.keys(percents);
  return keys.length === ids.length && ids.every((id) => id in percents);
}

/** 화면이 들고 있을 비율. 멤버와 안 맞으면 `null`(똑같이)이다. */
export function currentPercents(
  ids: readonly string[],
  percents: SharePercents | null | undefined,
): SharePercents | null {
  return percents != null && matchesMembers(ids, percents) ? { ...percents } : null;
}

/** 막대가 그 사람 자리에 그릴 값. 똑같이면 인원수대로 나눈 몫이다. */
export function percentOf(ids: readonly string[], percents: SharePercents | null, id: string) {
  return percents == null ? equalShare(ids.length) : (percents[id] ?? 0);
}

/**
 * 한 사람의 막대를 옮긴 뒤 비율.
 *
 * 둘이면 다른 사람이 100 에서 뺀 값으로 따라온다. 셋 이상이면 그 사람만 바뀌고, 똑같이였다면
 * 나머지는 10 단위로 맞춘 같은 몫에서 시작한다. 합이 100 이 아니면 `percentsReady` 가 막는다.
 */
export function movePercent(
  ids: readonly string[],
  percents: SharePercents | null,
  id: string,
  value: number,
): SharePercents {
  const next = snapPercent(value);
  if (ids.length === 2) {
    const other = ids[0] === id ? ids[1] : ids[0];
    return { [id]: next, [other]: 100 - next };
  }
  const start: SharePercents = {};
  for (const each of ids) start[each] = snapPercent(percentOf(ids, percents, each));
  return { ...start, [id]: next };
}

export function percentSum(percents: SharePercents): number {
  return Object.values(percents).reduce((sum, value) => sum + value, 0);
}

/** 저장할 수 있나. 똑같이는 늘 된다. 정한 비율은 합이 100 이어야 한다. */
export function percentsReady(ids: readonly string[], percents: SharePercents | null): boolean {
  if (percents == null) return true;
  return matchesMembers(ids, percents) && percentSum(percents) === 100;
}

/** 둘일 때 줄에 적는 비율 「6:4」. 셋 이상이거나 똑같이면 null 이다. */
export function pairRatioText(ids: readonly string[], percents: SharePercents | null) {
  if (ids.length !== 2 || percents == null) return null;
  return ids.map((id) => (percents[id] ?? 0) / PERCENT_STEP).join(':');
}

/** 저장된 비율과 같은가. 같으면 PATCH 에 싣지 않는다. */
export function samePercents(a: SharePercents | null, b: SharePercents | null): boolean {
  if (a == null || b == null) return a == null && b == null;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
