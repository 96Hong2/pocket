import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { BridgeError, type MiniAppBridge } from '../../shared/toss';

import { useBridge } from './bridgeContext';
import { IdentityContext, type IdentityState } from './identityContext';

const UNSUPPORTED_MESSAGE = '토스 앱을 최신 버전으로 업데이트하면 기록을 저장할 수 있어요.';
const FAILED_MESSAGE = '사용자 정보를 확인하지 못했어요.';

const UNSUPPORTED: IdentityState = { status: 'unsupported', message: UNSUPPORTED_MESSAGE };

/**
 * 부르기 전에 먼저 묻는다.
 * 미지원 버전에서 `getIdentity()` 가 던지는 에러는 SDK 형태에 기대야 하는데,
 * `supports()` 로 갈라 두면 그 판정에 기대지 않고도 업데이트 안내가 확실히 뜬다.
 */
function initialState(bridge: MiniAppBridge): IdentityState {
  return bridge.supports('identity') ? { status: 'loading' } : UNSUPPORTED;
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const bridge = useBridge();
  const [state, setState] = useState<IdentityState>(() => initialState(bridge));
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState(initialState(bridge));
    setAttempt((n) => n + 1);
  }, [bridge]);

  useEffect(() => {
    if (!bridge.supports('identity')) return;

    let alive = true;

    // 실패해도 던지지 않는다. 여기서 던지면 앱 전체가 하얗게 죽는다.
    bridge
      .getIdentity()
      .then((identity) => {
        if (alive) setState({ status: 'ready', identity });
      })
      .catch((error: unknown) => {
        if (!alive) return;
        const code = error instanceof BridgeError ? error.code : 'UNKNOWN';
        setState(
          code === 'UNSUPPORTED'
            ? UNSUPPORTED
            : { status: 'failed', code, message: FAILED_MESSAGE },
        );
      });

    return () => {
      alive = false;
    };
  }, [bridge, attempt]);

  const value = useMemo(() => ({ state, retry }), [state, retry]);

  return <IdentityContext value={value}>{children}</IdentityContext>;
}
