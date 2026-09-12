import { useEffect, useRef, useState } from 'react';

import { useBridge } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  markHomeAddPrompted,
  readHomeAddPrompted,
  takeHomeAddReplay,
} from '../../shared/lib/homeAddSeen';

import { AddToHomeSheet } from './AddToHomeSheet';

/**
 * 첫 기록을 마친 그 순간, 딱 한 번 스스로 열리는 안내.
 *
 * **첫 기록 전에는 뜨지 않는다.** 써 보지도 않은 앱을 홈 화면에 놓으라는 말은 광고로 읽힌다.
 * 한 번 적어 본 사람은 이 앱이 무엇인지 알고, 그때가 "다시 오기 쉽게 해 둘까" 를 물을
 * 유일한 순간이다.
 *
 * 처음에는 홈에 카드로 뒀는데, 목록에 섞여 있어 그냥 지나쳐졌다. 한 번뿐인 안내라면
 * 그 순간에 화면 가운데로 나와야 한다. 대신 **한 번 열리면 끝이다.** 닫는 방식과 상관없이
 * 다시 안 뜬다. 나중에 마음이 바뀌면 앱 설정에 같은 안내가 있다.
 */
export function AddToHomePrompt({
  /** 기록이 하나라도 있나. 아직 모르는 동안은 null. */
  hasAnyTransaction,
  /** 기록 시트가 열려 있는 동안. 그 위에 겹쳐 띄우면 방금 적은 결과를 가린다. */
  paused,
}: {
  hasAnyTransaction: boolean | null;
  paused: boolean;
}) {
  const bridge = useBridge();
  const analytics = useAnalytics();
  // 아직 모르는 동안(null)은 열지 않는다. 늦게 뜨는 쪽이 깜빡이는 쪽보다 낫다.
  const [prompted, setPrompted] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  /*
    **「기록이 있다」 가 아니라 「방금 첫 기록이 생겼다」 여야 한다.**

    있음/없음만 보면 어제 적고 오늘 여는 사람에게도 앱을 열자마자 뜬다. 그건 첫 기록 직후가
    아니라 그냥 방해다. 없음 → 있음으로 **바뀌는 순간**만 잡는다.
    조회가 오는 중(null)은 없음으로 세지 않는다. 그러면 새로고침마다 전이로 보인다.
  */
  const seen = useRef<boolean | null>(null);
  const [justRecorded, setJustRecorded] = useState(false);

  useEffect(() => {
    const before = seen.current;
    seen.current = hasAnyTransaction;
    if (before === false && hasAnyTransaction === true) setJustRecorded(true);
  }, [hasAnyTransaction]);

  // 앱 정보에서 「안내를 처음 상태로」 를 누른 다음이면, 전이 없이도 한 번 연다.
  useEffect(() => {
    let alive = true;
    void takeHomeAddReplay(bridge.storage).then((replay) => {
      if (alive && replay) setJustRecorded(true);
    });
    return () => {
      alive = false;
    };
  }, [bridge]);

  useEffect(() => {
    if (!justRecorded) return;
    let alive = true;
    void readHomeAddPrompted(bridge.storage).then((value) => {
      if (alive) setPrompted(value);
    });
    return () => {
      alive = false;
    };
  }, [bridge, justRecorded]);

  useEffect(() => {
    if (paused || prompted !== false) return;
    /*
      여는 순간 「봤다」 로 적는다. 닫힐 때 적으면 앱을 그대로 종료한 사람에게 다음에 또 뜬다.
      한 번뿐인 안내라 못 보고 지나치는 쪽이, 볼 때마다 다시 뜨는 쪽보다 낫다.
    */
    setPrompted(true);
    setOpen(true);
    void markHomeAddPrompted(bridge.storage);
    analytics.log(
      EVENTS.homeAddResult,
      { from: 'first_record', result: 'shown' },
      { kind: 'impression' },
    );
  }, [analytics, bridge, paused, prompted]);

  return <AddToHomeSheet open={open} onClose={() => setOpen(false)} from="first_record" />;
}
