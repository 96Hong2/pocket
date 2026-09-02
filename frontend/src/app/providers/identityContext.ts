import { createContext, useContext } from 'react';

import type { BridgeErrorCode, Identity } from '../../shared/toss';

/**
 * 익명 식별키 조회 상태.
 *
 * 실패해도 앱은 계속 뜬다. 화면이 이 상태를 보고 무엇을 그릴지 정한다.
 * - unsupported: 토스 앱이 낡아 식별키를 못 받는다. 업데이트를 안내한다.
 * - failed: 일시적 실패. 다시 시도 버튼을 준다.
 */
export type IdentityState =
  | { status: 'loading' }
  | { status: 'ready'; identity: Identity }
  | { status: 'unsupported'; message: string }
  | { status: 'failed'; code: BridgeErrorCode; message: string };

export interface IdentityContextValue {
  state: IdentityState;
  /** 실패 상태에서 다시 부른다. */
  retry(): void;
}

export const IdentityContext = createContext<IdentityContextValue | null>(null);

export function useIdentity(): IdentityContextValue {
  const value = useContext(IdentityContext);
  if (value == null) {
    throw new Error('useIdentity 는 IdentityProvider 안에서만 쓸 수 있어요.');
  }
  return value;
}

/** 식별키가 준비됐을 때만 값을 준다. 아직이면 null. */
export function useUserKey(): string | null {
  const { state } = useIdentity();
  return state.status === 'ready' ? state.identity.key : null;
}
