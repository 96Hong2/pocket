import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ApiError } from '../../shared/api';

/**
 * 다시 불러도 결과가 같은 실패는 재시도하지 않는다.
 *
 * 401·404·409·422 는 요청이 잘못됐거나 대상이 없다는 뜻이라 두 번 더 불러도 그대로다.
 * 그 사이 되돌리기 8초 창이 지나가고, 사용자는 이유를 모른 채 오래 기다린다.
 * 판단 근거는 `ApiError.isRetryable` 한 곳에 있다.
 *
 * 횟수는 원래 값과 같다(`failureCount < 2` 는 `retry: 2` 와 같은 조건이다).
 */
function retryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && !error.isRetryable) return false;
  return failureCount < 2;
}

/**
 * 미니앱은 이동 중에 열린다. 네트워크가 자주 끊기고 화면 전환이 잦다는 전제로 맞춘 값이다.
 * - staleTime 60초: 탭을 오가며 같은 화면을 다시 열어도 그때마다 다시 부르지 않는다.
 *   저장·되돌리기 뒤에는 이 값을 기다리지 않는다. `shared/api` 의 변경 훅이 바로 무효화한다.
 * - retry 2회 + 지수 백오프: 순간 끊김은 조용히 넘기고, 오래 끌지 않는다.
 * - refetchOnWindowFocus 끔: 웹뷰가 포그라운드로 올 때마다 전부 다시 부르면 과하다.
 * - refetchOnReconnect 켬: 다시 연결되면 그때 최신으로 맞춘다.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        retry: retryQuery,
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        // 저장은 사용자가 방금 누른 동작이다. 자동 재시도로 중복 저장을 만들지 않는다.
        // 되돌리기도 마찬가지다. 재시도로 8초 창을 태우면 눌러도 안 되는 버튼이 된다.
        retry: 0,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
