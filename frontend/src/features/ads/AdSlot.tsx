import { useEffect, useRef, useState } from 'react';

import { useBridge } from '../../app/providers';
import { TEST_IDS } from '../../shared/testIds';
import type { BannerHandle } from '../../shared/toss';

/** 개발과 QR 테스트에서 쓰는 공식 테스트 배너. 운영 값은 코드에 두지 않는다. */
const TEST_GROUP = 'ait-ad-test-banner-id';

/**
 * 어느 배너를 붙일지 정한다.
 *
 * 운영 값은 빌드 환경변수로만 들어온다. 비어 있으면 null 이고 슬롯은 접힌다.
 * `import.meta.env.VITE_...` 는 vite 가 빌드 때 문자열로 갈아 끼우므로 키를 변수로 만들지 않는다.
 */
function resolveGroup(): string | null {
  const configured = import.meta.env.VITE_AD_GROUP_ID;
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim();
  return import.meta.env.DEV ? TEST_GROUP : null;
}

type SlotState = 'waiting' | 'shown' | 'collapsed';

/**
 * 홈 배너 한 자리.
 *
 * 안은 비워 둔다. 라벨·테두리·닫기 버튼을 우리가 그리면 광고를 변형하는 것이 된다.
 * 채울 광고가 없거나 그리지 못하면 자리를 남기지 않고 접는다.
 * 화면을 다시 마운트하는 것이 사실상 새로고침이라, 이 컴포넌트는 홈의 최상위 자식으로 둔다.
 */
export function AdSlot() {
  const bridge = useBridge();
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<SlotState>(() =>
    resolveGroup() != null && bridge.supports('ads') ? 'waiting' : 'collapsed',
  );

  useEffect(() => {
    const group = resolveGroup();
    const host = hostRef.current;
    if (group == null || host == null || !bridge.supports('ads')) {
      setState('collapsed');
      return;
    }

    let alive = true;
    let banner: BannerHandle | null = null;

    bridge.ads
      .initialize()
      .then(() => {
        if (!alive) return;
        banner = bridge.ads.attachBanner(group, host, {
          variant: 'card',
          onRendered: () => {
            if (alive) setState('shown');
          },
          onNoFill: () => {
            if (alive) setState('collapsed');
          },
          onFailed: () => {
            if (alive) setState('collapsed');
          },
        });
      })
      .catch(() => {
        if (alive) setState('collapsed');
      });

    return () => {
      alive = false;
      banner?.destroy();
    };
  }, [bridge]);

  return (
    <div
      ref={hostRef}
      data-testid={TEST_IDS.adSlot}
      className={state === 'collapsed' ? 'ad-slot ad-slot--collapsed' : 'ad-slot'}
    />
  );
}
