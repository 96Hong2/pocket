import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';

/**
 * 사진을 읽는 요청만 제한 시간이 다르다. 캡처와 영수증 둘이다.
 *
 * 사진 한 장을 모델이 읽는 데는 줄글보다 오래 걸린다. 전역 10초로 끊으면 실제 provider 가
 * 붙는 날 정상 응답이 타임아웃으로 죽는다. 스텁은 즉시 답하므로 e2e 로는 이 차이가 안 보인다.
 *
 * 두 메서드가 `timeoutMs` 를 각자 적는 별개 본문이라 한쪽만 빠질 수 있다. 그래서 둘 다 본다.
 */

/** 응답이 영영 안 오는 fetch. 누가 언제 끊는지만 본다. */
function neverResolving(): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as unknown as typeof fetch;
}

const DATA_URI = 'data:image/png;base64,AAAA';

function makeClient() {
  return createApiClient({
    getAnonKey: () => ({ status: 'ready', key: 'test-key' }),
    baseUrl: 'http://localhost:8100',
    fetchImpl: neverResolving(),
  });
}

const IMAGE_CALLS = [
  {
    label: '캡처',
    run: (client: ReturnType<typeof makeClient>) => client.analyzeCapture(DATA_URI),
  },
  {
    label: '영수증',
    run: (client: ReturnType<typeof makeClient>) => client.analyzeReceipt(DATA_URI),
  },
];

describe('요청별 제한 시간', () => {
  it.each(IMAGE_CALLS)('$label 분석은 전역 10초에 안 걸리고 30초까지 기다린다', async ({ run }) => {
    vi.useFakeTimers();
    const settled = vi.fn();
    const call = run(makeClient()).catch(settled);

    await vi.advanceTimersByTimeAsync(10_500);
    // 여기서 끊기면 사진을 읽던 요청이 전역 10초에 죽은 것이다.
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(20_000);
    await call;
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ code: 'CLIENT_TIMEOUT' }));
    vi.useRealTimers();
  });

  /*
    줄글도 전역 10초로는 모자란다. 서버가 모델을 한 번 부르는 데 20초까지 기다리고,
    줄이 홀수로 끊기면 한 번 더 부른다. 10초에 끊으면 답이 오는 중에 화면만 「응답이
    늦어요」로 바뀌고 그 호출은 값을 치른 채 버려진다. 서버가 포기하는 40초보다 뒤에 선다.
  */
  it('줄글 분석은 전역 10초에 안 걸리고 서버가 포기하는 40초보다 뒤까지 기다린다', async () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    const call = makeClient().analyzeText('점심 12000').catch(settled);

    await vi.advanceTimersByTimeAsync(40_500);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);
    await call;
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ code: 'CLIENT_TIMEOUT' }));
    vi.useRealTimers();
  });
});
