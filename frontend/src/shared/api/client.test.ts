import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';

/**
 * 캡처 분석만 제한 시간이 다르다.
 *
 * 사진 한 장을 모델이 읽는 데는 줄글보다 오래 걸린다. 전역 10초로 끊으면 실제 provider 가
 * 붙는 날 정상 응답이 타임아웃으로 죽는다. 스텁은 즉시 답하므로 e2e 로는 이 차이가 안 보인다.
 */

/** 응답이 영영 안 오는 fetch. 누가 언제 끊는지만 본다. */
function neverResolving(): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as unknown as typeof fetch;
}

function makeClient() {
  return createApiClient({
    getAnonKey: () => ({ status: 'ready', key: 'test-key' }),
    baseUrl: 'http://localhost:8100',
    fetchImpl: neverResolving(),
  });
}

describe('요청별 제한 시간', () => {
  it('캡처 분석은 전역 10초에 안 걸리고 30초까지 기다린다', async () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    const call = makeClient().analyzeCapture('data:image/png;base64,AAAA').catch(settled);

    await vi.advanceTimersByTimeAsync(10_500);
    // 여기서 끊기면 사진을 읽던 요청이 전역 10초에 죽은 것이다.
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(20_000);
    await call;
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ code: 'CLIENT_TIMEOUT' }));
    vi.useRealTimers();
  });

  it('대조군: 줄글 분석은 전역 10초 그대로다', async () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    const call = makeClient().analyzeText('점심 12000').catch(settled);

    await vi.advanceTimersByTimeAsync(10_500);
    await call;
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ code: 'CLIENT_TIMEOUT' }));
    vi.useRealTimers();
  });
});
