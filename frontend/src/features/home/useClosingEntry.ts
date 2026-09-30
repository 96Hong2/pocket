import { useEffect, useState } from 'react';

import { useBridge } from '../../app/providers';
import { useClosing } from '../../shared/api';
import { CLOSING_ENTRY_WINDOW_DAYS, readClosingSeen } from '../../shared/lib/closingSeen';
import { shiftMonth, toLedgerDate } from '../../shared/lib/format';

/**
 * 홈에 결산 진입 카드를 세울 달. 안 세우면 `null`.
 *
 * 세 조건이 다 맞을 때만 달을 돌려준다: 달이 바뀐 지 며칠 안이고, 지난달에 기록이 있고, 아직 안 봤다.
 * 한 번 열어 보면 사라진다. 같은 카드가 매일 뜨면 알림이 아니라 잔소리가 된다.
 *
 * 카드와 판정을 가른 것은 홈이 **안내를 한 번에 하나만** 세우기 때문이다. 이 카드가 서는지
 * 홈이 알아야 다른 안내가 비켜 줄 수 있다.
 */
export function useClosingEntry(): string | null {
  const bridge = useBridge();
  const month = shiftMonth(toLedgerDate(new Date()).slice(0, 7), -1);
  const withinWindow = Number(toLedgerDate(new Date()).slice(8, 10)) <= CLOSING_ENTRY_WINDOW_DAYS;

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

  if (!withinWindow || seen !== false) return null;
  // 조회에 실패하면 이 자리를 비운다. 홈에서 할 일은 기록이고 결산은 곁들여 보는 것이다.
  if (closing.data == null || !closing.data.has_any_transaction) return null;
  return month;
}
