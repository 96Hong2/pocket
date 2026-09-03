import type { Page, TestInfo } from '@playwright/test';

/**
 * 익명키 격리.
 *
 * 앱인토스 devtools 목은 익명키를 `mock-anon-hash-xyz789` 상수로 준다.
 * 손대지 않으면 모든 테스트와 모든 병렬 워커가 백엔드에서 같은 사용자가 된다.
 * '새 계정으로 처음 연다' 를 재현할 수 없고, 두 번째 실행부터 숫자 단언이 깨진다.
 *
 * 그래서 목이 자기 상태를 `window.__ait` 에 대입하는 순간을 setter 로 가로채
 * 익명키만 테스트별 유일값으로 갈아끼운다. 브릿지는 그대로 실기기와 같은 코드로 돈다.
 */

const PREFIX = 'pocket-e2e';

/**
 * 테스트마다 다른 익명키.
 *
 * 재시도 회차를 넣지 않으면 CI 재시도가 앞 회차가 만든 데이터를 그대로 물려받는다.
 * 무작위 꼬리는 같은 스위트를 두 번 돌릴 때 겹치지 않게 한다.
 * 값은 HTTP 헤더로 나가므로 ASCII 만 쓴다.
 */
export function anonKeyFor(testInfo: TestInfo): string {
  const tail = Math.random().toString(36).slice(2, 10);
  return `${PREFIX}-${testInfo.testId}-r${testInfo.retry}-${tail}`;
}

/**
 * 페이지의 첫 스크립트보다 먼저 도는 트랩.
 *
 * 이 함수 본문은 브라우저에서 돈다. 바깥 스코프를 참조하면 안 된다.
 */
export function installAnonKeyTrap(key: string): void {
  interface AitState {
    auth?: { anonymousKeyHash?: string };
  }
  interface AitManager {
    state?: AitState;
    patch?: (slice: string, partial: Record<string, unknown>) => void;
    reset?: () => void;
  }

  const wrapped = new WeakSet<object>();
  let manager: AitManager | undefined;

  const apply = (target: AitManager | undefined): void => {
    try {
      target?.patch?.('auth', { anonymousKeyHash: key });
    } catch {
      // 목 구조가 바뀌면 여기서 조용히 실패한다. 테스트 종료 시 가드가 잡아 낸다.
    }
  };

  Object.defineProperty(window, '__ait', {
    configurable: true,
    get: () => manager,
    set: (next: AitManager | undefined) => {
      manager = next;
      apply(next);

      // 개발 도구 패널의 reset() 은 목 상태를 기본값으로 되돌린다. 되돌아가면 다시 덮는다.
      if (next && typeof next.reset === 'function' && !wrapped.has(next)) {
        wrapped.add(next);
        const original = next.reset.bind(next);
        next.reset = () => {
          original();
          apply(next);
        };
      }
    },
  });
}

export interface AnonKeyProbe {
  /** 앱을 한 번이라도 열었나. about:blank 면 볼 것이 없다. */
  navigated: boolean;
  /** devtools 목 상태가 페이지에 있나. 없으면 트랩이 걸 자리가 사라진 것이다. */
  mockPresent: boolean;
  /** 목이 실제로 들고 있는 익명키. `getAnonymousKey()` 가 돌려주는 바로 그 값이다. */
  key: string | null;
}

/** 목이 들고 있는 익명키를 읽는다. 트랩이 실제로 먹었는지 여기서 확인한다. */
export async function probeAnonKey(page: Page): Promise<AnonKeyProbe> {
  if (page.url() === 'about:blank' || page.url() === '') {
    return { navigated: false, mockPresent: false, key: null };
  }

  return page.evaluate(() => {
    const manager = (
      window as unknown as {
        __ait?: { state?: { auth?: { anonymousKeyHash?: string } } };
      }
    ).__ait;

    return {
      navigated: true,
      mockPresent: manager != null,
      key: manager?.state?.auth?.anonymousKeyHash ?? null,
    };
  });
}
