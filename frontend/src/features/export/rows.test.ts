import { describe, expect, it } from 'vitest';

import type { CategoryOut, TransactionOut } from '../../shared/api';

import {
  NO_CATEGORY_LABEL,
  toCategoryLines,
  toCsv,
  toExportLines,
  toLedgerCells,
  toMonthlyLines,
} from './rows';

/**
 * 내보낼 표를 만드는 계산.
 *
 * 여기서 지키는 것은 셋이다. **이체가 요약에서 빠지는 것**(ADR-0005), 문자열로 오는 금액이
 * 숫자 칸으로 들어가는 것, 그리고 메모에 무엇이 들어 있어도 CSV 의 열이 안 밀리는 것.
 * 앞엣것이 깨지면 앱 화면과 내려받은 파일이 서로 다른 지출을 말한다.
 */

const CATEGORIES: CategoryOut[] = [
  { id: 'cat-food', name: '식비' },
  { id: 'cat-pay', name: '월급' },
] as unknown as CategoryOut[];

/** 가계부 시간대 정오. 어느 시간대에서 돌려도 같은 날에 남는다. */
function noon(day: string): string {
  return `${day}T12:00:00+09:00`;
}

function tx(seed: Partial<TransactionOut> & { day: string; amount: string }): TransactionOut {
  const { day, ...rest } = seed;
  return {
    id: `tx-${day}-${rest.amount}`,
    occurred_at: noon(day),
    type: 'expense',
    merchant: null,
    memo: null,
    category_id: null,
    tag_id: null,
    source: 'keypad',
    confidence: 1,
    excluded_from_budget: false,
    payment_method: null,
    ...rest,
  } as TransactionOut;
}

describe('전체 내역', () => {
  it('문자열로 온 금액이 숫자 칸으로 들어간다', () => {
    const lines = toExportLines([tx({ day: '2026-09-10', amount: '12000.00' })], CATEGORIES, '');

    expect(lines[0].amount).toBe(12_000);
    expect(toLedgerCells(lines[0])[5]).toBe(12_000);
  });

  it('오래된 것이 위로 온다. 서버는 최근 것을 앞에 준다', () => {
    const lines = toExportLines(
      [
        tx({ day: '2026-09-20', amount: '3000' }),
        tx({ day: '2026-09-01', amount: '1000' }),
        tx({ day: '2026-09-10', amount: '2000' }),
      ],
      CATEGORIES,
      '',
    );

    expect(lines.map((line) => line.day)).toEqual(['2026-09-01', '2026-09-10', '2026-09-20']);
  });

  it('고른 기간 밖의 줄은 빠진다', () => {
    const all = [
      tx({ day: '2026-08-31', amount: '1000' }),
      tx({ day: '2026-09-01', amount: '2000' }),
      tx({ day: '2025-09-15', amount: '3000' }),
    ];

    expect(toExportLines(all, CATEGORIES, '2026-09').map((line) => line.day)).toEqual([
      '2026-09-01',
    ]);
    expect(toExportLines(all, CATEGORIES, '2026').map((line) => line.day)).toEqual([
      '2026-08-31',
      '2026-09-01',
    ]);
    expect(toExportLines(all, CATEGORIES, '')).toHaveLength(3);
  });

  it('구분을 한국어로 적고, 분류를 안 고른 줄에도 이름을 남긴다', () => {
    const lines = toExportLines(
      [
        tx({ day: '2026-09-01', amount: '1000', type: 'transfer' }),
        tx({ day: '2026-09-02', amount: '2000', type: 'refund', category_id: 'cat-food' }),
        tx({ day: '2026-09-03', amount: '3000', type: 'income', category_id: 'cat-pay' }),
      ],
      CATEGORIES,
      '',
    );

    expect(lines.map((line) => line.type)).toEqual(['이체', '환불', '수입']);
    expect(lines.map((line) => line.category)).toEqual([NO_CATEGORY_LABEL, '식비', '월급']);
  });

  it('지워진 분류를 물고 있어도 빈 칸으로 두지 않는다', () => {
    // 분류를 지우면 그 기록은 남고 분류만 사라진다. 목록에서 못 찾는 id 가 그대로 온다.
    const lines = toExportLines(
      [tx({ day: '2026-09-01', amount: '1000', category_id: 'cat-gone' })],
      CATEGORIES,
      '',
    );

    expect(lines[0].category).toBe(NO_CATEGORY_LABEL);
  });

  it('결제수단을 안 고른 줄은 빈 칸이다. 「안 고름」 도 하나의 값처럼 보인다', () => {
    const lines = toExportLines(
      [
        tx({ day: '2026-09-01', amount: '1000' }),
        tx({ day: '2026-09-02', amount: '2000', payment_method: 'credit' }),
      ],
      CATEGORIES,
      '',
    );

    expect(lines.map((line) => line.paymentMethod)).toEqual(['', '신용카드']);
  });
});

