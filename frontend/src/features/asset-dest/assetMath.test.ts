import { describe, expect, it } from 'vitest';

import {
  formatScaledQuantity,
  parseQuantity,
  previewSell,
  previewValuation,
  quantityValue,
  ratePercent,
  type SellPreview,
} from './assetMath';

function sold(check: ReturnType<typeof previewSell>): SellPreview {
  if (!check.ok) throw new Error(`미리보기 없음: ${check.reason}`);
  return check.preview;
}

// PRD 「수익률이 제대로 계산되나」 검산 표. 서버 tests/domain/test_asset_ledger.py 의 같은 예와 값이 같다.
describe('검산 표', () => {
  it('① 삼성전자 2주를 500,000원에 사고 1주를 300,000원 받고 팔면 +50,000원, +20.0%', () => {
    const preview = sold(
      previewSell({
        holding: 'quantity',
        heldQuantity: '2',
        costBasis: 500_000,
        soldQuantity: '1',
        received: 300_000,
      }),
    );
    expect(preview.soldCost).toBe(250_000);
    expect(preview.gain).toBe(50_000);
    expect(preview.rate).toBe('20.0');
    expect(preview.remainingQuantity).toBe('1');
    expect(preview.remainingCost).toBe(250_000);
  });

  it('② 2주 500,000원 + 1주 280,000원에서 2주를 600,000원 받고 팔면 +80,000원, +15.4%', () => {
    const preview = sold(
      previewSell({
        holding: 'quantity',
        heldQuantity: '3',
        costBasis: 500_000 + 280_000,
        soldQuantity: '2',
        received: 600_000,
      }),
    );
    expect(preview.soldCost).toBe(520_000);
    expect(preview.gain).toBe(80_000);
    expect(preview.rate).toBe('15.4');
    expect(preview.remainingQuantity).toBe('1');
    expect(preview.remainingCost).toBe(260_000);
  });

  it('③ ② 뒤에 지금 1주 가격을 300,000원으로 적으면 평가 +15.4%', () => {
    const after = sold(
      previewSell({
        holding: 'quantity',
        heldQuantity: '3',
        costBasis: 780_000,
        soldQuantity: '2',
        received: 600_000,
      }),
    );
    const valuation = previewValuation({
      holding: 'quantity',
      quantity: after.remainingQuantity ?? '0',
      costBasis: after.remainingCost,
      unitPrice: 300_000,
    });
    expect(valuation.value).toBe(300_000);
    expect(valuation.rate).toBe('15.4');
  });

  it('④ 펀드 넣은 돈 1,000,000원, 지금 1,200,000원에서 300,000원을 빼면 +50,000원, +20.0%', () => {
    const preview = sold(
      previewSell({
        holding: 'amount',
        currentAmount: 1_200_000,
        costBasis: 1_000_000,
        received: 300_000,
      }),
    );
    expect(preview.soldCost).toBe(250_000);
    expect(preview.gain).toBe(50_000);
    expect(preview.rate).toBe('20.0');
    expect(preview.remainingCost).toBe(750_000);
    expect(preview.remainingAmount).toBe(900_000);
    const valuation = previewValuation({
      holding: 'amount',
      currentAmount: preview.remainingAmount ?? 0,
      costBasis: preview.remainingCost,
    });
    expect(valuation.rate).toBe('20.0');
  });
});

describe('팔기 규칙', () => {
  it('전부 팔면 남은 넣은 돈을 반올림 없이 그대로 뺀다', () => {
    const preview = sold(
      previewSell({
        holding: 'quantity',
        heldQuantity: '3',
        costBasis: 1_000_000,
        soldQuantity: '3',
        received: 1_200_000,
      }),
    );
    expect(preview.all).toBe(true);
    expect(preview.soldCost).toBe(1_000_000);
    expect(preview.remainingCost).toBe(0);
    expect(preview.remainingQuantity).toBe('0');
    expect(preview.gain).toBe(200_000);
    expect(preview.rate).toBe('20.0');
  });

  it('판 몫의 넣은 돈은 원 단위에서 반올림한다(2.5원 → 3원)', () => {
    const preview = sold(
      previewSell({
        holding: 'quantity',
        heldQuantity: '2',
        costBasis: 5,
        soldQuantity: '1',
        received: 3,
      }),
    );
    expect(preview.soldCost).toBe(3);
    expect(preview.remainingCost).toBe(2);
  });

  it('코인 소수 수량도 평균 매수가로 판다', () => {
    const preview = sold(
      previewSell({
        holding: 'quantity',
        heldQuantity: '0.003',
        costBasis: 300_000,
        soldQuantity: '0.001',
        received: 120_000,
      }),
    );
    expect(preview.soldCost).toBe(100_000);
    expect(preview.remainingQuantity).toBe('0.002');
  });

  it('보유보다 많이 팔면 미리보기를 세우지 않는다', () => {
    expect(
      previewSell({
        holding: 'quantity',
        heldQuantity: '2',
        costBasis: 500_000,
        soldQuantity: '3',
        received: 900_000,
      }),
    ).toEqual({ ok: false, reason: 'over_sell' });
    expect(
      previewSell({
        holding: 'quantity',
        heldQuantity: '0.003',
        costBasis: 300_000,
        soldQuantity: '0.00300001',
        received: 1,
      }),
    ).toEqual({ ok: false, reason: 'over_sell' });
  });

  it('금액 종목은 지금 금액보다 많이 뺄 수 없다', () => {
    expect(
      previewSell({
        holding: 'amount',
        currentAmount: 1_200_000,
        costBasis: 1_000_000,
        received: 1_200_001,
      }),
    ).toEqual({ ok: false, reason: 'over_sell' });
  });

  it('수량이나 받은 돈이 비면 미리보기가 없다', () => {
    const base = { holding: 'quantity', heldQuantity: '2', costBasis: 500_000 } as const;
    expect(previewSell({ ...base, soldQuantity: '', received: 300_000 })).toEqual({
      ok: false,
      reason: 'no_quantity',
    });
    expect(previewSell({ ...base, soldQuantity: '0.', received: 300_000 })).toEqual({
      ok: false,
      reason: 'no_quantity',
    });
    expect(previewSell({ ...base, soldQuantity: '1', received: 0 })).toEqual({
      ok: false,
      reason: 'no_amount',
    });
  });
});

describe('수익률과 수량 문자열', () => {
  it('수익률은 소수 첫째 자리에서 반올림하고 손해는 빼기로 적는다', () => {
    expect(ratePercent(80_000n, 520_000n)).toBe('15.4');
    expect(ratePercent(-80_000n, 520_000n)).toBe('-15.4');
    expect(ratePercent(1n, 0n)).toBeNull();
  });

  it('수량은 1e8 배 정수로 읽고 뒤 0 없이 되돌린다', () => {
    expect(parseQuantity('0.003')).toBe(300_000n);
    expect(parseQuantity('12.')).toBe(1_200_000_000n);
    expect(parseQuantity('0.123456789')).toBeNull();
    expect(parseQuantity('1.2.3')).toBeNull();
    expect(formatScaledQuantity(200_000n)).toBe('0.002');
    expect(quantityValue('3.50')).toBe('3.5');
    expect(quantityValue('0.')).toBeNull();
  });
});
