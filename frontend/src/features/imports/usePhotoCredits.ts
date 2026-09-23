/**
 * 사진을 읽는 동안 광고를 함께 돌리는 자리.
 *
 * 셈 자체는 `photoCredits.ts` 가 하고, 여기는 저장소·광고·로그를 묶는다.
 * 두 탭(캡처·영수증)이 같은 셈을 나눠 쓴다. 값이 드는 쪽은 사진이지 어디서 가져왔는지가
 * 아니라서, 탭마다 따로 세면 한 사람이 하루에 무료 두 장을 쓴다.
 *
 * **광고가 기다림을 뺏지 않는다.** 사진은 어차피 읽는 데 몇 초가 걸린다. 그 몇 초를
 * 광고가 채우는 것이지, 광고를 보고 나서 읽기 시작하는 것이 아니다. 그래서 부르는 쪽은
 * 분석 요청을 **먼저 띄우고** `play()` 를 그 위에 얹는다.
 */

import { useCallback, useEffect, useState } from 'react';

import { useBridge } from '../../app/providers';
import { EVENTS, useAnalytics, type FlowId } from '../../shared/analytics';
import { toLedgerDate } from '../../shared/lib/format';
import { useInterstitial, usePhotoRewardedAd } from '../ads';

import { readCredits, spent, writeCredits } from './photoCredits';

/**
 * 이번 읽기에 어떤 광고가 함께 도는가.
 *
 * - `none`          오늘 무료분이다. 아무것도 안 뜬다
 * - `interstitial`  한 장인데 무료분을 이미 썼다. 짧은 전면 광고
 * - `rewarded`      한 번에 여러 장이다. 읽는 데 오래 걸려서 긴 광고가 들어간다
 *
 * **여러 장에 긴 광고를 붙인 것은 시간이 길어서다.** 다섯 장을 읽는 데 30초쯤 걸리는데
 * 짧은 광고를 붙이면 광고가 끝나고도 사람이 빈 화면을 본다. 값 쪽도 맞다. 다섯 장이면
 * 우리가 11원을 쓰고 리워드 한 편이 10원이다.
 */
export type PhotoAdPlan = 'none' | 'interstitial' | 'rewarded';

export interface PhotoCreditsHandle {
  /** 오늘 광고 없이 읽을 수 있는 장수. 아직 저장소를 못 읽었으면 `null` 이다. */
  free: number | null;
  /** 광고가 도는 중. 버튼을 잠가 두 편이 겹치지 않게 한다. */
  busy: boolean;
  /** 이번에 고른 장수라면 어떤 광고가 함께 도는가. */
  planFor: (count: number) => PhotoAdPlan;
  /** 광고를 띄운다. 분석 요청을 먼저 띄운 뒤에 부른다. */
  play: (plan: PhotoAdPlan, count: number) => Promise<void>;
  /** 확인 창에서 「닫기」 를 눌렀다. 몇 사람이 광고를 마다하는지 센다. */
  markDeclined: (plan: PhotoAdPlan, count: number) => void;
  /** 읽어 낸 뒤에 부른다. 무료분을 그만큼 깎는다. */
  spend: (count: number) => Promise<void>;
}

export function usePhotoCredits(flowId: FlowId): PhotoCreditsHandle {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const rewarded = usePhotoRewardedAd();
  /*
    짧은 쪽은 상한을 함께 센다. 관리 탭에서 이미 한 편을 본 사람이 사진에서 또 보지
    않는다. 긴 쪽(리워드)은 상한 밖이다. 무엇을 치르는지 먼저 읽고 스스로 누른 자리라
    「오늘 이미 보셨어요」 라고 답하면 우리가 약속을 깨는 셈이 된다(ADR-0024).
  */
  const interstitial = useInterstitial();
  const [free, setFree] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void readCredits(bridge.storage, toLedgerDate(new Date())).then((record) => {
      if (alive) setFree(record.count);
    });
    return () => {
      alive = false;
    };
  }, [bridge]);

  const planFor = useCallback(
    (count: number): PhotoAdPlan => {
      /*
        여러 장은 긴 광고다. 그 그룹을 못 쓰는 기기에서는 짧은 쪽으로 내려간다.
        읽는 데 30초가 걸리는 일에 아무것도 안 붙이는 것보다는 낫고, 어차피 확인 창이
        무엇이 나오는지 먼저 말한다.
      */
      if (count > 1) {
        if (rewarded.available) return 'rewarded';
        return interstitial.ready ? 'interstitial' : 'none';
      }
      /*
        아직 저장소를 못 읽었으면(`null`) 무료분이 남은 것으로 본다. 버튼이 그동안
        잠겨 있어 여기까지 오는 일은 거의 없고, 넘어와도 손해는 사진 한 장이다.
        반대로 두면 무료분이 남은 사람에게 광고를 물린다.
      */
      if (free == null || free > 0) return 'none';
      // 광고를 못 띄우는 기기에서 사진을 막지 않는다. 우리 사정으로 기능을 닫는 셈이 된다.
      return interstitial.ready ? 'interstitial' : 'none';
    },
    [free, interstitial.ready, rewarded.available],
  );

  const play = useCallback(
    async (plan: PhotoAdPlan, count: number): Promise<void> => {
      if (plan === 'none') return;
      const outcome =
        plan === 'rewarded' ? await rewarded.show() : await interstitial.show('photo');
      analytics.log(
        EVENTS.photoCredit,
        {
          action: 'watched',
          plan,
          image_count: count,
          ...(outcome.result === 'skipped'
            ? { ad: 'skipped', reason: outcome.reason }
            : { ad: outcome.result }),
        },
        { kind: 'click', flowId },
      );
    },
    [analytics, flowId, interstitial, rewarded],
  );

  const markDeclined = useCallback(
    (plan: PhotoAdPlan, count: number): void => {
      /*
        **마다한 사람이 안 보이면 이 자리가 맞는지 알 수 없다.** 광고를 본 사람은
        `watched` 로 남고 읽은 사람은 `spent` 로 남는데, 확인 창을 보고 되돌아간 사람은
        어디에도 안 남았다. 이 값이 잦으면 광고가 아니라 자리가 틀린 것이다.
      */
      analytics.log(
        EVENTS.photoCredit,
        { action: 'declined', plan, image_count: count },
        { kind: 'click', flowId },
      );
    },
    [analytics, flowId],
  );

  const spend = useCallback(
    async (count: number): Promise<void> => {
      const today = toLedgerDate(new Date());
      const next = spent(await readCredits(bridge.storage, today), count);
      await writeCredits(bridge.storage, next);
      setFree(next.count);
      analytics.log(
        EVENTS.photoCredit,
        { action: 'spent', left: next.count, image_count: count },
        { flowId },
      );
    },
    [analytics, bridge, flowId],
  );

  return {
    free,
    busy: rewarded.busy || interstitial.busy,
    planFor,
    play,
    markDeclined,
    spend,
  };
}
