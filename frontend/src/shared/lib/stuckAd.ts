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
