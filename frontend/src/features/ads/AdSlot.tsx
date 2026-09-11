import { useEffect, useRef, useState } from 'react';

import { useBridge } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { readAdOptOut } from '../../shared/lib/adOptOut';
import { TEST_IDS } from '../../shared/testIds';
import type { BannerHandle } from '../../shared/toss';

/** 개발과 QR 테스트에서 쓰는 공식 테스트 배너. 운영 값은 코드에 두지 않는다. */
const TEST_GROUP = 'ait-ad-test-banner-id';

/** 배너가 선 자리. 로그에서 어느 화면의 배너인지 가른다. */
export type AdPlacement = 'home' | 'report' | 'manage' | 'settings';

/**
 * 같은 자리에 배너를 다시 요청하기까지 두는 최소 간격.
 *
 * 배너가 홈 한 곳에만 있던 이유가 이것이었다(ADR-0004). 화면을 다시 마운트하는 것이
 * 사실상 광고 새로고침이라, 탭을 오갈 때마다 요청이 나가면 노출 수가 부풀려진다.
 * 정책이 금지하는 「광고 영역 주기적 Refresh」 와 구분되지 않는다.
 *
 * 자리를 넷으로 늘리는 대신 자리마다 이 간격을 둔다. 홈↔리포트를 왔다 갔다 해도
 * 각 자리는 이 시간에 한 번만 요청한다. 그 사이에는 슬롯을 접는다.
 * 자리별인 이유는 다른 화면의 첫 방문까지 막으면 그 화면에는 배너가 아예 없는 것과 같아서다.
 */
const REQUEST_COOLDOWN_MS = 15_000;

/** 자리마다 마지막으로 배너를 요청한 시각. 화면이 다시 마운트돼도 남아야 해서 모듈에 둔다. */
const lastRequestAt = new Map<AdPlacement, number>();

/** 방금 이 자리에 붙였다 나갔다 돌아온 것인가. */
function inCooldown(placement: AdPlacement): boolean {
  return Date.now() - (lastRequestAt.get(placement) ?? 0) < REQUEST_COOLDOWN_MS;
}

type SlotState = 'waiting' | 'shown' | 'collapsed';

export interface AdSlotProps {
  placement: AdPlacement;
}

/**
 * 배너 한 자리.
 *
 * 안은 비워 둔다. 라벨·테두리·닫기 버튼을 우리가 그리면 광고를 변형하는 것이 된다.
 * 채울 광고가 없거나 그리지 못하면 자리를 남기지 않고 접는다.
 * 화면을 다시 마운트하는 것이 사실상 새로고침이라, 이 컴포넌트는 화면의 최상위 자식으로 두고
 * 그 위아래에 조건부 return 을 넣지 않는다.
 */
export function AdSlot({ placement }: AdSlotProps) {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const hostRef = useRef<HTMLDivElement>(null);
  // 쿨다운까지 여기서 본다. 첫 값이 이미 접힘이면 effect 가 다시 그리지 않아도 된다.
  const [state, setState] = useState<SlotState>(() =>
    resolveGroup(bridge.environment) != null &&
    bridge.supports('ads') &&
    !inCooldown(placement)
      ? 'waiting'
      : 'collapsed',
  );

  useEffect(() => {
    const group = resolveGroup(bridge.environment);
    const host = hostRef.current;
    if (group == null || host == null || !bridge.supports('ads')) {
      setState('collapsed');
      // 왜 자리가 비었는지는 이것 말고 알 길이 없다. 운영에서 광고 ID 를 빠뜨린 채
      // 배포하면 아무 오류 없이 조용히 접히기 때문이다.
      analytics.log(EVENTS.adResult, {
        placement,
        result: group == null ? 'no_group' : 'unsupported',
      });
      return;
    }

    // 방금 이 자리에 붙였다 나갔다 돌아온 것이면 다시 요청하지 않는다.
    // 첫 값이 이미 접힘이라 여기서 다시 그리지 않는다.
    if (inCooldown(placement)) {
      analytics.log(EVENTS.adResult, { placement, result: 'cooldown' });
      return;
    }

    let alive = true;
    let banner: BannerHandle | null = null;

    const done = (next: SlotState, result: string) => {
      if (!alive) return;
      setState(next);
      analytics.log(EVENTS.adResult, { placement, result }, { kind: 'impression' });
    };

    // 초기화와 함께 읽는다. 읽고 나서 초기화하면 그만큼 배너가 늦는다.
    Promise.all([bridge.ads.initialize(), readAdOptOut(bridge.storage)])
      .then(([, optedOut]) => {
        if (!alive) return;
        if (optedOut) {
          // 만든 사람 기기다. 자리까지 접는다. 테스트 배너로 바꿔 두면 그것도 노출로 센다.
          done('collapsed', 'opted_out');
          return;
        }
        /*
          시각은 **실제로 붙이는 이 순간에** 남긴다. 위에서 미리 남기면 개발 모드의
          effect 이중 실행에서 첫 번째가 찍은 시각에 두 번째가 걸려, 아무도 안 오갔는데
          자기 쿨다운에 자기가 막힌다. 요청이 나간 시점은 초기화가 아니라 붙이는 시점이다.
        */
        lastRequestAt.set(placement, Date.now());
        banner = bridge.ads.attachBanner(group, host, {
          variant: 'card',
          onRendered: () => done('shown', 'shown'),
          onNoFill: () => done('collapsed', 'no_fill'),
          onFailed: () => done('collapsed', 'failed'),
        });
      })
      .catch(() => done('collapsed', 'init_failed'));

    return () => {
      alive = false;
      banner?.destroy();
    };
  }, [analytics, bridge, placement]);

  return (
    <div
      ref={hostRef}
      data-testid={TEST_IDS.adSlot}
      data-placement={placement}
      className={state === 'collapsed' ? 'ad-slot ad-slot--collapsed' : 'ad-slot'}
    />
  );
}

/**
 * 어느 배너를 붙일지 정한다.
 *
 * **테스트로 열었으면 실광고를 붙이지 않는다.** QR 테스트와 심사용으로 여는 판은
 * `sandbox` 다. 거기서 우리가 만든 앱을 우리가 눌러 보는 동안 실광고가 뜨면, 같은 아이피에서
 * 반복 노출·클릭이 쌓여 무효 트래픽으로 잡힌다. 계정이 막히면 되돌리는 데 오래 걸린다.
 * 그래서 sandbox 는 공식 테스트 배너로 고정한다. 자리와 크기는 똑같이 확인할 수 있다.
 *
 * 운영 값은 빌드 환경변수로만 들어온다. 비어 있으면 null 이고 슬롯은 접힌다.
 * `import.meta.env.VITE_...` 는 vite 가 빌드 때 문자열로 갈아 끼우므로 키를 변수로 만들지 않는다.
 */
function resolveGroup(environment: string): string | null {
  if (environment !== 'toss') return TEST_GROUP;

  const configured = import.meta.env.VITE_AD_GROUP_ID;
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim();
  return null;
}
