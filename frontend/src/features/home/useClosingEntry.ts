import { useEffect, useState } from 'react';

import { useBridge } from '../../app/providers';
import { useClosing, useCurrentPeriod } from '../../shared/api';
import {
  CLOSING_ENTRY_WINDOW_DAYS,
  markClosingSeen,
  readClosingSeen,
} from '../../shared/lib/closingSeen';
import { shiftMonth, toLedgerDate } from '../../shared/lib/format';
import { dayOfPeriod } from '../../shared/lib/monthPeriod';

/**
 * 홈에 결산 진입 카드를 세울 달.
 *
 * 세 조건이 다 맞을 때만 달을 돌려준다: 기간이 바뀐 지 며칠 안이고, 지난달에 기록이 있고, 아직 안 봤다.
 * 한 번 열어 보거나 닫으면 사라진다. 같은 카드가 매일 뜨면 알림이 아니라 잔소리가 된다.
 *
 * 카드와 판정을 가른 것은 홈이 **안내를 한 번에 하나만** 세우기 때문이다. 이 카드가 서는지
 * 홈이 알아야 다른 안내가 비켜 줄 수 있다.
 */
export function useClosingEntry(): {
  /** 세울 달. 안 세우면 `null`. */
  month: string | null;
  /** 설지 아직 모른다(기기 저장이나 결산 조회를 기다리는 중). 그동안 뒤의 안내는 기다린다. */
  unknown: boolean;
  /**
   * ✕ 로 닫았다. 연 것과 같이 그 달은 본 것으로 적는다.
   *
   * 안내가 한 번에 하나라, 닫을 길이 없으면 열어 보기 싫은 사람에게 이 카드가 달 초 이레 동안
   * 다른 안내를 모두 막는다.
   */
  dismiss: () => void;
} {
  const bridge = useBridge();
  // 달은 한 달 시작일로 센다. 시작일이 25 면 9월 25일부터 이레 동안 앞 기간(9월) 카드가 선다.
  const current = useCurrentPeriod();
  const month = shiftMonth(current.period.key, -1);
  const withinWindow =
    current.known &&
    dayOfPeriod(toLedgerDate(new Date()), current.startDay) <= CLOSING_ENTRY_WINDOW_DAYS;

  // 아직 모르는 동안(null)은 묻지 않는다. 이미 본 달이면 조회 자체를 안 한다.
  const [seen, setSeen] = useState<boolean | null>(null);
  const [year, monthNumber] = month.split('-').map(Number);
  const closing = useClosing(
    { year, month: monthNumber },
    { enabled: withinWindow && seen === false },
  );

  useEffect(() => {
    if (!withinWindow) return;
    let alive = true;
    void readClosingSeen(bridge.storage, month).then((value) => {
      if (alive) setSeen(value);
    });
    return () => {
      alive = false;
    };
  }, [bridge, month, withinWindow]);

  const dismiss = (): void => {
    setSeen(true);
    void markClosingSeen(bridge.storage, month);
  };

  if (!current.known) return { month: null, unknown: true, dismiss };
  if (!withinWindow) return { month: null, unknown: false, dismiss };
  if (seen === null) return { month: null, unknown: true, dismiss };
  if (seen) return { month: null, unknown: false, dismiss };
  if (closing.isPending) return { month: null, unknown: true, dismiss };
  // 조회에 실패하면 이 자리를 비운다. 홈에서 할 일은 기록이고 결산은 곁들여 보는 것이다.
  if (closing.data == null || !closing.data.has_any_transaction) {
    return { month: null, unknown: false, dismiss };
  }
  return { month, unknown: false, dismiss };
}
