import { describe, expect, it } from 'vitest';

import type { BookEntryOut, BookMemberOut, BookOut, SettlementOut } from '../../shared/api';

import {
  editedLine,
  editedToast,
  entryTitle,
  monthWord,
  movedInToast,
  othersSeeLine,
  secondBookId,
  settleLine,
  stampLabel,
  wroteLine,
} from './bookEntryText';

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

const ME = member({ id: 'me', name: '은홍', role: 'owner', is_me: true });

function book(
  id: string,
  members: BookMemberOut[] = [ME],
  createdAt = '2026-09-28T00:00:00Z',
): BookOut {
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
    created_at: createdAt,
    my_member_id: 'me',
    my_role: 'owner',
    members,
    active_member_count: members.filter((item) => !item.left).length,
    categories: [],
    invite: null,
  };
}

function settlement(overrides: Partial<SettlementOut>): SettlementOut {
  return {
    period: '2026-09',
    period_start: '2026-09-01',
    period_end: '2026-09-30',
    rule: 'even',
    total: '0',
    members: [],
    transfers: [],
    ratio: false,
    done: null,
    changed_after_done: false,
    ...overrides,
  };
}

describe('공유 기록을 화면 말로', () => {
  it('적은 시각은 가계부 시간대의 오전·오후로 적는다', () => {
    // UTC 06:10 은 서울 오후 3시 10분이다. UTC 16:05 는 다음 날 새벽 1시 5분이다.
    expect(stampLabel('2026-09-28T06:10:00Z')).toBe('9월 28일 오후 3:10');
    expect(stampLabel('2026-09-28T16:05:00Z')).toBe('9월 29일 오전 1:05');
  });

  it('누가 언제 적고 고쳤는지 한 문장으로 말한다', () => {
    const junho = member({ id: 'j' });
    const two = book('a', [ME, junho]);
    const entry = {
      created_by_member_id: 'me',
      updated_by_member_id: null,
      created_at: '2026-09-28T06:09:00Z',
      updated_at: '2026-09-28T06:09:00Z',
    } as BookEntryOut;
    expect(wroteLine(two, entry)).toBe('은홍이 9월 28일 오후 3:09에 적었어요');
    expect(editedLine(two, entry)).toBeNull();
    const edited = { ...entry, updated_by_member_id: 'j', updated_at: '2026-09-28T06:40:00Z' };
    expect(editedLine(two, edited)).toBe('준호가 9월 28일 오후 3:40에 고쳤어요');
  });

  it('누가 볼 수 있는지는 남은 멤버 수로 말한다. 혼자면 말하지 않는다', () => {
    const junho = member({ id: 'j' });
    const left = member({ id: 'l', name: null, left: true });
    expect(othersSeeLine(book('a'))).toBeNull();
    expect(othersSeeLine(book('a', [ME, junho, left]))).toBe('준호도 바로 볼 수 있어요');
    expect(othersSeeLine(book('a', [ME, junho, member({ id: 's', name: '서연' })]))).toBe(
      '멤버 모두 바로 볼 수 있어요',
    );
    expect(editedToast(book('a'))).toBe('고쳤어요');
    expect(editedToast(book('a', [ME, junho]))).toBe('고쳤어요. 준호 화면에도 반영돼요');
  });

  it('내 지출을 옮긴 뒤 알림은 누가 보게 되는지까지 말한다', () => {
    const junho = member({ id: 'j' });
    const seoyeon = member({ id: 's', name: '서연' });
    expect(movedInToast(book('a'))).toBe('우리 집으로 옮겼어요');
    expect(movedInToast(book('a', [ME, junho]))).toBe('우리 집으로 옮겼어요. 준호도 볼 수 있어요');
    expect(movedInToast(book('a', [ME, junho, seoyeon]))).toBe(
      '우리 집으로 옮겼어요. 멤버 모두 볼 수 있어요',
    );
  });

  it('둘째 칩은 넘긴 순서(고른 것, 마지막에 적은 곳, 보는 것)대로 본다', () => {
    const active = [book('c'), book('b'), book('a')];
    expect(secondBookId(active, [null, 'a', 'b'])).toBe('a');
    // 끝났거나 나간 가계부는 목록에 없어 건너뛴다.
    expect(secondBookId(active, ['gone', null, 'b'])).toBe('b');
    expect(secondBookId([], ['a'])).toBeNull();
  });

  it('후보가 없으면 둘 이상이 쓰는 가계부가 혼자 쓰는 새 가계부보다 앞이다', () => {
    const junho = member({ id: 'j' });
    const soloNew = book('solo', [ME], '2026-09-28T09:00:00Z');
    const pairOld = book('pair', [ME, junho], '2026-09-01T00:00:00Z');
    const pairNew = book('pair2', [ME, junho], '2026-09-10T00:00:00Z');
    expect(secondBookId([soloNew, pairOld], [null, null, null])).toBe('pair');
    // 둘 이상이 쓰는 것끼리는 최근에 만든 것이 먼저다.
    expect(secondBookId([soloNew, pairOld, pairNew], [null, null, null])).toBe('pair2');
    // 다 혼자면 최근에 만든 것이다.
    expect(
      secondBookId([book('old', [ME], '2026-09-01T00:00:00Z'), soloNew], [null, null, null]),
    ).toBe('solo');
  });

  it('둘이 쓰는 정산은 한 문장, 셋 이상은 건수만 말한다', () => {
    const junho = member({ id: 'j' });
    const two = book('a', [ME, junho]);
    const members = [
      { member_id: 'me', paid: '304900', share: '292400', balance: '12500', percent: null },
      { member_id: 'j', paid: '279900', share: '292400', balance: '-12500', percent: null },
    ];
    expect(
      settleLine(
        two,
        settlement({
          members,
          transfers: [{ from_member_id: 'j', to_member_id: 'me', amount: '12500' }],
        }),
      ),
    ).toBe('준호가 은홍에게 12,500원 보내면 반반이에요');
    expect(settleLine(two, settlement({ members, transfers: [] }))).toBe('딱 맞아요');
    expect(
      settleLine(
        two,
        settlement({ members, done: { done_by_member_id: 'me', done_at: '2026-10-01T00:00:00Z' } }),
      ),
    ).toBe('9월 정산 끝');

    const three = [...members, { member_id: 's', paid: '0', share: '0', balance: '0', percent: null }];
    expect(
      settleLine(
        two,
        settlement({
          members: three,
          transfers: [
            { from_member_id: 's', to_member_id: 'me', amount: '182000' },
            { from_member_id: 'j', to_member_id: 'me', amount: '72000' },
          ],
        }),
      ),
    ).toBe('보낼 돈 2건');
  });

  it('비율로 나눈 정산은 「반반」 이 아니라 「보내면 돼요」 다', () => {
    const junho = member({ id: 'j' });
    const two = book('a', [ME, junho]);
    const members = [
      { member_id: 'me', paid: '100000', share: '60000', balance: '40000', percent: 60 },
      { member_id: 'j', paid: '0', share: '40000', balance: '-40000', percent: 40 },
    ];
    expect(
      settleLine(
        two,
        settlement({
          ratio: true,
          members,
          transfers: [{ from_member_id: 'j', to_member_id: 'me', amount: '40000' }],
        }),
      ),
    ).toBe('준호가 은홍에게 40,000원 보내면 돼요');
    // 서버 기간 이름 달로 부른다. 25일 시작이면 9월 25일에 시작한 기간이 「10월」 이다.
    expect(
      settleLine(
        two,
        settlement({
          period: '2026-10',
          period_start: '2026-09-25',
          members,
          done: { done_by_member_id: 'me', done_at: '2026-10-25T00:00:00Z' },
        }),
      ),
    ).toBe('10월 정산 끝');
  });

  it('「이번 달」 은 가계부 시작일로 끊은 기간끼리 견준다', () => {
    // 시작일 1: 달력 월이다.
    expect(monthWord('2026-10-01', '2026-10-10')).toBe('이번 달');
    expect(monthWord('2026-09-01', '2026-10-10')).toBe('9월');
    // 시작일 25: 9월 25일~10월 24일이 「10월」 이다. 10월 5일은 그 기간 안이다.
    expect(monthWord('2026-09-25', '2026-10-05', 25)).toBe('이번 달');
    expect(monthWord('2026-08-25', '2026-10-05', 25)).toBe('9월');
    // 10월 25일부터는 「11월」 기간이다.
    expect(monthWord('2026-09-25', '2026-10-25', 25)).toBe('10월');
    // 시작일 10: 시작한 달 이름이다.
    expect(monthWord('2026-09-10', '2026-10-05', 10)).toBe('이번 달');
  });

  it('입금 줄 이름은 적은 내용, 없으면 「입금」 이다', () => {
    const base = {
      id: 'e',
      book_id: 'a',
      amount: '300000',
      category_id: null,
      memo: null,
      occurred_on: '2026-10-10',
      created_by_member_id: 'me',
      paid_by_member_id: 'me',
      updated_by_member_id: null,
      created_at: '2026-10-10T00:00:00Z',
      updated_at: '2026-10-10T00:00:00Z',
      can_delete: true,
      can_move: false,
    } satisfies Omit<BookEntryOut, 'kind' | 'title'>;
    expect(entryTitle(book('a'), { ...base, kind: 'deposit', title: null })).toBe('입금');
    expect(entryTitle(book('a'), { ...base, kind: 'deposit', title: '10월 회비' })).toBe(
      '10월 회비',
    );
    expect(entryTitle(book('a'), { ...base, kind: 'expense', title: null })).toBe('기록');
  });
});
