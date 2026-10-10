import { describe, expect, it } from 'vitest';

import type { BookMemberOut, BookOut } from '../../shared/api';

import {
  defaultBookName,
  duesLabel,
  memberName,
  membersBucket,
  myNameIn,
  ruleSettles,
  settleRuleLabel,
  settleRuleOptions,
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
    month_start_day: 1,
    share_percents: null,
    dues_amount: null,
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

  it('회비 방식은 각자 입금과 나중에 정산이다. 정산이 있는 것은 나중에 정산뿐이다', () => {
    expect(settleRuleLabel('none')).toBe('각자 입금');
    expect(settleRuleLabel('even')).toBe('나중에 정산');
    expect(ruleSettles('even')).toBe(true);
    expect(ruleSettles('none')).toBe(false);
  });

  it('만들기 화면은 유형에 맞춰 미리 고른 방식을 앞에 세운다', () => {
    expect(settleRuleOptions('couple')).toEqual(['even', 'none']);
    expect(settleRuleOptions('family')).toEqual(['none', 'even']);
  });

  it('회비 줄 값은 방식과 비율이다. 둘이면 숫자, 셋 이상이면 「비율」, 혼자면 방식만', () => {
    const me = member({ id: 'me', name: '은홍', is_me: true });
    const junho = member({ id: 'j' });
    const seoyeon = member({ id: 's', name: '서연' });
    expect(duesLabel(book('a', { members: [me] }))).toBe('나중에 정산');
    expect(duesLabel(book('a', { members: [me, junho] }))).toBe('나중에 정산, 똑같이');
    expect(
      duesLabel(
        book('a', { settle_rule: 'none', members: [me, junho], share_percents: { me: 60, j: 40 } }),
      ),
    ).toBe('각자 입금, 6:4');
    expect(
      duesLabel(
        book('a', { members: [me, junho, seoyeon], share_percents: { me: 50, j: 30, s: 20 } }),
      ),
    ).toBe('나중에 정산, 비율');
    // 멤버가 바뀌어 키가 안 맞는 비율은 똑같이로 본다.
    expect(
      duesLabel(book('a', { members: [me, junho, seoyeon], share_percents: { me: 60, j: 40 } })),
    ).toBe('나중에 정산, 똑같이');
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
