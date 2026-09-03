/**
 * 앱 어디서든 같은 API 클라이언트 하나를 꺼내 쓴다.
 *
 * 클라이언트를 만드는 자리는 `app/providers/ApiProvider.tsx` 다. 익명 식별키를 아는 쪽이
 * 거기이기 때문이다. 여기에는 꺼내는 방법만 둔다(shared 가 app 을 import 하지 않게).
 */

import { createContext, useContext } from 'react';

import type { ApiClient } from './client';

export interface ApiContextValue {
  /** 인스턴스는 앱이 사는 동안 그대로다. 식별키가 바뀌어도 다시 만들지 않는다. */
  client: ApiClient;
  /** 익명 식별키가 준비됐나. 준비 전에는 조회 훅이 요청을 보내지 않는다. */
  isReady: boolean;
}

export const ApiContext = createContext<ApiContextValue | null>(null);

export function useApi(): ApiContextValue {
  const value = useContext(ApiContext);
  if (value == null) {
    throw new Error('useApi 는 ApiProvider 안에서만 쓸 수 있어요.');
  }
  return value;
}

export function useApiClient(): ApiClient {
  return useApi().client;
}

/** 요청을 보낼 수 있는 상태인지. 조회 훅의 `enabled` 가 이걸 본다. */
export function useApiReady(): boolean {
  return useApi().isReady;
}
