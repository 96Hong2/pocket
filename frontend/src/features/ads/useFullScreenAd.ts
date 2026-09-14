import { useCallback, useState } from 'react';

import { useBridge } from '../../app/providers';

/** 개발과 QR 테스트에서 쓰는 공식 테스트 전면 광고. 운영 값은 코드에 두지 않는다. */
const TEST_GROUP = 'ait-ad-test-interstitial-id';

/**
 * 전면 광고를 지나온 결과.
 *
 * - `watched`  광고가 뜨고 닫혔다
 * - `skipped`  광고 없이 지나갔다. 왜인지는 `reason` 이 말한다
 */
export type FullScreenAdOutcome =
  { result: 'watched' } | { result: 'skipped'; reason: 'no_group' | 'unsupported' | 'failed' };

/**
 * 어느 전면 광고를 띄울지.
 *
 * 배너와 같은 규칙이다. sandbox 는 공식 테스트 광고로 고정하고, 운영 값은 빌드 환경변수로만
 * 들어온다. 비어 있으면 null 이고 광고 없이 지나간다.
 */
function resolveGroup(environment: string): string | null {
  if (environment !== 'toss') return TEST_GROUP;
  const configured = import.meta.env.VITE_AD_FULLSCREEN_GROUP_ID;
  return typeof configured === 'string' && configured.trim() !== '' ? configured.trim() : null;
}

/**
 * 부가기능 앞에 세우는 전면 광고 한 편.
 *
 * **광고가 안 떠도 기능은 열린다.** 광고 서버 사정으로 사람이 예산을 못 정하게 두지 않는다.
 * 대신 무엇 때문에 지나갔는지를 결과에 담아, 부르는 쪽이 로그로 남기게 한다.
 * 광고를 보는 동안 `busy` 가 켜져 버튼을 잠근다.
 */
export function useFullScreenAd(): {
  busy: boolean;
  show: () => Promise<FullScreenAdOutcome>;
} {
  const bridge = useBridge();
  const [busy, setBusy] = useState(false);

  const show = useCallback(async (): Promise<FullScreenAdOutcome> => {
    const group = resolveGroup(bridge.environment);
    if (group == null) return { result: 'skipped', reason: 'no_group' };
    if (!bridge.supports('fullScreenAd')) return { result: 'skipped', reason: 'unsupported' };

    setBusy(true);
    try {
      const result = await bridge.ads.showFullScreen(group);
      return result === 'watched' ? { result: 'watched' } : { result: 'skipped', reason: 'failed' };
    } finally {
      setBusy(false);
    }
  }, [bridge]);

  return { busy, show };
}
