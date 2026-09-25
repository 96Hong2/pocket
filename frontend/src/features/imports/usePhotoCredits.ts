/**
 * 사진을 읽는 동안 광고를 함께 돌리는 자리.
 *
 * 셈 자체는 `photoCredits.ts` 가 하고, 여기는 저장소·광고·로그를 묶는다.
 * 두 탭(캡처·영수증)이 같은 셈을 나눠 쓴다. 값이 드는 쪽은 사진이지 어디서 가져왔는지가
 * 아니라서, 탭마다 따로 세면 체험 한 장을 두 번 쓴다.
 *
 * **광고가 기다림을 뺏지 않는다.** 사진은 어차피 읽는 데 몇 초가 걸린다. 그 몇 초를
 * 광고가 채우는 것이지, 광고를 보고 나서 읽기 시작하는 것이 아니다. 그래서 부르는 쪽은
 * 분석 요청을 **먼저 띄우고** `play()` 를 그 위에 얹는다.
 */

import { useCallback, useEffect, useState } from 'react';

import { useBridge } from '../../app/providers';
import { EVENTS, useAnalytics, type FlowId } from '../../shared/analytics';
import { useInterstitial, usePhotoRewardedAd } from '../ads';

import { markTrialUsed, readTrialUsed } from './photoCredits';

/**
 * 이번 읽기에 어떤 광고가 함께 도는가.
 *
 * - `none`          체험 한 장이거나, 이 기기에 광고가 안 붙는다
 * - `interstitial`  한 장. 읽는 동안 짧은 전면 광고
 * - `rewarded`      한 번에 여러 장이다. 읽는 데 오래 걸려서 긴 광고가 들어간다
 *
 * **여러 장에 긴 광고를 붙인 것은 시간이 길어서다.** 짧은 광고를 붙이면 광고가 끝나고도
 * 사람이 빈 화면을 볼 수 있다. 값 쪽도 맞다. 다섯 장이면 우리가 11원을 쓰고
 * 리워드 한 편이 10원이다.
 */
export type PhotoAdPlan = 'none' | 'interstitial' | 'rewarded';

export interface PhotoCreditsHandle {
  /**
   * 광고 없이 읽어 주는 체험 한 장이 아직 남았나. 저장소를 못 읽었으면 `null` 이다.
   *
   * 이 앱에서 사진을 한 번도 안 읽어 본 사람만 참이다. 날이 바뀌어도 안 돌아온다.
   */
  trial: boolean | null;
  /** 광고가 도는 중. 버튼을 잠가 두 편이 겹치지 않게 한다. */
  busy: boolean;
  /** 이번에 고른 장수라면 어떤 광고가 함께 도는가. */
  planFor: (count: number) => PhotoAdPlan;
  /** 광고를 띄운다. 분석 요청을 먼저 띄운 뒤에 부른다. */
  play: (plan: PhotoAdPlan, count: number) => Promise<void>;
  /** 확인 창에서 「닫기」 를 눌렀다. 몇 사람이 광고를 마다하는지 센다. */
  markDeclined: (plan: PhotoAdPlan, count: number) => void;
  /** 광고는 돌았는데 읽기가 실패했다. 다음 한 번은 광고 없이 읽는다. */
  markWasted: (plan: PhotoAdPlan, count: number) => void;
  /** 이미 치른 광고가 있어 다음 한 번은 공짜다. 화면이 그 사실을 적을 때 쓴다. */
  owed: boolean;
  /** 읽어 낸 뒤에 부른다. 체험 한 장을 썼으면 그 표시를 남긴다. */
  spend: (count: number) => Promise<void>;
}

