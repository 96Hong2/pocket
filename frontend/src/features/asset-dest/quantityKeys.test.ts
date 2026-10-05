import { describe, expect, it } from 'vitest';

import { appendQuantityKey, dropQuantityKey, QUANTITY_INT_DIGITS } from './quantityKeys';

function type(keys: string[], start = ''): string {
  return keys.reduce((current, key) => appendQuantityKey(current, key), start);
}

describe('수량 키패드', () => {
  it('0 . 0 0 3 을 치면 0.003', () => {
    expect(type(['0', '.', '0', '0', '3'])).toBe('0.003');
  });

  it('「00」 자리는 「.」 로 읽는다', () => {
    expect(type(['2', '00', '5'])).toBe('2.5');
  });

  it('소수점은 한 번만 들어간다', () => {
    expect(type(['1', '.', '2', '.', '3'])).toBe('1.23');
  });

  it('점부터 치면 앞에 0 을 붙인다', () => {
    expect(type(['.', '5'])).toBe('0.5');
  });

  it('앞의 0 은 하나만 남는다', () => {
    expect(type(['0', '0', '7'])).toBe('7');
    expect(type(['0', '0'])).toBe('0');
  });

  it('소수는 8자리까지', () => {
    expect(type(['0', '.', '1', '2', '3', '4', '5', '6', '7', '8', '9'])).toBe('0.12345678');
  });

  it('정수부는 상한까지만', () => {
    const full = '9'.repeat(QUANTITY_INT_DIGITS);
    expect(appendQuantityKey(full, '9')).toBe(full);
    expect(appendQuantityKey(full, '.')).toBe(`${full}.`);
  });

  it('숫자와 점 밖의 키는 무시하고, 지우기는 한 자리씩', () => {
    expect(appendQuantityKey('1', 'x')).toBe('1');
    expect(dropQuantityKey('0.003')).toBe('0.00');
    expect(dropQuantityKey('')).toBe('');
  });
});
