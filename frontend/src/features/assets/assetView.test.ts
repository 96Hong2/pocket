import { describe, expect, it } from 'vitest';

import type { AssetHistoryPointOut, AssetItemOut } from '../../shared/api';

import {
  formatQuantity,
  formatRate,
  formatSignedWon,
  holdingOf,
  itemMetaOf,
  monthOverMonth,
  pointLabel,
  rateChipOf,
  sanitizeQuantityInput,
} from './assetView';

function item(extra: Partial<AssetItemOut>): AssetItemOut {
  return { group: 'investment', label: null, amount: '0', sort_order: 0, ...extra };
}

function point(month: string, net: string): AssetHistoryPointOut {
  return {
    month,
    effective_on: `${month}-28`,
    total_assets: net,
    total_liabilities: '0',
    net_worth: net,
  };
}

describe('holdingOf', () => {
  it('투자 그룹의 종류로 수량 종목과 금액 종목을 가른다', () => {
    expect(holdingOf('investment', 'stock')).toBe('quantity');
    expect(holdingOf('investment', 'coin')).toBe('quantity');
    expect(holdingOf('investment', 'fund')).toBe('amount');
    expect(holdingOf('investment', null)).toBe('balance');
    expect(holdingOf('pension', null)).toBe('balance');
    expect(holdingOf('debt', null)).toBe('debt');
  });
});

describe('수량 표기와 입력', () => {
  it('정수부에 콤마를 찍고 소수부는 그대로 둔다', () => {
    expect(formatQuantity('2')).toBe('2');
    expect(formatQuantity('1234.5')).toBe('1,234.5');
    expect(formatQuantity('0.00412345')).toBe('0.00412345');
    expect(formatQuantity(null)).toBe('0');
  });

  it('소수점은 하나, 소수는 여덟 자리까지 받는다', () => {
    expect(sanitizeQuantityInput('0.003')).toBe('0.003');
    expect(sanitizeQuantityInput('1.2.3')).toBe('1.23');
    expect(sanitizeQuantityInput('.5')).toBe('0.5');
    expect(sanitizeQuantityInput('007')).toBe('7');
    expect(sanitizeQuantityInput('0.123456789')).toBe('0.12345678');
    expect(sanitizeQuantityInput('2주')).toBe('2');
  });
});

describe('수익률 칩', () => {
  it('평가 수익률은 부호와 소수 첫째 자리까지', () => {
    expect(formatRate(20)).toBe('+20%');
    expect(formatRate(6.666)).toBe('+6.7%');
    expect(formatRate(-3.25)).toBe('−3.3%');
    expect(
      rateChipOf(item({ kind: 'etf', rate: '6.7', rate_kind: 'valuation', unit_price: '32000' })),
    ).toEqual({
      text: '+6.7%',
      tone: 'up',
    });
  });

  it('판 기록 수익률은 「실현」 을 붙인다', () => {
    expect(rateChipOf(item({ kind: 'stock', rate: '20.0', rate_kind: 'realized' }))).toEqual({
      text: '+20% 실현',
      tone: 'up',
    });
  });

  it('수량 종목인데 1주 가격이 없으면 「현재가 없음」, 통장은 칩이 없다', () => {
    expect(rateChipOf(item({ kind: 'coin', unit_price: null }))).toEqual({
      text: '현재가 없음',
      tone: 'soft',
    });
    expect(rateChipOf(item({ group: 'cash' }))).toBeNull();
  });
});

describe('항목 줄 한 줄', () => {
  it('수량 종목은 보유 수량과 넣은 돈', () => {
    expect(itemMetaOf(item({ kind: 'stock', quantity: '2', cost_basis: '500000' }))).toBe(
      '2주 보유, 넣은 돈 500,000원',
    );
    expect(itemMetaOf(item({ kind: 'coin', quantity: '0', cost_basis: '0' }))).toBe('보유 없음');
  });

  it('금액 종목은 넣은 돈만, 통장은 줄이 없다', () => {
    expect(itemMetaOf(item({ kind: 'fund', cost_basis: '300000' }))).toBe('넣은 돈 300,000원');
    expect(itemMetaOf(item({ group: 'cash' }))).toBeNull();
  });
});

describe('지난달보다', () => {
  it('마지막 점과 바로 앞 달 점을 견준다', () => {
    expect(monthOverMonth([point('2026-09', '22590000'), point('2026-10', '22890000')])).toBe(
      300000,
    );
    expect(formatSignedWon(-300000)).toBe('−300,000원');
  });

  it('점이 하나뿐이거나 앞 달이 비면 null', () => {
    expect(monthOverMonth([])).toBeNull();
    expect(monthOverMonth([point('2026-10', '100')])).toBeNull();
    expect(monthOverMonth([point('2026-08', '100'), point('2026-10', '200')])).toBeNull();
  });

  it('달 이름은 마지막만 「지금」', () => {
    expect(pointLabel('2026-09', false)).toBe('9월');
    expect(pointLabel('2026-10', true)).toBe('지금');
  });
});
