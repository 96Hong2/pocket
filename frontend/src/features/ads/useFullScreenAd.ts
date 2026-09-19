import { useCallback, useState } from 'react';

import { useBridge } from '../../app/providers';
import type { AdsBridge } from '../../shared/toss';

/**
 * 개발에서 쓰는 공식 테스트 전면 광고.
 *
 * **운영 번들에는 이 문자열이 실리면 안 된다.** 콘솔 검토가 번들 안을 훑어 테스트 광고 ID 를
 * 찾아내고, 나오면 반려한다(2026-09-16 에 실제로 반려됐다). 실행할 때 갈라서는 늦다.
 * `import.meta.env.DEV` 는 vite 가 빌드 때 `false` 로 갈아 끼우므로 이 가지가 통째로 지워진다.
 *
 * 리워드 자리도 이 값을 쓴다. 리워드용 공식 테스트 ID 는 확인된 것이 없어서, 이름을 지어내는
 * 대신 확인된 전면 테스트 ID 로 대신 띄운다. 개발에서는 보상 이벤트가 안 오므로 실기기
 * 개발 빌드에서 리워드 자리는 `watched` 로 끝난다(브라우저는 목이 `earned` 로 답한다).
 */
const TEST_GROUP = import.meta.env.DEV ? 'ait-ad-test-interstitial-id' : null;

/**
 * 전면 광고를 지나온 결과.
 *
 * - `watched`  광고가 뜨고 닫혔다
 * - `skipped`  광고 없이 지나갔다. 왜인지는 `reason` 이 말한다
 */
export type FullScreenAdOutcome =
  | { result: 'watched' }
  | { result: 'skipped'; reason: 'no_group' | 'unsupported' | 'failed' };

/**
 * 리워드 광고를 지나온 결과.
 *
 * - `earned`   끝까지 보고 보상까지 받았다
 * - `watched`  떴지만 보상 전에 닫았다
 * - `skipped`  광고 없이 지나갔다
 */
export type RewardedAdOutcome =
  | { result: 'earned' }
  | { result: 'watched' }
  | { result: 'skipped'; reason: 'no_group' | 'unsupported' | 'failed' };

/**
 * 어느 광고 그룹을 띄울지.
 *
 * 배너와 같은 규칙이다. 운영 값은 빌드 환경변수로만 들어오고, 비어 있으면 null 이라
 * 광고 없이 지나간다. `toss` 가 아닌 판은 개발 빌드에서만 테스트 광고로 간다.
 * 운영 번들에서는 `TEST_GROUP` 이 null 이라 그 자리도 광고 없이 지나간다.
 */
function resolveGroup(environment: string, configured: unknown): string | null {
  if (environment !== 'toss') return TEST_GROUP;
  return typeof configured === 'string' && configured.trim() !== '' ? configured.trim() : null;
}

/**
 * 광고 한 편을 띄우고 지나온 자리를 알려 준다.
 *
 * **광고가 안 떠도 기능은 열린다.** 광고 서버 사정으로 사람이 하려던 일을 못 하게 두지
 * 않는다. 대신 무엇 때문에 지나갔는지를 결과에 담아, 부르는 쪽이 로그로 남기게 한다.
 * 광고를 보는 동안 `busy` 가 켜져 버튼을 잠근다.
 */
function useAdShow(
  configured: unknown,
  run: (ads: AdsBridge, group: string) => Promise<'earned' | 'watched' | 'failed'>,
): { busy: boolean; show: () => Promise<RewardedAdOutcome> } {
  const bridge = useBridge();
  const [busy, setBusy] = useState(false);

  const show = useCallback(async (): Promise<RewardedAdOutcome> => {
    const group = resolveGroup(bridge.environment, configured);
    if (group == null) return { result: 'skipped', reason: 'no_group' };
    if (!bridge.supports('fullScreenAd')) return { result: 'skipped', reason: 'unsupported' };

    setBusy(true);
    try {
      const result = await run(bridge.ads, group);
      return result === 'failed' ? { result: 'skipped', reason: 'failed' } : { result };
    } finally {
      setBusy(false);
    }
  }, [bridge, configured, run]);

  return { busy, show };
}

const runFullScreen = (ads: AdsBridge, group: string) => ads.showFullScreen(group);
const runRewarded = (ads: AdsBridge, group: string) => ads.showRewarded(group);

/**
 * 부가기능 앞에 세우는 전면 광고 한 편.
 *
 * 화면이 직접 부르지 않는다. 총량을 세는 `useInterstitial()` 만 이걸 쓴다.
 */
export function useFullScreenAd(): {
  busy: boolean;
  show: () => Promise<FullScreenAdOutcome>;
} {
  const { busy, show } = useAdShow(import.meta.env.VITE_AD_FULLSCREEN_GROUP_ID, runFullScreen);

  const showInterstitial = useCallback(async (): Promise<FullScreenAdOutcome> => {
    const outcome = await show();
    // 전면형 그룹에서 보상 이벤트가 올 일은 없다. 와도 「봤다」 와 다를 것이 없다.
    return outcome.result === 'earned' ? { result: 'watched' } : outcome;
  }, [show]);

  return { busy, show: showInterstitial };
}

/**
 * 사람이 스스로 광고와 맞바꾸는 자리에 세우는 리워드 광고 한 편.
 *
 * 상한(`useInterstitial`)을 지나지 않는다. 상한은 **안 물어보고 끼어드는 광고**로부터
 * 사람을 지키는 장치인데, 여기는 무엇을 받는지 먼저 읽고 스스로 누른 자리다.
 * 그 사람에게 「오늘 이미 두 편 보셨어요」 라고 답하면 약속을 우리가 깨는 셈이 된다.
 */
export function useRewardedAd(): {
  busy: boolean;
  show: () => Promise<RewardedAdOutcome>;
} {
  return useAdShow(import.meta.env.VITE_AD_REWARDED_GROUP_ID, runRewarded);
}
