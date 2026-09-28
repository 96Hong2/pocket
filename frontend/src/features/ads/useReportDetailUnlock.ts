import { useCallback, useEffect, useRef, useState } from 'react';

import { useBridge } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { toLedgerDate } from '../../shared/lib/format';
import { isReportUnlocked, markReportAdDay, readReportAdDay } from '../../shared/lib/reportAdDay';

import { useReportRewardedAd } from './useFullScreenAd';

/**
 * 이 세션에서 알게 된 「광고를 본 날」. 아직 저장소를 안 읽었으면 undefined 다.
 *
 * 달이나 가계부를 바꾸면 카드가 새로 그려진다. 그때마다 저장소를 다시 읽으면 열린 카드가
 * 잠깐 잠겨 보인다. 저장소가 막힌 기기에서도 같은 세션 동안은 다시 잠그지 않는다.
 */
let knownDay: string | null | undefined;

export interface ReportDetailUnlock {
  /** 오늘 자세히 보기가 열려 있나. 저장소를 아직 못 읽었으면 null 이다. */
  unlocked: boolean | null;
  /** 광고를 띄우는 중. 버튼을 잠근다. */
  busy: boolean;
  /** 광고 한 편을 지나 연다. 광고가 어떻게 끝나든 연다. */
  unlock: () => Promise<void>;
}

/**
 * 공유 리포트 「자세히 보기」 의 잠금.
 *
 * - 광고 한 편을 보면 **그날은 모든 가계부, 모든 달**이 열린다. 날짜가 바뀌면 다시 잠긴다.
 * - 광고가 중간에 닫혔거나 못 떴어도 연다. 누른 사람을 광고 사정으로 벌하지 않는다.
 * - 이 기기에서 광고가 설 수 없으면(그룹 없음, 미지원, 갇힌 적 있음) 처음부터 열어 둔다.
 *   예고할 광고가 없는데 「광고 보고」 를 적으면 거짓말이다(ADR-0028).
 */
export function useReportDetailUnlock(): ReportDetailUnlock {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const ad = useReportRewardedAd();
  const [day, setDay] = useState<string | null | undefined>(knownDay);
  // 광고가 뜨기 전 짧은 틈에 두 번 눌리면 광고가 겹친다. busy 는 그 틈 뒤에 켜진다.
  const pending = useRef(false);

  useEffect(() => {
    if (knownDay !== undefined) return;
    let alive = true;
    void readReportAdDay(bridge.storage).then((stored) => {
      // 읽는 사이에 열었으면 그 값이 더 새롭다.
      if (knownDay === undefined) knownDay = stored;
      if (alive) setDay(knownDay);
    });
    return () => {
      alive = false;
    };
  }, [bridge]);

  const unlock = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    try {
      const outcome = await ad.show('report_detail');
      const today = toLedgerDate(new Date());
      knownDay = today;
      setDay(today);
      void markReportAdDay(bridge.storage, today);
      analytics.log(
        EVENTS.reportDetailOpened,
        outcome.result === 'skipped'
          ? { ad: 'skipped', reason: outcome.reason, book: 'shared' }
          : { ad: outcome.result, book: 'shared' },
        { kind: 'click' },
      );
    } finally {
      pending.current = false;
    }
  }, [ad, analytics, bridge]);

  // 오늘은 그릴 때마다 다시 센다. 자정을 넘겨 켜 둔 화면도 다음 그림에서 잠긴다.
  const unlocked = !ad.available
    ? true
    : day === undefined
      ? null
      : isReportUnlocked(day, toLedgerDate(new Date()));

  return { unlocked, busy: ad.busy, unlock };
}
