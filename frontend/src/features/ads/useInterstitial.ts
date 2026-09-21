/**
 * 상한을 지키며 전면 광고를 띄우는 자리.
 *
 * 화면은 `useFullScreenAd` 를 직접 부르지 않고 이쪽을 부른다. 띄울지 말지를 자리마다
 * 따로 판단하면 한 사람이 겪는 총량을 아무도 안 세게 되고, 그러면 하루에 네 편을 보는
 * 사람이 생긴다.
 *
 * **광고가 안 떠도 기능은 열린다.** 여기가 돌려주는 값은 「열어도 되나」 가 아니라
 * 「광고를 보고 왔나」 다. 부르는 쪽은 결과와 상관없이 하던 일을 이어서 한다.
 */

import { useCallback } from 'react';

import { useBridge } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { toLedgerDate } from '../../shared/lib/format';
import type { KeyValueStore } from '../../shared/toss';

import { SESSION_CAP, allowedToday, countedToday, readDayCount, writeDayCount } from './adFrequency';
import { useFullScreenAd, type FullScreenAdOutcome } from './useFullScreenAd';

/**
 * 전면 광고가 서는 자리. **지금은 결산 하나뿐이다.**
 *
 * 세 자리였다. 자산 탭에 들어올 때와 리포트에서 옛날 달을 세 번 훑었을 때가 더 있었는데,
 * 둘 다 **사람이 광고를 부른 적이 없는 자리**였다. 탭을 눌렀더니 광고가 뜨고, 달을
 * 넘기다 광고가 뜬다. 토스 노출 가이드가 「광고가 나오는 시점과 광고를 본 뒤 얻는
 * 내용을 미리 알리라」 고 하는 것이 정확히 이 모양을 두고 하는 말이라 둘을 뺐다.
 *
 * 결산만 남긴 이유는 **누르는 버튼이 있어서**다. 버튼에 광고가 한 편 지나간다고 적어 둘
 * 자리가 있으면 예고가 되고, 없으면 기습이 된다. 두 자리에는 배너가 그대로 서 있다.
 *
 * 생활비 계산기는 여기 없다. 광고와 기능을 맞바꾸겠다고 사람이 먼저 누르는 자리라
 * 리워드 광고(`useRewardedAd`)로 나갔고, 그래서 상한도 안 센다(ADR-0024).
 */
export type InterstitialWhere = 'closing';

/** 지나온 결과. `capped` 는 상한에 걸려 광고를 아예 부르지 않은 것이다. */
export type InterstitialOutcome = FullScreenAdOutcome | { result: 'skipped'; reason: 'capped' };

/**
 * 이 세션에서 실제로 본 편 수.
 *
 * 모듈에 두는 이유는 그것이 곧 세션의 수명이기 때문이다. 화면을 다시 불러오면 0 으로
 * 돌아가고, 탭을 오가는 동안에는 이어진다. 저장소에 두면 앱을 닫았다 열어도 남아서
 * 「세션」 이 아니라 두 번째 하루 상한이 된다.
 */
let watchedThisSession = 0;

/** 이 세션에서 이미 물어본 자리. 한 번만 묻기로 한 자리가 다시 묻지 않게 한다. */
const askedThisSession = new Set<InterstitialWhere>();

export interface ShowOptions {
  /**
   * 이 세션에 한 번만 물을까.
   *
   * 「첫 진입」·「세 번째 이동」 처럼 조건이 되풀이되는 자리에 쓴다. 광고가 안 떠서 그냥
   * 지나간 경우에도 다시 묻지 않는다. 안 그러면 같은 자리를 오갈 때마다 다시 걸린다.
   */
  oncePerSession?: boolean;
}

const CAPPED: InterstitialOutcome = { result: 'skipped', reason: 'capped' };

async function runGate(
  store: KeyValueStore,
  showAd: () => Promise<FullScreenAdOutcome>,
): Promise<InterstitialOutcome> {
  if (watchedThisSession >= SESSION_CAP) return CAPPED;

  const today = toLedgerDate(new Date());
  const record = await readDayCount(store);
  if (!allowedToday(record, today)) return CAPPED;

  const outcome = await showAd();
  if (outcome.result !== 'watched') return outcome;

  watchedThisSession += 1;
  /*
    날짜를 **다시 잰다.** 광고는 몇 초 걸린다. 23시 59분에 시작해 자정을 넘겨 닫힌 한 편을
    어제 칸에 세면, 그 사람은 새 날 첫 1분에 상한 하나를 이미 쓴 셈이 된다.
  */
  const closedOn = toLedgerDate(new Date());
  const current = closedOn === today ? record : await readDayCount(store);
  await writeDayCount(store, countedToday(current, closedOn));
  return outcome;
}

export function useInterstitial(): {
  busy: boolean;
  show: (where: InterstitialWhere, options?: ShowOptions) => Promise<InterstitialOutcome>;
} {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const { busy, show: showAd } = useFullScreenAd();

  const show = useCallback(
    async (where: InterstitialWhere, options?: ShowOptions): Promise<InterstitialOutcome> => {
      /*
        같은 자리를 또 물은 것은 상한에 걸린 것이 아니라 그 자리의 조건이 다시 참이 된
        것뿐이다. 이것까지 로그로 남기면 자리별 수치가 화면을 다시 그린 횟수를 세게 된다.
      */
      if (options?.oncePerSession === true) {
        if (askedThisSession.has(where)) return CAPPED;
        askedThisSession.add(where);
      }

      const outcome = await runGate(bridge.storage, showAd);
      analytics.log(EVENTS.interstitialResult, {
        where,
        result: outcome.result,
        ...(outcome.result === 'skipped' ? { reason: outcome.reason } : {}),
      });
      return outcome;
    },
    [analytics, bridge, showAd],
  );

  return { busy, show };
}
