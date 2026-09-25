/**
 * 광고가 뜬 채로 갇힌 사람을 세는 자리.
 *
 * 토스가 띄우는 광고는 네이티브라 우리 웹뷰 위에 있다. **우리에게는 그것을 닫는 함수가
 * 없다**(SDK 전체 export 를 훑어 확인했다. `load` · `show` · 이벤트 구독뿐이다).
 * 그래서 갇힌 사람은 앱을 끄는 수밖에 없고, 그러면 우리 시간 제한이 무엇을 찍기도 전에
 * 웹뷰가 통째로 사라진다. **가장 나쁜 결말이 통계에서 통째로 빠진다.**
 *
 * 순서를 뒤집는다. 광고가 **뜨는 순간** 표를 적고, 정상적으로 끝나면 지운다. 다음에 앱을
 * 열었을 때 표가 남아 있으면 지난번이 그 판이었다는 뜻이다.
 *
 * ⚠ 이 수에는 광고를 보다가 그냥 앱을 끈 사람도 섞인다. 고장만 세는 것이 아니다.
 * 자리(`where`)별로 갈라 보고 튀는 자리를 찾는 데 쓴다.
 *
 * 🔴 **세는 데서 그치지 않는다**(2026-09-25 밤, 세 번째 신고). 「15초가 지나도 광고가
 * 안 꺼져서 그냥 앱을 꺼야 해」. 우리가 푸는 것은 우리 화면이고 광고는 그대로 덮고 있어,
 * 그 사람에게는 아무것도 안 바뀐 것과 같다. 그래서 갇힌 적이 쌓이면 **그 기기에서는
 * 전면 광고를 다시 안 띄운다**. 점수는 아래 `STUCK_BLOCK_SCORE` 를 본다.
 */

import type { KeyValueStore } from '../toss';

const KEY = 'ad-on-screen';

/** 표에 함께 적는 것. 어느 자리의 광고였는지 알아야 갈라 볼 수 있다. */
export interface StuckAdMark {
  where: string;
}

export function parseMark(raw: string | null | undefined): StuckAdMark | null {
  if (raw == null || raw === '') return null;
  // 옛 판이 자리 없이 표만 적었을 수 있다. 자리를 모르는 것이 안 세는 것보다 낫다.
  return { where: raw };
}

/** 광고가 화면에 떴다. 실패해도 조용히 넘어간다. 세는 일 때문에 광고가 막히면 안 된다. */
export async function markAdOnScreen(store: KeyValueStore, where: string): Promise<void> {
  try {
    await store.set(KEY, where);
  } catch {
    /* 못 적으면 그 한 판을 못 셀 뿐이다 */
  }
}

/** 광고가 정상적으로 끝났다. */
export async function clearAdOnScreen(store: KeyValueStore): Promise<void> {
  try {
    await store.remove(KEY);
  } catch {
    /* 못 지우면 다음에 한 번 잘못 세는데, 안 세는 것보다 낫다 */
  }
}

/**
 * 지난번에 갇힌 채로 끝났나. **읽으면서 지운다.**
 *
 * 안 지우면 한 번 갇힌 사람이 앱을 열 때마다 계속 세어진다.
 */
export async function takeStuckMark(store: KeyValueStore): Promise<StuckAdMark | null> {
  try {
    const mark = parseMark(await store.get(KEY));
    if (mark != null) await store.remove(KEY);
    return mark;
  } catch {
    return null;
  }
}

/** 갇힘 점수를 적는 칸. 표(`ad-on-screen`)와 달리 읽어도 안 지운다. */
const SCORE_KEY = 'ad-stuck-score';

/**
 * 이 점수부터는 그 기기에서 전면 광고를 끈다.
 *
 * **증거의 무게를 갈라 둔다.**
 *
 * - 앱이 광고에 덮인 채 죽었다 → **1점**. 고장일 수도 있고 그냥 답답해서 끈 것일 수도 있다.
 *   한 번으로 끄면 멀쩡한 기기의 광고까지 꺼져 수입이 통째로 샌다
 * - 90초까지 덮고 있는 것을 우리가 직접 봤다(`onStalled`) → **2점**. 이건 추측이 아니다.
 *   그 한 번으로 바로 끈다
 *
 * 한 사람에게서 잃는 광고 수입은 14일에 72원이다(ADR-0029). 앱을 강제로 끄게 만드는
 * 쪽이 훨씬 비싸다.
 */
export const STUCK_BLOCK_SCORE = 2;

/** 앱이 광고에 덮인 채 끝났다. 증거가 약해 1점이다. */
export const STUCK_POINTS_DIED = 1;

/** 90초까지 덮고 있는 것을 직접 봤다. 이 한 번으로 끈다. */
export const STUCK_POINTS_SEEN = STUCK_BLOCK_SCORE;

function toScore(raw: string | null | undefined): number {
  const value = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export async function readStuckScore(store: KeyValueStore): Promise<number> {
  try {
    return toScore(await store.get(SCORE_KEY));
  } catch {
    return 0;
  }
}

/** 점수를 더하고 더해진 값을 돌려준다. 못 적으면 지금 값을 그대로 돌려준다. */
export async function addStuckScore(store: KeyValueStore, points: number): Promise<number> {
  const next = (await readStuckScore(store)) + points;
  try {
    await store.set(SCORE_KEY, String(next));
  } catch {
    /* 못 적으면 이 기기에서는 다음 실행에 다시 센다 */
  }
  return next;
}
