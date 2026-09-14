import { useEffect, useState } from 'react';

import { useBridge } from '../../app/providers';
import {
  markCardDismissed,
  readCardDismissed,
  type DismissibleCard,
} from '../../shared/lib/cardDismiss';

/**
 * 홈 카드를 닫아 둔 사실을 읽고 쓴다.
 *
 * 아직 모르는 동안(`null`)은 감추지 않는다. 늦게 사라지는 쪽이, 없어야 할 카드가 한 번
 * 깜빡였다가 사라지는 쪽보다 눈에 덜 띈다.
 *
 * `mark` 는 「이 상황」을 가리키는 값이다. 닫을 때 적어 둔 것과 달라지면 다시 뜬다.
 * 상황을 가르지 않는 카드는 빈 문자열을 넘긴다.
 */
export function useCardDismiss(
  card: DismissibleCard,
  mark: string,
): { hidden: boolean; dismiss: () => void } {
  const bridge = useBridge();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    /*
      표가 바뀌어 다시 읽는 동안에는 앞의 답을 그대로 둔다. 여기서 `null` 로 되돌리면
      카드가 한 번 깜빡이고, 표가 바뀌는 일 자체가 드물어 그 깜빡임만 남는다.
    */
    void readCardDismissed(bridge.storage, card, mark).then((value) => {
      if (alive) setDismissed(value);
    });
    return () => {
      alive = false;
    };
  }, [bridge, card, mark]);

  return {
    hidden: dismissed === true,
    dismiss: () => {
      // 화면부터 바꾼다. 저장이 늦거나 막혀도 누른 대로 사라져야 한다.
      setDismissed(true);
      void markCardDismissed(bridge.storage, card, mark);
    },
  };
}
