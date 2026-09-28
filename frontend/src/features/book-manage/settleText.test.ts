import { describe, expect, it } from 'vitest';

import type { SettlementOut } from '../../shared/api';

import { paidLabel, settleSummary, settledDetail, settledHeadline } from './settleText';

const NAMES: Record<string, string> = { a: '은홍', b: '준호', c: '서연', d: '지훈' };
const nameOf = (id: string) => NAMES[id] ?? '나간 멤버';

function settlement(overrides: Partial<SettlementOut>): SettlementOut {
  return {
    period: '2026-09',
    period_start: '2026-09-01',
    period_end: '2026-09-30',
    rule: 'even',
    total: '0',
    members: [],
    transfers: [],
    done: null,
    changed_after_done: false,
    ...overrides,
  };
}

function member(id: string, paid: string) {
  return { member_id: id, paid, share: '0', balance: '0' };
}

describe('settleSummary', () => {
  it('둘이면 누가 누구에게 얼마를 보내는지 한 문장으로 말한다', () => {
    // PRD: 은홍 304,900 · 준호 279,900, 합계 584,800, 한 사람 몫 292,400 → 준호가 12,500 보낸다.
    const summary = settleSummary(
      settlement({
        total: '584800',
        members: [member('a', '304900'), member('b', '279900')],
        transfers: [{ from_member_id: 'b', to_member_id: 'a', amount: '12500' }],
      }),
      nameOf,
    );
    expect(summary).toEqual({
      state: 'pair',
      text: '준호가 은홍에게 12,500원 보내면 반반이에요',
      line: '준호 → 은홍 12,500원',
    });
  });

  it('셋 이상이면 보낼 돈을 한 줄씩 적는다', () => {
    const summary = settleSummary(
      settlement({
        members: [
          member('a', '504000'),
          member('b', '280000'),
          member('c', '68000'),
          member('d', '148000'),
        ],
        transfers: [
          { from_member_id: 'c', to_member_id: 'a', amount: '182000' },
          { from_member_id: 'd', to_member_id: 'a', amount: '72000' },
          { from_member_id: 'd', to_member_id: 'b', amount: '30000' },
        ],
      }),
      nameOf,
    );
    expect(summary).toEqual({
      state: 'many',
      lines: ['서연 → 은홍 182,000원', '지훈 → 은홍 72,000원', '지훈 → 준호 30,000원'],
    });
  });

  it('보낼 돈이 없으면 딱 맞았다고 한다', () => {
    const summary = settleSummary(
      settlement({ members: [member('a', '10000'), member('b', '10000')] }),
      nameOf,
    );
    expect(summary).toEqual({ state: 'balanced' });
  });

  it('같이 모은 돈 가계부와 혼자인 기간은 정산 문장을 만들지 않는다', () => {
    expect(settleSummary(settlement({ rule: 'none' }), nameOf)).toEqual({ state: 'none' });
    expect(settleSummary(settlement({ members: [member('a', '5000')] }), nameOf)).toEqual({
      state: 'alone',
    });
  });
});

describe('끝낸 정산', () => {
  it('제목은 끝냈다는 것이고, 보낸 사람 문장 대신 계산한 금액만 흐리게 남긴다', () => {
    expect(settledHeadline('9월')).toBe('9월 정산을 끝냈어요');
    expect(settledHeadline('여행 전체')).toBe('여행 전체 정산을 끝냈어요');
    expect(
      settledDetail({
        state: 'pair',
        text: '준호가 은홍에게 12,500원 보내면 반반이에요',
        line: '준호 → 은홍 12,500원',
      }),
    ).toEqual(['계산한 금액: 준호 → 은홍 12,500원']);
    expect(settledDetail({ state: 'many', lines: ['서연 → 은홍 182,000원'] })).toEqual([
      '계산한 금액',
      '서연 → 은홍 182,000원',
    ]);
    expect(settledDetail({ state: 'balanced' })).toEqual(['딱 맞아요. 보낼 돈이 없어요']);
    expect(settledDetail({ state: 'none' })).toEqual([]);
  });
});

describe('paidLabel', () => {
  it('받침에 따라 조사를 고른다', () => {
    expect(paidLabel('은홍')).toBe('은홍이 낸 돈');
    expect(paidLabel('준호')).toBe('준호가 낸 돈');
  });
});
