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

import { useCallback, useEffect, useState } from 'react';

import { useBridge } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { toLedgerDate } from '../../shared/lib/format';
import type { KeyValueStore } from '../../shared/toss';

import { SESSION_CAP, allowedToday, countedToday, readDayCount, writeDayCount } from './adFrequency';
import { useFullScreenAd, type FullScreenAdOutcome } from './useFullScreenAd';

/**
 * 전면 광고가 서는 자리.
 *
 * 전부 **관리 탭에서 눌러 들어가는 하위 화면**이다. 기록하는 길 위에는 하나도 없다.
 * 홈·달력·리포트처럼 매일 지나는 자리와, 목표를 홈 카드로 여는 길에는 서지 않는다.
 *
 * 자리를 고른 기준은 ADR-0028 그대로다: **누르기 전에 적어 둘 자리가 있는가.**
 * 여섯 자리 전부 사람이 누르는 버튼이 앞에 있고, 그 버튼 곁에 광고를 미리 적어 둔다.
 * 탭을 누르는 것만으로 광고가 뜨는 자리는 여전히 하나도 없다.
 *
 * 자리를 늘려도 **한 사람이 겪는 총량은 그대로다**(`SESSION_CAP`·`DAILY_CAP`).
 * 관리 탭에서 이것저것 눌러 봐도 한 세션에 한 편이고, 그 뒤로는 예고 줄까지 사라진다.
 *
 * 생활비 계산기는 여기 없다. 광고와 기능을 맞바꾸겠다고 사람이 먼저 누르는 자리라
 * 리워드 광고(`useRewardedAd`)로 나갔고, 그래서 상한도 안 센다(ADR-0024).
 * 사진 크레딧도 같은 이유로 여기 없다(`usePhotoRewardedAd`).
 */
export type InterstitialWhere =
  | 'closing'
  | 'goal'
  | 'categories'
  | 'tags'
  | 'recurring'
  | 'assets';

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
  /**
   * 지금 이 기기에서 한 편이 더 설 수 있나.
   *
   * **예고를 적을지 말지를 이 값으로 가른다.** 상한을 이미 채웠거나 광고 그룹이 없는
   * 기기에서 「짧은 광고가 지나가요」 라고 적어 두면, 아무 일도 안 일어나는데 사람만
   * 한 번 망설이게 된다. 적어 둔 것이 실제와 다르면 그것도 예고가 아니다.
   *
   * 첫 그림에서는 아직 모른다(저장소를 읽어야 안다). 그동안은 **뜬다고 본다.**
   * 자세한 이유는 `allowedByDay` 의 첫값에 적어 뒀다.
   */
  ready: boolean;
  show: (where: InterstitialWhere, options?: ShowOptions) => Promise<InterstitialOutcome>;
} {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const { busy, available, show: showAd } = useFullScreenAd();
  /*
    저장소를 읽어야 아는 값이라 이것만 상태로 둔다. 나머지 둘은 그릴 때 그 자리에서 센다.

    **참으로 시작한다.** 거짓으로 두면 저장소를 읽는 사이에 예고 줄이 없다가 생기고,
    그만큼 아래가 통째로 내려앉는다. 손가락이 이미 내려오는 중이면 다른 것을 누른다.
    하루 상한을 채운 사람은 드물고, 그 사람만 예고 줄이 한 번 사라지는 것을 본다.
    반대로 두면 **모든 사람이** 매번 화면이 뛰는 것을 본다.
  */
  const [allowedByDay, setAllowedByDay] = useState(true);
  // 광고를 한 편 보고 나면 상한이 줄어든다. 그 뒤에 다시 세라고 알리는 표시다.
  const [round, setRound] = useState(0);
  /*
    세션에 몇 편을 봤는지는 모듈 변수다. 그릴 때 읽어도 되는 이유는 이 값이 `show()`
    안에서만 바뀌고, 바뀐 직후 `round` 를 올려 다시 그리기 때문이다.
  */
  const capped = watchedThisSession >= SESSION_CAP;
  const ready = available && !capped && allowedByDay;

  useEffect(() => {
    if (!available || capped) return;
    let alive = true;
    void readDayCount(bridge.storage).then((record) => {
      if (alive) setAllowedByDay(allowedToday(record, toLedgerDate(new Date())));
    });
    return () => {
      alive = false;
    };
  }, [available, bridge, capped, round]);

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
      // 본 편 수가 바뀌었을 수 있다. 예고 줄을 다시 세게 한다.
      setRound((value) => value + 1);
      analytics.log(EVENTS.interstitialResult, {
        where,
        result: outcome.result,
        ...(outcome.result === 'skipped' ? { reason: outcome.reason } : {}),
      });
      return outcome;
    },
    [analytics, bridge, showAd],
  );

  return { busy, ready, show };
}