describe('월별 요약', () => {
  it('이체는 어느 칸에도 안 들어간다', () => {
    const lines = toExportLines(
      [
        tx({ day: '2026-09-01', amount: '10000' }),
        tx({ day: '2026-09-02', amount: '500000', type: 'transfer' }),
        tx({ day: '2026-09-03', amount: '30000', type: 'income' }),
      ],
      CATEGORIES,
      '',
    );

    expect(toMonthlyLines(lines)).toEqual([
      { month: '2026-09', income: 30_000, expense: 10_000, delta: 20_000 },
    ]);
  });

  it('환불은 수입이 아니라 지출을 깎는다', () => {
    const lines = toExportLines(
      [
        tx({ day: '2026-09-01', amount: '50000' }),
        tx({ day: '2026-09-05', amount: '50000', type: 'refund' }),
      ],
      CATEGORIES,
      '',
    );

    expect(toMonthlyLines(lines)).toEqual([{ month: '2026-09', income: 0, expense: 0, delta: 0 }]);
  });

  it('달이 여럿이면 오래된 달부터 온다', () => {
    const lines = toExportLines(
      [
        tx({ day: '2026-10-01', amount: '1000' }),
        tx({ day: '2026-08-01', amount: '2000' }),
        tx({ day: '2026-09-01', amount: '3000' }),
      ],
      CATEGORIES,
      '',
    );

    expect(toMonthlyLines(lines).map((line) => line.month)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
  });
});

describe('카테고리별 요약', () => {
  it('지출만 센다. 이체도 수입도 안 들어간다', () => {
    const lines = toExportLines(
      [
        tx({ day: '2026-09-01', amount: '10000', category_id: 'cat-food' }),
        tx({ day: '2026-09-02', amount: '90000', type: 'transfer', category_id: 'cat-food' }),
        tx({ day: '2026-09-03', amount: '2000000', type: 'income', category_id: 'cat-pay' }),
      ],
      CATEGORIES,
      '',
    );

    expect(toCategoryLines(lines)).toEqual([{ category: '식비', count: 1, total: 10_000 }]);
  });

  it('환불은 그 분류의 지출을 깎고 건수에는 남는다', () => {
    const lines = toExportLines(
      [
        tx({ day: '2026-09-01', amount: '30000', category_id: 'cat-food' }),
        tx({ day: '2026-09-02', amount: '10000', type: 'refund', category_id: 'cat-food' }),
      ],
      CATEGORIES,
      '',
    );

    expect(toCategoryLines(lines)).toEqual([{ category: '식비', count: 2, total: 20_000 }]);
  });
});

describe('CSV', () => {
  it('쉼표·따옴표·줄바꿈이 든 메모가 열을 밀지 않는다', () => {
    const memo = '커피, "아메리카노"\n영수증 없음';
    const csv = toCsv(['메모', '금액'], [[memo, 4500]]);

    expect(csv).toBe('메모,금액\r\n"커피, ""아메리카노""\n영수증 없음",4500');
    // 감싸고 나면 줄바꿈은 값 안에만 남는다. 줄 구분은 CRLF 하나뿐이다.
    expect(csv.split('\r\n')).toHaveLength(2);
  });

  it('감쌀 것이 없는 값은 그대로 둔다. 모두 감싸면 사람이 읽기 어렵다', () => {
    expect(toCsv(['날짜', '금액'], [['2026-09-10', 12_000]])).toBe('날짜,금액\r\n2026-09-10,12000');
  });

  it('숫자는 따옴표 없이 나간다. 감싸면 엑셀이 글자로 읽어 합계가 안 된다', () => {
    expect(toCsv(['금액'], [[-1500]])).toBe('금액\r\n-1500');
  });
});
