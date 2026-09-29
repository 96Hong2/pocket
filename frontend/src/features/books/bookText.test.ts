import { describe, expect, it } from 'vitest';

import type { BookMemberOut, BookOut } from '../../shared/api';

import {
  defaultBookName,
  memberName,
  membersBucket,
  myNameIn,
  settleRuleLabel,
  splitBooks,
} from './bookText';

function member(overrides: Partial<BookMemberOut> & { id: string }): BookMemberOut {
  return {
    name: '준호',
    role: 'member',
    is_me: false,
    joined_at: '2026-09-28T00:00:00Z',
    left: false,
    ...overrides,
  };
}

function book(id: string, overrides: Partial<BookOut> = {}): BookOut {
  return {
    id,
    kind: 'couple',
    name: '우리 집',
    settle_rule: 'even',
    monthly_budget: null,
    ended: false,
    ended_at: null,
    created_at: '2026-09-28T00:00:00Z',
    my_member_id: 'me',
    my_role: 'owner',
    members: [],
    active_member_count: 1,
    categories: [],
    invite: null,
    ...overrides,
  };
}

describe('공유 가계부 이름과 규칙', () => {
  it('나간 멤버는 이름 대신 「나간 멤버」 다', () => {
    expect(memberName(member({ id: 'a', name: '서연' }))).toBe('서연');
    expect(memberName(member({ id: 'a', name: null, left: true }))).toBe('나간 멤버');
    expect(memberName(null)).toBe('나간 멤버');
  });

  it('인원은 구간으로만 싣는다', () => {
    expect(membersBucket(1)).toBe('1');
    expect(membersBucket(2)).toBe('2');
    expect(membersBucket(3)).toBe('3-5');
    expect(membersBucket(5)).toBe('3-5');
    expect(membersBucket(6)).toBe('6-10');
    expect(membersBucket(10)).toBe('6-10');
  });

  it('둘이 쓰는 가계부는 반반, 여럿이 쓰는 가계부는 똑같이 나눠요', () => {
    expect(settleRuleLabel('couple', 'even')).toBe('반반');
    expect(settleRuleLabel('room', 'even')).toBe('반반');
    expect(settleRuleLabel('family', 'even')).toBe('똑같이 나눠요');
    expect(settleRuleLabel('trip', 'even')).toBe('똑같이 나눠요');
    expect(settleRuleLabel('family', 'none')).toBe('같이 모은 돈');
  });

  it('다른 가계부에서 쓰던 내 이름을 찾는다', () => {
    const mine = member({ id: 'me', name: '은홍', is_me: true });
    expect(myNameIn([book('a', { members: [member({ id: 'x' }), mine] })])).toBe('은홍');
    expect(myNameIn([book('a', { members: [member({ id: 'x' })] })])).toBeNull();
    expect(myNameIn([])).toBeNull();
  });

  it('기본 이름은 유형에 맞는 평범한 말이다. 연인·부부를 「집」 으로 부르지 않는다', () => {
    expect(defaultBookName('couple')).toBe('둘이 쓰는 돈');
    expect(defaultBookName('family')).toBe('가족 생활비');
    expect(defaultBookName('trip')).toBe('여행 경비');
    expect(defaultBookName('room')).toBe('공동 생활비');
  });

  it('끝난 가계부를 따로 모은다. 서버가 준 순서는 그대로다', () => {
    const { active, ended } = splitBooks([book('a'), book('b', { ended: true }), book('c')]);
    expect(active.map((item) => item.id)).toEqual(['a', 'c']);
    expect(ended.map((item) => item.id)).toEqual(['b']);
  });
});
