import { describe, expect, it } from 'vitest';

import { averageCostOf, quantityShapeOf, rateText, sameQuantity } from './saveInvest';

describe('rateText', () => {
  it('딱 떨어지는 수익률은 소수점을 떼고 부호를 붙인다', () => {
    expect(rateText('20.0')).toBe('+20%');
  });

  it('0 은 부호 없이 적는다. 서버가 보낸 -0.0 도 같다', () => {
    expect(rateText('0.0')).toBe('0%');
    expect(rateText('-0.0')).toBe('0%');
  });

  it('소수 한 자리는 남기고 빼기는 − 로 적는다', () => {
    expect(rateText('-15.4')).toBe('−15.4%');
    expect(rateText('7.5')).toBe('+7.5%');
  });
});

describe('quantityShapeOf', () => {
  it('수량 칸이 없으면 none, 정수면 int, 소수면 decimal', () => {
    expect(quantityShapeOf(null)).toBe('none');
    expect(quantityShapeOf('2')).toBe('int');
    expect(quantityShapeOf('0.003')).toBe('decimal');
  });
});

describe('averageCostOf', () => {
  it('500,000원에 2주면 1주 250,000원', () => {
    expect(averageCostOf('500000', '2')).toBe(250000);
  });

  it('나머지는 0.5 에서 올린다(100원에 3개 → 33원, 5원에 2개 → 3원)', () => {
    expect(averageCostOf('100', '3')).toBe(33);
    expect(averageCostOf('5', '2')).toBe(3);
  });

  it('소수 수량도 정수로 센다(42,000원에 0.003개 → 14,000,000원)', () => {
    expect(averageCostOf('42000', '0.003')).toBe(14000000);
  });

  it('보유가 없으면 null', () => {
    expect(averageCostOf('500000', '0')).toBeNull();
    expect(averageCostOf('500000', null)).toBeNull();
  });
});

describe('sameQuantity', () => {
  it('뒤 0 과 끝 점이 달라도 같은 수량이면 참', () => {
    expect(sameQuantity('2.', '2')).toBe(true);
    expect(sameQuantity('0.0030', '0.003')).toBe(true);
    expect(sameQuantity('1', '2')).toBe(false);
    expect(sameQuantity('', '0')).toBe(false);
  });
});
