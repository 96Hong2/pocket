import { useMemo, useRef, type ReactNode } from 'react';

import { ApiContext, createApiClient, type AnonKeyState } from '../../shared/api';

import { useIdentity } from './identityContext';
import type { IdentityState } from './identityContext';

/** 브릿지가 준 식별 상태를 API 층이 아는 모양으로 옮긴다. */
function toAnonKeyState(state: IdentityState): AnonKeyState {
  switch (state.status) {
    case 'ready':
      return { status: 'ready', key: state.identity.key };
    case 'unsupported':
      return { status: 'unsupported' };
    case 'failed':
      return { status: 'failed' };
    default:
      return { status: 'pending' };
  }
}

/**
 * API 클라이언트를 앱에 하나 놓는다.
 *
 * 클라이언트는 식별키를 **게터로** 읽는다. 값으로 받으면 식별키가 도착할 때마다 인스턴스가
 * 새로 만들어지고, 그러면 그 인스턴스를 쥐고 있던 쿼리가 전부 다시 돈다.
 * 최신 상태는 ref 로 넘겨 인스턴스를 그대로 둔다.
 */
export function ApiProvider({ children }: { children: ReactNode }) {
  const { state } = useIdentity();

  const latest = useRef(state);
  latest.current = state;

  const client = useMemo(
    () => createApiClient({ getAnonKey: () => toAnonKeyState(latest.current) }),
    [],
  );

  // isReady 는 바뀐다. 이 값이 바뀌어야 식별키가 도착한 순간 멈춰 있던 조회가 출발한다.
  const value = useMemo(
    () => ({ client, isReady: state.status === 'ready' }),
    [client, state.status],
  );

  return <ApiContext value={value}>{children}</ApiContext>;
}
