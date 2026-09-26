import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHARE_PATH, shareImageUrl, sharePath } from './shareLink';

/**
 * 공유 링크가 가리키는 자리와 미리보기 그림.
 *
 * 그림 주소는 우리 브라우저가 아니라 **토스 서버가 바깥에서 받아 간다.** 그래서 개발에서
 * 쓰는 `http://localhost` 주소를 그대로 넘기면 아무 데서도 안 열리는 주소가 나간다.
 * 그 자리는 e2e 로는 못 본다. e2e 스택도 http 라 늘 비워진 쪽만 지나간다.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('딥링크', () => {
  it('토스가 정한 모양이다. 이게 아니면 SDK 가 링크를 안 만든다', () => {
    expect(SHARE_PATH).toBe('intoss://pocket-ledger');
  });

  it('갈래마다 표시를 단다. 토스는 공유로 온 사람을 한 칸으로만 적는다', () => {
    expect(sharePath('app')).toBe('intoss://pocket-ledger?src=share_app');
    expect(sharePath('goal_done')).toBe('intoss://pocket-ledger?src=share_goal_done');
  });
});

describe('미리보기 그림', () => {
  it('운영 주소에서는 갈래마다 다른 그림을 가리킨다', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');

    expect(shareImageUrl('app')).toBe('https://api.example.com/og/app.png');
    expect(shareImageUrl('goal_done')).toBe('https://api.example.com/og/goal-done.png');
    expect(shareImageUrl('closing')).toBe('https://api.example.com/og/closing.png');
  });

  it('http 주소면 안 붙인다. 바깥에서 못 받는 주소를 보내느니 앱 기본 그림이 낫다', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000');

    expect(shareImageUrl('app')).toBeUndefined();
  });

  it('주소 자체가 없으면 안 붙인다', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_API_BASE_URL', '');

    expect(shareImageUrl('app')).toBeUndefined();
  });
});
