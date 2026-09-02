import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * 미니앱은 이동 중에 열린다. 네트워크가 자주 끊기고 화면 전환이 잦다는 전제로 맞춘 값이다.
 * - staleTime 60초: 탭을 오가며 같은 화면을 다시 열어도 그때마다 다시 부르지 않는다.
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
        retry: 2,
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        // 저장은 사용자가 방금 누른 동작이다. 자동 재시도로 중복 저장을 만들지 않는다.
        retry: 0,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
