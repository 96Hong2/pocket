import { describe, expect, it } from 'vitest';

import { josa, withJosa } from './josa';

describe('조사', () => {
  it('받침이 있으면 앞 것, 없으면 뒤 것', () => {
    expect(withJosa('우리 집', '을/를')).toBe('우리 집을');
    expect(withJosa('하우스', '을/를')).toBe('하우스를');
    expect(withJosa('준호', '이/가')).toBe('준호가');
    expect(withJosa('은홍', '이/가')).toBe('은홍이');
    expect(withJosa('서연', '은/는')).toBe('서연은');
    expect(withJosa('지후', '와/과')).toBe('지후와');
  });

  it('으로/로 는 ㄹ 받침을 받침 없는 쪽으로 친다', () => {
    expect(withJosa('서울', '으로/로')).toBe('서울로');
    expect(withJosa('우리 집', '으로/로')).toBe('우리 집으로');
    expect(withJosa('우리 여행', '으로/로')).toBe('우리 여행으로');
    expect(withJosa('하우스', '으로/로')).toBe('하우스로');
  });

  it('숫자는 한국어로 읽는 소리를 따른다', () => {
    expect(josa('301호', '이/가')).toBe('가');
    expect(josa('방 3', '이/가')).toBe('이');
    expect(josa('방 2', '이/가')).toBe('가');
  });

  it('영문은 l·m·n 으로 끝날 때만 받침으로 본다', () => {
    expect(josa('Tim', '이/가')).toBe('이');
    expect(josa('Home', '을/를')).toBe('를');
  });

  it('기호나 이모지로 끝나면 받침 없는 쪽이다', () => {
    expect(josa('우리 집 🏠', '을/를')).toBe('를');
  });
});
