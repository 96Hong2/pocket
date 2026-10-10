import { describe, expect, it } from 'vitest';

import type { BookMemberOut, BookOut } from '../api';
import type { KeyValueStore } from '../toss';

import { readBookFirstDay, markBookFirstDay, daysBetweenDays } from './bookFirstDay';
import { markBookIntroSeen, readBookIntroSeen } from './bookIntroSeen';
import { markBookInviteSent, readBookInviteSent } from './bookInviteSent';
import { readBookLast, writeBookLast } from './bookLast';
import { readBookLastViewed, resolveStartBook, writeBookLastViewed } from './bookLastViewed';
import { bookNotices, readBookSeen, snapshotBook, writeBookSeen } from './bookSeenState';
import { markPlusInterest, readPlusInterest } from './plusInterest';
import { isReportUnlocked, markReportAdDay, readReportAdDay } from './reportAdDay';

/**
 * 공유 가계부가 기기에 남기는 것들.
 *
 * 지키는 것은 둘이다. 저장소가 막혀도 던지지 않는 것, 그리고 홈의 한 번뿐인 알림이
 * 처음 보는 가계부에서는 아무 말도 안 하는 것.
 */

function memoryStore(): KeyValueStore & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    get: (key) => Promise.resolve(data[key] ?? null),
    set: (key, value) => {
      data[key] = value;
      return Promise.resolve();
    },
    remove: (key) => {
      delete data[key];
      return Promise.resolve();
    },
  };
}

const brokenStore: KeyValueStore = {
  get: () => Promise.reject(new Error('막힘')),
  set: () => Promise.reject(new Error('막힘')),
  remove: () => Promise.reject(new Error('막힘')),
};

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

function book(members: BookMemberOut[], overrides: Partial<BookOut> = {}): BookOut {
  return {
    id: 'book-1',
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
    my_role: 'member',
    members,
    active_member_count: members.filter((item) => !item.left).length,
    categories: [],
    invite: null,
    ...overrides,
  };
}

describe('저장소가 막혀도 던지지 않는다', () => {
  it('읽기는 기본값, 쓰기는 조용히 넘어간다', async () => {
    await expect(readBookLast(brokenStore)).resolves.toBeNull();
    await expect(writeBookLast(brokenStore, 'b')).resolves.toBeUndefined();
    // 안내 카드는 못 읽으면 봤다고 본다. 닫아도 매번 다시 뜨는 쪽이 더 성가시다.
    await expect(readBookIntroSeen(brokenStore)).resolves.toBe(true);
    await expect(markBookIntroSeen(brokenStore)).resolves.toBeUndefined();
    await expect(readBookSeen(brokenStore, 'b')).resolves.toBeNull();
    await expect(writeBookSeen(brokenStore, 'b', { members: [], ended: false })).resolves.toBe(
      undefined,
    );
    await expect(readBookFirstDay(brokenStore)).resolves.toBeNull();
    await expect(markBookFirstDay(brokenStore, '2026-09-28')).resolves.toBeUndefined();
    await expect(readReportAdDay(brokenStore)).resolves.toBeNull();
    await expect(markReportAdDay(brokenStore, '2026-09-28')).resolves.toBeUndefined();
    await expect(readPlusInterest(brokenStore)).resolves.toBe(false);
    await expect(markPlusInterest(brokenStore)).resolves.toBeUndefined();
    await expect(readBookLastViewed(brokenStore)).resolves.toBeNull();
    await expect(writeBookLastViewed(brokenStore, 'b')).resolves.toBeUndefined();
    await expect(writeBookLastViewed(brokenStore, null)).resolves.toBeUndefined();
    await expect(readBookInviteSent(brokenStore, 'b')).resolves.toBe(false);
    await expect(markBookInviteSent(brokenStore, 'b')).resolves.toBeUndefined();
  });
});

describe('앱을 열 때 어느 가계부에서 시작하나', () => {
  const me = member({ id: 'me', name: '준호', is_me: true });
  const home = book([me], { id: 'home' });
  const ended = book([me], { id: 'ended', ended: true });

  it('보던 가계부가 기기에 남아 있고 내 가계부에 기록이 없으면 그 가계부다', () => {
    expect(
      resolveStartBook({
        remembered: 'home',
        unavailable: false,
        books: [home],
        hasPersonalRecords: false,
      }),
    ).toBe('home');
  });

  it('내 가계부에 기록이 하나라도 있으면 늘 내 가계부다', () => {
    expect(
      resolveStartBook({
        remembered: 'home',
        unavailable: false,
        books: [home],
        hasPersonalRecords: true,
      }),
    ).toBeNull();
  });

  it('끝났거나 목록에 없는 가계부, 남은 것이 없을 때, 물어볼 수 없을 때는 내 가계부다', () => {
    const base = { unavailable: false, books: [home, ended], hasPersonalRecords: false };
    expect(resolveStartBook({ ...base, remembered: 'ended' })).toBeNull();
    expect(resolveStartBook({ ...base, remembered: 'gone' })).toBeNull();
    expect(resolveStartBook({ ...base, remembered: null })).toBeNull();
    expect(resolveStartBook({ ...base, remembered: 'home', unavailable: true })).toBeNull();
  });

  it('목록이나 내 기록 여부를 아직 못 받았으면 기다린다', () => {
    expect(
      resolveStartBook({
        remembered: 'home',
        unavailable: false,
        books: undefined,
        hasPersonalRecords: false,
      }),
    ).toBeUndefined();
    expect(
      resolveStartBook({
        remembered: 'home',
        unavailable: false,
        books: [home],
        hasPersonalRecords: undefined,
      }),
    ).toBeUndefined();
  });
});

