/**
 * 전면·리워드 광고 한 편이 어떻게 끝나는지 가르는 규칙.
 *
 * SDK 호출에서 **판정만 떼어 냈다.** 여기서 틀리면 광고가 뜬 채로 화면이 영영 안
 * 넘어가는데, 그 사고는 실기기에서만 보이고 재현도 어렵다. 순수 함수로 두면 표로 잰다.
 *
 * 배선은 `tossBridge.ts` 의 `runFullScreenAd` 가 한다.
 */

import type { FullScreenAdResult } from './types';

/**
 * 전면 광고를 불러오는 데 주는 시간.
 *
 * 개발자 커뮤니티에 `loaded` 도 `onError` 도 없이 한참을 기다린 사례가 여럿이다.
 * 그동안 버튼이 죽어 있으면 사람은 앱이 멈춘 줄 안다. 이 시간이 지나면 못 띄운 것으로
 * 치고 부르는 쪽이 광고 없이 지나가게 둔다.
 */
export const FULL_SCREEN_LOAD_TIMEOUT_MS = 8_000;

/**
 * 전면 광고가 뜬 뒤 **화면을 풀어 주기까지의 한계.**
 *
 * 🔴 지난 판은 90초 하나였고, 그나마 **화면이 보이는 동안만 셌다.** 광고가 우리 웹뷰를
 * 덮으면 화면은 hidden 이 되므로, 갇힌 바로 그 상황에서 시계가 한 번도 안 돌았다.
 * 「2분이 지나도 아무 반응이 없다」 는 신고가 그것이다(2026-09-25). 이제 덮여 있어도 센다.
 *
 * 전면은 실측 5초 남짓이고 끝 화면이 몇 초 더 붙는다. 15초면 제대로 도는 광고를 끊지 않는다.
 */
export const INTERSTITIAL_RELEASE_MS = 15_000;

/**
 * 리워드 광고가 뜬 뒤 화면을 풀어 주기까지의 한계.
 *
 * 리워드는 실측 30초다. 35초를 주면 끝까지 본 사람의 보상은 그 전에 도착한다.
 * 보상이 이미 왔으면 여기서 접어도 `earned` 로 나간다.
 */
export const REWARDED_RELEASE_MS = 35_000;

/**
 * 광고가 이만큼 **계속 덮고 있으면** 갇힌 것으로 본다. 그 세션의 광고를 끈다.
 *
 * 화면을 풀어 주는 시각(15·35초)과 **일부러 갈라 놓았다.** 15초에 안 끝난 광고가 전부
 * 갇힌 것은 아니다. 30초짜리 동영상 전면도 있고, 전화를 받느라 잠시 자리를 뜬 사람도 있다.
 * 그 사람들까지 갇힌 것으로 세면 세션 광고가 통째로 꺼져 수입이 사라진다(노출 한 편 7.8~10원,
 * 14일 합계가 72원이다). 화면은 먼저 풀어 주고, 판정은 90초까지 보고 내린다.
 */
export const STALL_AFTER_MS = 90_000;

/**
 * 광고가 닫혀 화면이 다시 보인 뒤, 닫힘 신호를 이만큼 더 기다린다.
 * 보상 이벤트가 화면 복귀보다 조금 늦게 오는 기기가 있어 바로 끊지 않는다.
 */
export const DISMISS_FALLBACK_MS = 2_000;

/**
 * 「광고가 지금 화면에 떠 있다」 로 읽는 이벤트.
 *
 * ⚠ **`show` 하나만 보면 안 된다.** `show` 를 안 주고 `impression` 부터 주는 조합에서
 * 닫힘 폴백이 아예 안 걸린다. 그 기기가 `dismissed` 도 안 주는 버전이면
 * (안드로이드 토스앱 5.255.0 이 그렇다) 광고가 닫혀도 화면이 영영 기다린다.
 */
const ON_SCREEN = new Set(['show', 'impression', 'clicked']);

export function marksAdOnScreen(type: string): boolean {
  return ON_SCREEN.has(type);
}

/**
 * 이 이벤트가 광고 한 편에 무엇을 하나.
 *
 * - `reward`  보상이 나왔다. **여기서 끝내지 않는다.** 닫힘이 뒤따라 오는데, 그 전에
 *   답하면 광고가 아직 화면을 덮고 있는 동안 다음 화면이 열려 그 위로 광고가 남는다
 * - `end`     닫혔다. 본 편으로 끝난다
 * - `fail`    띄우지 못했다
 */
export type AdEventEffect = 'reward' | 'end' | 'fail' | null;

export function adEventEffect(type: string): AdEventEffect {
  if (type === 'userEarnedReward') return 'reward';
  if (type === 'dismissed') return 'end';
  if (type === 'failedToShow') return 'fail';
  return null;
}

/**
 * 지금까지 본 것으로 끝맺으면 무엇인가.
 *
 * 보상이 왔으면 `earned`, 뜨기는 했으면 `watched`, 아무것도 못 봤으면 `failed`.
 * 뜬 적도 없는데 `watched` 라고 하면 광고가 한 장도 안 온 기기와 끝까지 본 사람이
 * 같은 칸에 들어간다.
 */
export function outcomeOf(state: { shown: boolean; earned: boolean }): FullScreenAdResult {
  if (state.earned) return 'earned';
  return state.shown ? 'watched' : 'failed';
}
