import { describe, expect, it } from 'vitest';

import type { AssetCaptureItemOut, AssetItemOut } from '../../shared/api';

import { itemMetaOf, rateChipOf } from '../assets';

import { captureDelta, captureRowState, capturedItemOf, mergeCaptured } from './captureMerge';

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

/* 캡처 예. 서버 tests/domain/test_asset_capture.py 와 같은 숫자다. */
const NVIDIA: AssetCaptureItemOut = {
  name: '엔비디아',
  amount: '2801830',
  group: 'investment',
  item_key: null,
  current_amount: null,
  kind: 'stock',
  quantity: '2',
  cost_basis: '2000000',
  unit_price: '1400915',
  rate: '40.1',
};
const MSFT: AssetCaptureItemOut = {
  name: '마이크로소프트',
  amount: '47446',
  group: 'investment',
  item_key: null,
  current_amount: null,
};

describe('넣은 돈과 수량까지 읽은 줄', () => {
  it('엔비디아 2주는 자산 화면 줄과 같은 말투와 칩으로 보인다', () => {
    const view = capturedItemOf(NVIDIA);
    expect(itemMetaOf(view)).toBe('2주 보유, 넣은 돈 2,000,000원');
    expect(rateChipOf(view)).toEqual({ text: '+40.1%', tone: 'up' });
  });

  it('넣은 돈을 못 읽은 줄은 한 줄도 칩도 없다', () => {
    const view = capturedItemOf(MSFT);
    expect(itemMetaOf(view)).toBeNull();
    expect(rateChipOf(view)).toBeNull();
  });

  it('저장하면 읽은 종류, 수량, 넣은 돈, 1주 가격을 싣고 못 읽은 줄은 금액만 싣는다', () => {
    expect(mergeCaptured([], [NVIDIA, MSFT])).toEqual([
      {
        group: 'investment',
        label: '엔비디아',
        amount: '2801830',
        kind: 'stock',
        quantity: '2',
        cost_basis: '2000000',
        unit_price: '1400915',
      },
      { group: 'investment', label: '마이크로소프트', amount: '47446' },
    ]);
  });

  it('기존 항목도 읽은 값으로 채운다', () => {
    const items: AssetItemOut[] = [
      { group: 'investment', label: '엔비디아', amount: '2000000', sort_order: 0, item_key: 'k9' },
    ];
    const [merged] = mergeCaptured(items, [
      { ...NVIDIA, item_key: 'k9', current_amount: '2000000' },
    ]);
    expect(merged).toMatchObject({
      item_key: 'k9',
      kind: 'stock',
      quantity: '2',
      cost_basis: '2000000',
    });
  });
});