describe('기기에 남기는 값', () => {
  it('마지막에 적은 가계부와 안내 카드와 원해요를 그대로 돌려준다', async () => {
    const store = memoryStore();
    expect(await readBookLast(store)).toBeNull();
    await writeBookLast(store, 'book-9');
    expect(await readBookLast(store)).toBe('book-9');

    expect(await readBookIntroSeen(store)).toBe(false);
    await markBookIntroSeen(store);
    expect(await readBookIntroSeen(store)).toBe(true);

    expect(await readPlusInterest(store)).toBe(false);
    await markPlusInterest(store);
    expect(await readPlusInterest(store)).toBe(true);
  });

  it('마지막에 본 가계부는 내 가계부를 고르면 지운다', async () => {
    const store = memoryStore();
    await writeBookLastViewed(store, 'book-3');
    expect(await readBookLastViewed(store)).toBe('book-3');
    await writeBookLastViewed(store, null);
    expect(await readBookLastViewed(store)).toBeNull();
  });

  it('초대장을 보낸 것은 가계부마다 따로 남는다', async () => {
    const store = memoryStore();
    expect(await readBookInviteSent(store, 'book-1')).toBe(false);
    await markBookInviteSent(store, 'book-1');
    expect(await readBookInviteSent(store, 'book-1')).toBe(true);
    expect(await readBookInviteSent(store, 'book-2')).toBe(false);
  });

  it('같이 쓰기 시작한 날은 처음 한 번만 적는다', async () => {
    const store = memoryStore();
    await markBookFirstDay(store, '2026-09-20');
    await markBookFirstDay(store, '2026-09-28');
    expect(await readBookFirstDay(store)).toBe('2026-09-20');
  });

  it('날 수는 날짜 문자열로 센다. 달과 해를 넘어도 맞다', () => {
    expect(daysBetweenDays('2026-09-20', '2026-09-28')).toBe(8);
    expect(daysBetweenDays('2026-09-30', '2026-10-01')).toBe(1);
    expect(daysBetweenDays('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetweenDays('2026-09-28', '2026-09-28')).toBe(0);
    expect(daysBetweenDays('2026-09-28', '2026-09-27')).toBe(0);
  });

  it('자세히 보기는 광고를 본 그날만 열려 있다', async () => {
    const store = memoryStore();
    await markReportAdDay(store, '2026-09-28');
    const stored = await readReportAdDay(store);
    expect(isReportUnlocked(stored, '2026-09-28')).toBe(true);
    expect(isReportUnlocked(stored, '2026-09-29')).toBe(false);
    expect(isReportUnlocked(null, '2026-09-28')).toBe(false);
  });
});

describe('우리 집 홈의 한 번뿐인 알림', () => {
  const me = member({ id: 'me', name: '은홍', is_me: true, role: 'owner' });
  const junho = member({ id: 'm-junho', name: '준호' });

  it('처음 보는 가계부는 아무 말도 안 한다', () => {
    expect(bookNotices(null, book([me, junho]))).toEqual([]);
  });

  it('지난번 뒤로 들어온 사람을 알린다. 나 자신과 나간 사람은 안 알린다', () => {
    const before = snapshotBook(book([me]));
    const now = book([me, junho, member({ id: 'm-left', name: null, left: true })]);
    expect(bookNotices(before, now)).toEqual([
      { kind: 'joined', memberId: 'm-junho', name: '준호' },
    ]);
  });

  it('관리자가 끝낸 것을 멤버에게 알린다. 관리자 자신에게는 안 알린다', () => {
    const owner = member({ id: 'm-owner', name: '은홍', role: 'owner' });
    const meMember = member({ id: 'me', name: '준호', is_me: true });
    const before = snapshotBook(book([owner, meMember]));
    const ended = book([owner, meMember], { ended: true });
    expect(bookNotices(before, ended)).toEqual([{ kind: 'ended', name: '은홍' }]);

    const mine = book([me, junho], { ended: true, my_role: 'owner' });
    expect(bookNotices(snapshotBook(book([me, junho])), mine)).toEqual([]);
  });

  it('가계부마다 따로 남기고 다시 읽는다', async () => {
    const store = memoryStore();
    await writeBookSeen(store, 'book-1', { members: ['me'], ended: false });
    await writeBookSeen(store, 'book-2', { members: ['me', 'x'], ended: true });
    expect(await readBookSeen(store, 'book-1')).toEqual({ members: ['me'], ended: false });
    expect(await readBookSeen(store, 'book-2')).toEqual({ members: ['me', 'x'], ended: true });
    expect(await readBookSeen(store, 'book-3')).toBeNull();
  });

  it('깨진 값은 처음 보는 것으로 본다', async () => {
    const store = memoryStore();
    store.data['book-seen-state'] = '{"book-1":{"members":"x"}}';
    expect(await readBookSeen(store, 'book-1')).toBeNull();
    store.data['book-seen-state'] = 'not json';
    expect(await readBookSeen(store, 'book-1')).toBeNull();
  });
});
