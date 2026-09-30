import { useEffect, useState } from 'react';

import { useBridge } from '../../app/providers';
import { markQuietDay, readQuietDay } from '../../shared/lib/cardDismiss';
import { toLedgerDate } from '../../shared/lib/format';

/**
 * 오늘 권유 카드를 하나 닫았나. 닫았으면 오늘은 다른 권유를 새로 세우지 않는다.
 *
 * 모르는 동안(`null`)은 막지 않는다. `useCardDismiss` 와 같은 쪽으로 기운다.
 */
export function useNudgeQuiet(): { quiet: boolean; hush: () => void } {
  const bridge = useBridge();
  const today = toLedgerDate(new Date());
  const [quietDay, setQuietDay] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void readQuietDay(bridge.storage).then((value) => {
      if (alive) setQuietDay(value);
    });
    return () => {
      alive = false;
    };
  }, [bridge]);

  return {
    quiet: quietDay === today,
    hush: () => {
      setQuietDay(today);
      void markQuietDay(bridge.storage, today);
    },
  };
}
