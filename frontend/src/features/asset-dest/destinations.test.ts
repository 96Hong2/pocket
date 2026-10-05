import { describe, expect, it } from 'vitest';

import type { AssetItemOut, AssetsOut } from '../../shared/api';
import { sellPreviewOf } from './assetMath';
import { destBodyOf, destGridOf, destinationsOf, destSubOf, findSameDest } from './destinations';

function item(key: string, patch: Partial<AssetItemOut> = {}): AssetItemOut {
  return { group: 'cash', label: key, amount: '0', sort_order: 0, item_key: key, ...patch };
}

function assets(items: AssetItemOut[]): AssetsOut {
  const zero = { total_assets: '0', total_liabilities: '0', net_worth: '0', month_saved: '0' };
  const groups = (['cash', 'investment', 'pension', 'deposit', 'debt'] as const).map((group) => ({
    group,
    total: '0',
  }));
  return { snapshot: null, summary: zero, groups, all_groups: groups, items } as AssetsOut;
}

describe('어디에 목록', () => {
  it('부채와 키 없는 항목은 빼고 그룹 차례로 세운다', () => {
    const list = destinationsOf(
      assets([
        item('loan', { group: 'debt' }),
        item('stock', { group: 'investment', kind: 'stock' }),
        item('old', { item_key: null }),
        item('bank'),
      ]),
    );
    expect(list.map((entry) => entry.item_key)).toEqual(['bank', 'stock']);
  });

  it('격자는 매달 넣는 항목 먼저 다섯, 보증금은 매달이 아니면 뺀다', () => {
    const list = [
      item('a'),
      item('b'),
      item('house', { group: 'deposit' }),
      item('youth', { monthly_amount: '300000' }),
      item('c'),
      item('d'),
      item('e'),
    ];
    expect(destGridOf(list).map((entry) => entry.item_key)).toEqual(['youth', 'a', 'b', 'c', 'd']);
  });

  it('고른 항목이 다섯 안에 없으면 다섯째 자리에 선다', () => {
    const list = ['a', 'b', 'c', 'd', 'e', 'f'].map((key) => item(key));
    expect(destGridOf(list, 'f').map((entry) => entry.item_key)).toEqual(['a', 'b', 'c', 'd', 'f']);
  });

  it('접힌 줄은 수량 종목이면 보유 수량, 아니면 금액', () => {
    const stock = item('samsung', {
      group: 'investment',
      kind: 'stock',
      quantity: '2',
      cost_basis: '500000',
      amount: '500000',
    });
    expect(destSubOf({ type: 'item', itemKey: 'samsung', item: stock })).toBe('2주 보유');
    const bank = item('bank', { amount: '1200000' });
    expect(destSubOf({ type: 'item', itemKey: 'bank', item: bank })).toBe('1,200,000원');
  });

  it('같은 그룹, 종류, 이름이 있으면 새로 만들지 않고 그 항목을 쓴다', () => {
    const stock = item('samsung', { group: 'investment', kind: 'stock', label: '삼성전자' });
    expect(findSameDest([stock], { group: 'investment', kind: 'stock', label: ' 삼성전자 ' })).toBe(
      stock,
    );
    expect(
      findSameDest([stock], { group: 'investment', kind: 'etf', label: '삼성전자' }),
    ).toBeNull();
  });

  it('본문에는 고른 쪽 하나만 싣는다', () => {
    expect(destBodyOf({ type: 'item', itemKey: 'k', item: item('k') })).toEqual({
      asset_item_key: 'k',
    });
    expect(
      destBodyOf({ type: 'new', asset: { group: 'cash', kind: 'stock', label: ' 적금 ' } }),
    ).toEqual({ new_asset: { group: 'cash', kind: null, label: '적금' } });
  });

  it('고른 항목으로 팔기 미리보기를 세운다(검산 ①)', () => {
    const stock = item('samsung', {
      group: 'investment',
      kind: 'stock',
      quantity: '2',
      cost_basis: '500000',
      amount: '500000',
    });
    const check = sellPreviewOf(stock, '1', 300_000);
    expect(check?.ok && check.preview.rate).toBe('20.0');
    expect(sellPreviewOf(item('bank'), '1', 1)).toBeNull();
  });
});