export function usePhotoCredits(flowId: FlowId): PhotoCreditsHandle {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const rewarded = usePhotoRewardedAd();
  /*
    **상한 밖에서 띄운다**(`uncapped`). 사진은 고른 뒤에 확인 창이 무엇을 치르는지 먼저
    말하고 사람이 스스로 누르는 자리라, 「오늘 이미 보셨어요」 라고 답할 이유가 없다.
    리워드 쪽과 같은 규칙이다(ADR-0024).

    상한 안에 두면 실제로 광고가 거의 안 떴다. 세션당 한 편이라 둘째 장부터 광고를 붙여도
    관리 탭에서 한 편 본 사람에게는 아무것도 안 떴다.
  */
  const interstitial = useInterstitial();
  /** 체험 한 장이 남았나. 저장소를 읽어야 안다. */
  const [trial, setTrial] = useState<boolean | null>(null);
  /*
    **치른 광고 한 편은 한 번만 받는다.** 광고는 읽기 요청과 겹쳐 돌아서, 읽기가 실패해도
    사용자는 이미 끝까지 봤다. 그 상태에서 다시 누를 때 또 틀면 우리 쪽 사정으로 값을 두 번
    받는 셈이 된다. 사용자가 「광고까지 다 봤는데 자꾸 실패한다」 고 신고한 자리다.
  */
  const [owed, setOwed] = useState(false);

  useEffect(() => {
    let alive = true;
    void readTrialUsed(bridge.storage).then((used) => {
      if (alive) setTrial(!used);
    });
    return () => {
      alive = false;
    };
  }, [bridge]);

  const planFor = useCallback(
    (count: number): PhotoAdPlan => {
      // 앞선 시도에서 이미 한 편 치렀다. 읽어 낼 때까지는 더 받지 않는다.
      if (owed) return 'none';
      /*
        여러 장은 긴 광고다. 그 그룹을 못 쓰는 기기에서는 짧은 쪽으로 내려간다.
        오래 걸리는 일에 아무것도 안 붙이는 것보다는 낫고, 어차피 확인 창이
        무엇이 나오는지 먼저 말한다.
      */
      if (count > 1) {
        if (rewarded.available) return 'rewarded';
        return interstitial.available ? 'interstitial' : 'none';
      }
      /*
        아직 저장소를 못 읽었으면(`null`) 체험이 남은 것으로 본다. 버튼이 그동안
        잠겨 있어 여기까지 오는 일은 거의 없고, 넘어와도 손해는 사진 한 장이다.
        반대로 두면 처음 써 보는 사람에게 첫 장부터 광고를 물린다.
      */
      if (trial == null || trial) return 'none';
      /*
        광고를 못 띄우는 기기에서 사진을 막지 않는다. 우리 사정으로 기능을 닫는 셈이 된다.
        **`ready` 가 아니라 `available` 을 본다.** 이 자리는 상한 밖이라, 상한까지 본
        `ready` 로 가르면 관리 탭에서 한 편 본 사람에게 확인 창이 안 뜨고 광고만 뜬다.
      */
      return interstitial.available ? 'interstitial' : 'none';
    },
    [interstitial.available, owed, rewarded.available, trial],
  );

  const play = useCallback(
    async (plan: PhotoAdPlan, count: number): Promise<void> => {
      if (plan === 'none') return;
      const outcome =
        plan === 'rewarded'
          ? await rewarded.show()
          : await interstitial.show('photo', { uncapped: true });
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

  const markWasted = useCallback(
    (plan: PhotoAdPlan, count: number): void => {
      setOwed(true);
      /*
        **이 값이 늘면 광고는 도는데 읽기가 안 되는 것이다.** `watched` 는 그대로 쌓이고
        `spent` 만 안 쌓이는 상태라, 둘만 보면 무엇이 어긋났는지 가려내는 데 시간이 걸린다.
      */
      analytics.log(EVENTS.photoCredit, { action: 'wasted', plan, image_count: count }, { flowId });
    },
    [analytics, flowId],
  );

  const spend = useCallback(
    async (count: number): Promise<void> => {
      /*
        체험 한 장은 **읽어 낸 뒤에** 쓴 것으로 친다. 고른 순간에 표시하면 읽기가 실패한
        사람이 체험도 잃고 결과도 없이 나간다.
      */
      if (trial !== false) {
        await markTrialUsed(bridge.storage);
        setTrial(false);
      }
      // 읽어 냈으니 치른 값을 받은 셈이다. 다음부터는 다시 평소대로 묻는다.
      setOwed(false);
      analytics.log(EVENTS.photoCredit, { action: 'spent', image_count: count }, { flowId });
    },
    [analytics, bridge, flowId, trial],
  );

  return {
    trial,
    owed,
    busy: rewarded.busy || interstitial.busy,
    planFor,
    play,
    markDeclined,
    markWasted,
    spend,
  };
}
