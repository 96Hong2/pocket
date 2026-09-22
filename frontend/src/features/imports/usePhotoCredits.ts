/**
 * 사진 장수를 화면에 이어 주는 자리.
 *
 * 셈 자체는 `photoCredits.ts` 가 하고, 여기는 저장소·광고·로그를 묶는다.
 * 두 탭(캡처·영수증)이 같은 장수를 나눠 쓴다. 값이 드는 쪽은 사진이지 어디서 가져왔는지가
 * 아니라서, 탭마다 따로 세면 한 사람이 하루에 여섯 장을 읽게 된다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useBridge } from '../../app/providers';
import { EVENTS, useAnalytics, type FlowId } from '../../shared/analytics';
import { toLedgerDate } from '../../shared/lib/format';
import { usePhotoRewardedAd } from '../ads';

import { earned, readCredits, spent, writeCredits } from './photoCredits';

export interface PhotoCreditsHandle {
  /** 남은 장수. 아직 저장소를 못 읽었으면 `null` 이다. */
  left: number | null;
  /** 광고가 도는 중. 버튼을 잠가 두 편이 겹치지 않게 한다. */
  busy: boolean;
  /** 이 기기에서 광고를 붙일 수 있나. 못 붙이면 모으기 자리를 아예 안 그린다. */
  canEarn: boolean;
  /** 광고를 한 편 보고 한 장 받는다. */
  earnOne: () => Promise<void>;
  /** 사진 탭을 열었는데 쓸 장수가 없었다. 그 사람을 한 번만 센다. */
  markBlocked: () => void;
  /** 한 장 쓴다. 사진을 **읽어 낸 뒤에** 부른다. */
  spendOne: () => Promise<void>;
}

export function usePhotoCredits(flowId: FlowId): PhotoCreditsHandle {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const ad = usePhotoRewardedAd();
  const [left, setLeft] = useState<number | null>(null);
  // 이 기록 흐름에서 한 번만 남긴다. 탭마다 세면 한 번 막힌 사람이 둘로 잡힌다.
  const blockedLogged = useRef(false);

  useEffect(() => {
    let alive = true;
    void readCredits(bridge.storage, toLedgerDate(new Date())).then((record) => {
      if (alive) setLeft(record.count);
    });
    return () => {
      alive = false;
    };
  }, [bridge]);

  const earnOne = useCallback(async (): Promise<void> => {
    const outcome = await ad.show();
    /*
      **광고가 어떻게 끝나든 한 장을 준다.** 생활비 계산기와 같은 규칙이다(ADR-0024).

      끝까지 본 사람에게만 주자는 안을 버렸다. 리워드 수익은 노출에 붙지 완주에 붙지
      않아서 중간에 닫은 사람에게 안 준다고 우리가 더 버는 것이 없고, 광고 서버가 채울
      것을 못 찾았을 때(`skipped`)까지 막으면 우리 사정으로 사람이 하려던 일을 막는다.
      「광고 한 편 보고」 라고 적어 두고 봤는데 안 주는 화면이 제일 나쁘다.

      실제로 몇 편이 노출로 잡혔는지는 `ad` 값으로 따로 센다.
    */
    const today = toLedgerDate(new Date());
    const next = earned(await readCredits(bridge.storage, today));
    await writeCredits(bridge.storage, next);
    setLeft(next.count);
    analytics.log(
      EVENTS.photoCredit,
      {
        action: 'earned',
        left: next.count,
        ...(outcome.result === 'skipped'
          ? { ad: 'skipped', reason: outcome.reason }
          : { ad: outcome.result }),
      },
      { kind: 'click', flowId },
    );
  }, [ad, analytics, bridge, flowId]);

  const spendOne = useCallback(async (): Promise<void> => {
    const today = toLedgerDate(new Date());
    const next = spent(await readCredits(bridge.storage, today));
    await writeCredits(bridge.storage, next);
    setLeft(next.count);
    analytics.log(EVENTS.photoCredit, { action: 'spent', left: next.count }, { flowId });
  }, [analytics, bridge, flowId]);

  /*
    **막혀서 그냥 나간 사람이 안 보이면 3장이 맞는 선인지 알 수 없다.**

    광고를 보기로 한 사람은 `earned` 로 남고, 쓴 사람은 `spent` 로 남는데, 사진으로 적으러
    왔다가 장수가 없어 되돌아간 사람은 어디에도 안 남았다. 고르는 버튼 자체가 안 그려져서
    `image_pick_result` 도 안 나간다. 이 값이 잦으면 3장이 모자란 것이다.

    **한 사람을 한 번만 센다.** 두 사진 탭은 한꺼번에 떠 있고 안 보이는 쪽은 `hidden` 으로
    감출 뿐이라, 탭마다 세면 캡처에서 막히고 영수증으로 옮긴 한 사람이 둘로 잡힌다.
    시트가 살아 있는 동안이 기록 흐름 하나이므로 그 단위로 한 번만 남긴다.
  */
  const markBlocked = useCallback(() => {
    if (blockedLogged.current) return;
    blockedLogged.current = true;
    analytics.log(EVENTS.photoCredit, { action: 'blocked', left: 0 }, { flowId });
  }, [analytics, flowId]);

  return { left, busy: ad.busy, canEarn: ad.available, earnOne, spendOne, markBlocked };
}

