import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { EVENTS, useAnalytics } from '../../shared/analytics';
import { TimeoutError, withTimeout } from '../../shared/lib/withTimeout';
import { BridgeError, type MiniAppBridge } from '../../shared/toss';

import { useBridge } from './bridgeContext';
import { IdentityContext, type IdentityState } from './identityContext';

const UNSUPPORTED_MESSAGE = '토스 앱을 최신 버전으로 업데이트하면 기록을 저장할 수 있어요.';
const FAILED_MESSAGE = '사용자 정보를 확인하지 못했어요.';

const UNSUPPORTED: IdentityState = { status: 'unsupported', message: UNSUPPORTED_MESSAGE };

/**
 * 실패하면 이만큼 기다렸다 다시 묻는다. 길이가 곧 재시도 횟수다.
 *
 * 식별키는 앱의 계정 그 자체라, 한 번 실패하면 조회·저장·삭제가 전부 막힌다.
 * 그런데 예전에는 딱 한 번만 물었다. 그 한 번이 흔들리면 사용자는 아무것도 못 하는
 * 화면에 갇히고, 빠져나올 길은 「다시 시도」 를 손으로 누르는 것뿐이었다.
 */
const RETRY_DELAYS_MS = [600, 1_800] as const;

/**
 * 한 번 물을 때 기다리는 시간.
 *
 * **답이 안 오는 경우가 실패보다 나쁘다.** 실패는 `.catch` 로 잡아 되묻지만, 영원히 안
 * 끝나는 약속은 잡을 자리가 없어 화면이 「불러오는 중」 에 갇힌다. 그동안 조회·저장은
 * 식별키를 기다리느라 서버로 한 건도 안 나간다. 2026-09-20 에 검수가 이 자리에서
 * 「최초 접속 시간 20초 초과」 로 막혔다.
 *
 * 세 번을 다 써도 2.5 + 0.6 + 2.5 + 1.8 + 2.5 = 9.9초다. 그 안에 안내와 「다시 시도」 가 뜬다.
 * 실기기에서 이 호출은 0.5초를 안 넘는다.
 */
const ASK_TIMEOUT_MS = 2_500;

function initialState(bridge: MiniAppBridge): IdentityState {
  return bridge.supports('identity') ? { status: 'loading' } : UNSUPPORTED;
}

/**
 * SDK 가 준 오류 이름을 꺼낸다.
 *
 * 우리가 감싼 `BridgeError` 는 이름이 늘 `BridgeError` 라 원인을 못 가린다.
 * 안에 넣어 둔 원본에서 `UNSUPPORTED_APP_VERSION`·`UNKNOWN_ERROR` 같은 이름을 꺼낸다.
 */
function detailOf(error: unknown): string | undefined {
  const origin = error instanceof BridgeError ? error.detail : error;
  if (origin instanceof Error && origin.name !== 'Error') return origin.name;
  if (typeof origin === 'string' && origin !== '') return origin;
  return undefined;
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const [state, setState] = useState<IdentityState>(() => initialState(bridge));
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState(initialState(bridge));
    setAttempt((n) => n + 1);
  }, [bridge]);

  useEffect(() => {
    if (!bridge.supports('identity')) return;

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // 실패해도 던지지 않는다. 여기서 던지면 앱 전체가 하얗게 죽는다.
    const ask = (tried: number): void => {
      withTimeout(bridge.getIdentity(), ASK_TIMEOUT_MS)
        .then((identity) => {
          if (alive) setState({ status: 'ready', identity });
        })
        .catch((error: unknown) => {
          if (!alive) return;
          const code =
            error instanceof TimeoutError
              ? 'TIMEOUT'
              : error instanceof BridgeError
                ? error.code
                : 'UNKNOWN';
          if (code === 'UNSUPPORTED') {
            setState(UNSUPPORTED);
            return;
          }
          // 낡은 앱이 아니라면 흔들림일 수 있다. 몇 번 더 물어보고 나서 포기한다.
          const wait = RETRY_DELAYS_MS[tried];
          if (wait != null) {
            timer = setTimeout(() => ask(tried + 1), wait);
            return;
          }
          const detail = detailOf(error);
          /*
            여기까지 왔으면 사용자는 아무것도 못 한다. 무엇이 막았는지 남겨야
            다음에 같은 신고를 받았을 때 화면 문구 말고 볼 것이 생긴다.
            값은 SDK 오류 이름뿐이라 사용자가 넣은 것은 실리지 않는다.
          */
          analytics.log(EVENTS.clientError, {
            kind: 'identity',
            error_name: detail ?? code,
            tries: RETRY_DELAYS_MS.length + 1,
          });
          setState({ status: 'failed', code, message: FAILED_MESSAGE, detail });
        });
    };

    ask(0);

    return () => {
      alive = false;
      if (timer != null) clearTimeout(timer);
    };
  }, [analytics, bridge, attempt]);

  const value = useMemo(() => ({ state, retry }), [state, retry]);

  return <IdentityContext value={value}>{children}</IdentityContext>;
}
