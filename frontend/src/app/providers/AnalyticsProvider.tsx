import { useEffect, useMemo, type ReactNode } from 'react';

import { EVENTS, Analytics, AnalyticsContext } from '../../shared/analytics';
import {
  STUCK_POINTS_DIED,
  addStuckScore,
  readStuckScore,
  takeStuckMark,
} from '../../shared/lib/stuckAd';

import { setDeviceStuckScore } from '../../shared/lib/stuckAdMemory';

import { useBridge } from './bridgeContext';

/**
 * 로거를 앱에 하나 놓는다.
 *
 * 세션 id 가 이 인스턴스에 붙어 있어, 다시 만들면 한 번 연 앱이 두 세션으로 세어진다.
 * 브릿지가 바뀔 때만 새로 만든다(테스트에서 목을 갈아 끼우는 경우다).
 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const bridge = useBridge();
  const analytics = useMemo(() => new Analytics(bridge), [bridge]);

  /*
    지난번이 광고에 갇힌 채 끝났는지 여기서 한 번 본다.

    **앱을 열 때 말고는 볼 자리가 없다.** 갇힌 사람은 광고가 화면을 덮은 채로 앱을 끄므로
    그 세션에서는 아무것도 못 보낸다. 읽으면서 표를 지우니 한 번만 세어진다.
  */
  useEffect(() => {
    // 개발 StrictMode 는 효과를 두 번 돌린다. 읽고 지우는 일이라 가드가 없으면 두 번 센다.
    let alive = true;
    void (async () => {
      const mark = await takeStuckMark(bridge.storage);
      if (!alive) return;
      /*
        🔴 **세고 끝내지 않는다.** 갇힌 채 끝난 판은 점수로도 쌓아, 쌓이면 이 기기에서는
        전면 광고를 아예 안 띄운다. 15초에 우리 화면만 풀어 줘 봐야 광고가 그대로 덮고
        있으면 그 사람은 앱을 끄는 수밖에 없다(2026-09-25 밤 신고).
      */
      const score =
        mark == null
          ? await readStuckScore(bridge.storage)
          : await addStuckScore(bridge.storage, STUCK_POINTS_DIED);
      if (!alive) return;
      setDeviceStuckScore(score);
      if (mark != null) analytics.log(EVENTS.adStuckExit, { where: mark.where, score });
    })();
    return () => {
      alive = false;
    };
  }, [analytics, bridge]);

  return <AnalyticsContext value={analytics}>{children}</AnalyticsContext>;
}
