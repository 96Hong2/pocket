import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { useBridge } from '../../app/providers';
import { ROUTES } from '../../app/router/routes';
import { useClosing } from '../../shared/api';
import { CLOSING_ENTRY_WINDOW_DAYS, readClosingSeen } from '../../shared/lib/closingSeen';
import { formatMonthLabel, shiftMonth, toLedgerDate } from '../../shared/lib/format';

/**
 * 홈에 놓는 결산 진입 카드.
 *
 * 세 조건이 다 맞을 때만 뜬다: 달이 바뀐 지 며칠 안이고, 지난달에 기록이 있고, 아직 안 봤다.
 * 한 번 열어 보면 사라진다. 같은 카드가 매일 뜨면 알림이 아니라 잔소리가 된다.
 *
 * **저절로 열리지 않는다.** 누르면 그때 리포트로 가서 결산이 열린다.
 */
export function ClosingEntryCard() {
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

  return (
    <Link className="home-closing" to={`${ROUTES.report}?month=${month}&closing=1`}>
      <span className="home-closing__title">{formatMonthLabel(month)} 결산이 도착했어요</span>
      <span className="home-closing__hint">잘한 것부터 열어봐요</span>
    </Link>
  );
}
