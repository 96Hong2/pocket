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
 * 전면 광고가 서는 자리.
 *
 * 기록하는 흐름에는 하나도 없다. 전부 「잠깐 멈춰도 되는 곳」 이다: 계산기를 열기 전,
 * 지난달을 돌아보기 전, 자산을 들여다보러 들어올 때, 옛날 달을 한참 훑을 때.
 */
export type InterstitialWhere = 'budget_calc' | 'closing' | 'assets' | 'report_months';

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
