import { useEffect, useRef, useState } from 'react';

import { useBridge } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { toLedgerDate } from '../../shared/lib/format';

import {
  isRemindDue,
  markRemindClosed,
  readRemindNudge,
  type RemindNudgeState,
} from './remindCadence';

/**
 * 홈의 저녁 알림 카드가 지금 설 차례인가.
 *
 * `records` 는 지금까지 적은 건수다. 아직 모르면 `null` 을 넘기고, 그동안 `due` 도 `null` 이다.
 */
export function useRemindNudge(records: number | null): {
  /** 설 차례인가. 모르는 동안은 `null`. */
  due: boolean | null;
  /** ✕ 로 닫았다. 바로 감추고 한 번 닫은 것으로 적는다. */
  close: () => void;
  /**
   * 토스 알림 동의를 거절했다. 닫은 것으로 적되 **카드는 그대로 둔다.**
   * 왜 못 켰는지 적힌 줄이 눌린 결과라서, 바로 걷으면 무엇이 됐는지 모른다.
   */
  decline: () => void;
} {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const today = toLedgerDate(new Date());
  const [saved, setSaved] = useState<{ value: RemindNudgeState | null } | null>(null);
  const [hidden, setHidden] = useState(false);
  // 거절한 뒤 ✕ 까지 누르면 한 번만 센다. 한 번의 방문에서 두 번 닫은 것이 아니다.
  const counted = useRef(false);
  const known = records != null;

  useEffect(() => {
    if (!known) return;
    let alive = true;
    void readRemindNudge(bridge.storage, today, records).then((value) => {
      if (alive) setSaved({ value });
    });
    return () => {
      alive = false;
    };
    // 한 번만 읽는다. 적을 때마다 다시 읽으면 방금 닫은 값을 덮어쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, known]);

  function count(): void {
    if (counted.current) return;
    counted.current = true;
    void markRemindClosed(bridge.storage, today, records);
  }

  return {
    due: hidden ? false : saved == null || records == null ? null : isRemindDue(saved.value, today, records),
    close: () => {
      setHidden(true);
      if (!counted.current) {
        const closes = (saved?.value?.closes ?? 0) + 1;
        analytics.log(EVENTS.remindCardDismissed, { closes }, { kind: 'click' });
      }
      count();
    },
    decline: count,
  };
}
