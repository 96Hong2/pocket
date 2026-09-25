/**
 * 광고 없이 읽어 주는 **맨 처음 한 장**.
 *
 * 사진 한 장은 우리가 실제로 돈을 내고 읽는다(실측 약 2.2원). 키패드로 적는 길은 공짜라
 * **값이 드는 유일한 행동**이다.
 *
 * ## 왜 「하루 한 장」 에서 「맨 처음 한 장」 으로 바꿨나 (2026-09-25)
 *
 * 하루 한 장 무료는 실측으로 거의 아무도 광고를 안 보는 설정이었다. 콘솔에서 본 사용량이
 * 한 사람당 하루 0.4~0.7장이라, **대부분의 날에 무료분 안에서 끝났다.** 거기에
 * `useInterstitial` 의 세션 상한(한 편)까지 겹쳐서, 둘째 장을 넣어도 광고가 안 뜨는 날이
 * 많았다. 우리가 원가를 내고 읽어 주는데 그 자리가 버는 돈이 사실상 0 이었다.
 *
 * 그래서 무료분을 **평생 한 장**으로 옮겼다. 처음 써 보는 사람이 「정말 읽히나」 를 광고
 * 없이 확인하는 자리는 남기고, 그 뒤로는 읽을 때마다 광고가 함께 돈다.
 *
 * | 무엇 | 광고 |
 * | --- | --- |
 * | 이 앱에서 읽는 **첫 한 장** | 없다 |
 * | 그다음부터 (한 장씩) | 읽는 동안 전면 광고 한 편 |
 * | 한 번에 여러 장 | 읽는 동안 리워드 광고 한 편 |
 *
 * 그래서 여기 남은 것은 **체험 한 장을 썼나** 하나뿐이다. 날짜도, 모아 두는 개념도 없다.
 */

import type { KeyValueStore } from '../../shared/toss';

/** 광고 없이 읽어 주는 장수. 평생 이만큼이다. */
export const TRIAL_FREE = 1;

const KEY = 'photo-trial';

/**
 * 하루 한 장 시절의 칸.
 *
 * **여기에 값이 있으면 이미 사진을 읽어 본 사람이다.** 그 칸은 실제로 읽어 낸 뒤에만
 * 쓰였다(`spend`). 안 보고 넘기면 쓰던 사람 전부가 체험 한 장을 새로 받는다.
 */
const LEGACY_KEY = 'photo-credits';

/** 저장해 둔 줄이 「썼다」 를 뜻하나. 모양이 어긋나면 안 쓴 것으로 친다. */
export function parseUsed(raw: string | null | undefined): boolean {
  return raw === 'used';
}

/**
 * 옛 칸에 값이 있었나. 있으면 그 사람은 이미 사진을 읽어 봤다.
 *
 * 값의 내용은 안 본다. `2026-09-24:0` 이든 `2026-09-24:1` 이든, 그 칸이 쓰였다는 것
 * 자체가 사진을 한 번은 읽어 냈다는 뜻이다.
 */
export function legacyMeansUsed(raw: string | null | undefined): boolean {
  return raw != null && /^\d{4}-\d{2}-\d{2}:\d+$/.test(raw);
}

/**
 * 저장소가 막힌 기기를 위한 자리.
 *
 * 못 읽으면 앱을 열 때마다 체험 한 장이 새로 들어오는 셈이 되고, 그러면 셈이 아무것도
 * 안 한다. 앱이 떠 있는 동안만이라도 이어 세도록 모듈에 들고 있는다.
 *
 * **읽기는 되고 쓰기만 막히는 기기가 있다**(용량이 찼을 때가 그렇다). 그 기기에서 저장된
 * 값만 믿으면 체험 표시가 한 번도 안 남아 사진이 영영 공짜가 된다. 그래서 한 번이라도
 * 막힌 것을 본 뒤로는 이쪽을 먼저 본다.
 */
let fallbackUsed = false;

/** 체험 한 장을 이미 썼나. 못 읽으면 안 쓴 것으로 보되, 이 세션에서 쓴 것은 기억한다. */
export async function readTrialUsed(store: KeyValueStore): Promise<boolean> {
  if (fallbackUsed) return true;
  try {
    if (parseUsed(await store.get(KEY))) return true;
    if (legacyMeansUsed(await store.get(LEGACY_KEY))) return true;
    return false;
  } catch {
    return fallbackUsed;
  }
}

/** 못 써도 조용히 넘어간다. 그 기기에서는 앱이 떠 있는 동안만 셈이 이어진다. */
export async function markTrialUsed(store: KeyValueStore): Promise<void> {
  fallbackUsed = true;
  try {
    await store.set(KEY, 'used');
  } catch {
    // 기록을 남기는 일이 사진을 읽는 일보다 중요하지 않다. 여기서 던지면 기능이 안 열린다.
    // 위에서 이미 `fallbackUsed` 를 켜 뒀으므로 앱이 떠 있는 동안은 셈이 이어진다.
  }
}

/** 테스트에서 모듈에 남은 셈을 지운다. 앱에서는 부르지 않는다. */
export function resetCreditsMemory(): void {
  fallbackUsed = false;
}
