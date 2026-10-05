import { describe, expect, it } from 'vitest';

import type { AssetCaptureItemOut, AssetItemOut } from '../../shared/api';

import { captureDelta, captureRowState, mergeCaptured } from './captureMerge';

const ITEMS: AssetItemOut[] = [
  { group: 'cash', label: '청년도약계좌', amount: '3000000', sort_order: 0, item_key: 'k1' },
  { group: 'cash', label: '카카오뱅크', amount: '1250000', sort_order: 1, item_key: 'k2' },
  {
    group: 'investment',
    label: '삼성전자',
    amount: '700000',
    sort_order: 2,
    item_key: 'k3',
    kind: 'stock',
    quantity: '10',
  },
];

const ROWS: AssetCaptureItemOut[] = [
  {
    name: '청년도약계좌',
    amount: '3300000',
    group: 'cash',
    item_key: 'k1',
    current_amount: '3000000',
  },
  {
    name: '카카오뱅크',
    amount: '1250000',
    group: 'cash',
    item_key: 'k2',
    current_amount: '1250000',
  },
  {
    name: '연금저축펀드',
    amount: '2100000',
    group: 'pension',
    item_key: null,
    current_amount: null,
  },
];

describe('캡처 검토 줄', () => {
  it('기존 항목은 그대로나 바뀐 금액, 새 이름은 새 항목이다', () => {
    expect(ROWS.map(captureRowState)).toEqual(['changed', 'same', 'new']);
    expect(ROWS.map(captureDelta)).toEqual([300000, 0, 0]);
  });
});

describe('캡처 저장 목록', () => {
  it('기존 목록을 다 싣고 읽은 금액만 바꾸며 새 이름을 끝에 붙인다', () => {
    expect(mergeCaptured(ITEMS, ROWS)).toEqual([
      { group: 'cash', label: '청년도약계좌', amount: '3300000', item_key: 'k1' },
      { group: 'cash', label: '카카오뱅크', amount: '1250000', item_key: 'k2' },
      { group: 'investment', label: '삼성전자', amount: '700000', item_key: 'k3' },
      { group: 'pension', label: '연금저축펀드', amount: '2100000' },
    ]);
  });

  it('고르지 않은 줄은 기존 값을 지킨다', () => {
    expect(mergeCaptured(ITEMS, [])).toHaveLength(3);
    expect(mergeCaptured(ITEMS, [])[0].amount).toBe('3000000');
  });
});
