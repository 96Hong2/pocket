import { describe, expect, it, vi } from 'vitest';

import { TimeoutError, withTimeout } from '../src/shared/lib/withTimeout';

/**
 * 끝나지 않는 약속에 마감을 거는 자리.
 *
 * 이 파일이 지키는 것은 **「답이 안 오는 것」 이 「실패」 와 같은 길로 흐르는가** 하나다.
 * 이게 안 되면 화면은 「불러오는 중」 에 갇히고, 그 사이 서버로는 아무 요청도 안 나간다.
 */
describe('withTimeout', () => {
  it('마감 안에 끝나면 그 값을 그대로 준다', async () => {
    await expect(withTimeout(Promise.resolve('키'), 1_000)).resolves.toBe('키');
  });

  it('원래 실패는 그대로 올려 보낸다. 마감 오류로 바꾸지 않는다', async () => {
    const original = new Error('SDK 가 거절했다');
    await expect(withTimeout(Promise.reject(original), 1_000)).rejects.toBe(original);
  });

  it('마감을 넘기면 TimeoutError 로 거절한다', async () => {
    vi.useFakeTimers();
    try {
      // 영원히 안 끝나는 약속. SDK 가 답을 안 줄 때가 정확히 이 모양이다.
      const forever = new Promise<string>(() => {});
      const raced = withTimeout(forever, 2_500);
      const seen = raced.catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(2_500);

      const error = await seen;
      expect(error).toBeInstanceOf(TimeoutError);
      expect((error as Error).name).toBe('TimeoutError');
    } finally {
      vi.useRealTimers();
    }
  });

  it('마감 전에 끝나면 타이머를 남기지 않는다', async () => {
    vi.useFakeTimers();
    try {
      await withTimeout(Promise.resolve(1), 5_000);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
