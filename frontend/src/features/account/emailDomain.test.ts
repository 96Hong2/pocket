import { describe, expect, it } from 'vitest';

import { withDomain } from './EmailLinkSheet';

describe('withDomain', () => {
  it('아직 @ 를 안 적었으면 뒤에 붙인다', () => {
    expect(withDomain('hong', 'gmail.com')).toBe('hong@gmail.com');
  });

  it('이미 적은 뒷자리는 갈아 끼운다', () => {
    expect(withDomain('hong@naver.com', 'gmail.com')).toBe('hong@gmail.com');
  });

  it('@ 만 적어 둔 상태에서도 붙는다', () => {
    expect(withDomain('hong@', 'daum.net')).toBe('hong@daum.net');
  });

  it('앞자리가 없으면 도메인만 남기지 않는다', () => {
    // 「@gmail.com」 만 남으면 모양은 주소 같은데 보낼 곳이 없다. 빈 값으로 둔다.
    expect(withDomain('', 'gmail.com')).toBe('');
    expect(withDomain('  ', 'gmail.com')).toBe('');
    expect(withDomain('@naver.com', 'gmail.com')).toBe('');
  });

  it('앞뒤 공백은 지운다', () => {
    expect(withDomain('  hong  ', 'kakao.com')).toBe('hong@kakao.com');
  });
});
