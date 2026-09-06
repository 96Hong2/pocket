import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveApiBaseUrl } from './baseUrl';

/**
 * 운영 번들이 어떤 주소를 부르는지는 빌드 때 한 번 정해지고 나중에 못 고친다.
 * 잘못 넣은 채로 올리면 실기기에서 전 화면이 비고, 그때는 이미 심사에 넣은 뒤다.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('운영 번들', () => {
  function prod(value?: string) {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_API_BASE_URL', value ?? '');
  }

  it('https 주소를 그대로 쓴다', () => {
    prod('https://api.example.com');
    expect(resolveApiBaseUrl()).toBe('https://api.example.com');
  });

  it('끝의 빗금을 떼어 준다', () => {
    prod('https://api.example.com/');
    expect(resolveApiBaseUrl()).toBe('https://api.example.com');
  });

  // 토스 앱이 http 요청을 차단한다. 통과시키면 실기기에서 모든 조회가 조용히 실패한다.
  it('http 주소는 안 쓴다', () => {
    prod('http://api.example.com');
    expect(resolveApiBaseUrl()).toBeNull();
  });

  it('주소가 없으면 개발 기본값으로 흘러가지 않는다', () => {
    prod('');
    expect(resolveApiBaseUrl()).toBeNull();
  });
});

describe('개발', () => {
  it('localhost 백엔드를 http 로 쓴다', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_API_BASE_URL', '');
    expect(resolveApiBaseUrl()).toBe('http://localhost:8000');
  });

  it('http 주소를 직접 넣으면 그것을 쓴다', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_API_BASE_URL', 'http://192.168.0.10:8000');
    expect(resolveApiBaseUrl()).toBe('http://192.168.0.10:8000');
  });
});
