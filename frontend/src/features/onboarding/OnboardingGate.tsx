import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';

import { useBridge, useOnboardingReport } from '../../app/providers';
import { ROUTES } from '../../app/router/routes';
import { markHomeAddPrompted } from '../../shared/lib/homeAddSeen';
import {
  markOnboardingSeen,
  readOnboardingSeen,
  takeOnboardingReplay,
} from '../../shared/lib/onboardingSeen';

import { OnboardingOverlay } from './OnboardingOverlay';

/**
 * 처음 열었을 때만 안내를 띄운다.
 *
 * 아직 모르는 동안(`null`)은 아무것도 그리지 않는다. 먼저 그렸다가 지우면 홈이 한 번
 * 깜빡이고, 안내를 이미 본 사람이 매번 그 깜빡임을 본다.
 *
 * **여는 순간 「봤다」 로 적는다.** 닫힐 때 적으면 안내를 보다가 앱을 끈 사람에게 다음에
 * 또 뜬다. 한 번뿐인 안내라 못 보고 지나치는 쪽이, 볼 때마다 다시 뜨는 쪽보다 낫다.
 *
 * **초대 화면(`/join`)에서는 비켜 선다.** 링크를 받은 사람이 할 일은 「같이 쓰기」 하나다.
 * 안내 네 장이 그 위를 덮으면 무엇을 받았는지 모른다. 이 화면에서는 「봤다」 도 적지 않는다.
 * 같이 쓰기를 누르면 초대 화면이 「봤다」 를 적어 안내가 아예 안 뜨고, 그냥 나가면 다음 화면에서
 * 지금처럼 판단한다.
 */
export function OnboardingGate() {
  const bridge = useBridge();
  const report = useOnboardingReport();
  const { pathname } = useLocation();
  const onJoin = pathname === ROUTES.join;
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    if (onJoin) {
      report(false);
      return;
    }
    let alive = true;
    void (async () => {
      const [seen, replay] = await Promise.all([
        readOnboardingSeen(bridge.storage),
        takeOnboardingReplay(bridge.storage),
      ]);
      if (!alive) return;
      const show = replay || !seen;
      setOpen(show);
      // 다른 한 번뿐인 안내들이 이 값을 보고 자기 차례를 기다린다.
      report(show);
      if (show) void markOnboardingSeen(bridge.storage);
    })();
    return () => {
      alive = false;
    };
  }, [bridge, report, onJoin]);

  if (onJoin || open !== true) return null;

  return (
    <OnboardingOverlay
      onDone={() => {
        /*
          마지막 장이 홈 화면 추가를 이미 말했다. 첫 기록 뒤 안내까지 뜨면 같은 말을 두 번
          듣는다. 안내를 건너뛴 사람도 마찬가지다: 그 사람은 안내 자체를 원하지 않았다.

          **다 적은 뒤에 닫는다.** 닫고 나서 적으면, 홈 추가 안내가 「안 봤다」 인 채로
          먼저 읽어 버려 안내를 마치자마자 「첫 기록 끝!」 이 떴다.
        */
        void markHomeAddPrompted(bridge.storage).finally(() => {
          setOpen(false);
          report(false);
        });
      }}
    />
  );
}
