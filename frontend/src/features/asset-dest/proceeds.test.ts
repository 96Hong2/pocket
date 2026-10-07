import { describe, expect, it } from 'vitest';

import type { AssetItemOut } from '../../shared/api';
import {
  accountNameOf,
  findSameAccount,
  proceedsAccountsOf,
  proceedsBodyOf,
  proceedsNameOf,
  proceedsResultOf,
} from './proceeds';

function item(over: Partial<AssetItemOut> & Pick<AssetItemOut, 'group'>): AssetItemOut {
  return {
    id: over.item_key ?? 'row',
    label: null,
    amount: '0',
    confidence: 1,
    item_key: null,
    ...over,
  } as AssetItemOut;
}

const KAKAO = item({ group: 'cash', label: '카카오뱅크', amount: '1000000', item_key: 'k' });
const TOSS = item({ group: 'cash', label: '토스뱅크 통장', amount: '500000', item_key: 't' });
const STOCK = item({ group: 'investment', kind: 'stock', label: '삼성전자', item_key: 's' });
const PENSION = item({ group: 'pension', label: 'IRP', item_key: 'p' });
const DEPOSIT = item({ group: 'deposit', label: '전세 보증금', item_key: 'd' });

describe('받은 돈 넣을 곳', () => {
  it('고를 수 있는 곳은 예적금·현금 항목뿐이다', () => {
    const listed = proceedsAccountsOf([KAKAO, STOCK, PENSION, TOSS, DEPOSIT]);

    expect(listed.map((row) => row.label)).toEqual(['카카오뱅크', '토스뱅크 통장']);
  });

  it('키 없는 옛 항목과 판 항목 자신은 뺀다', () => {
    const keyless = item({ group: 'cash', label: '옛 통장' });

    expect(proceedsAccountsOf([KAKAO, keyless, TOSS], 'k').map((row) => row.label)).toEqual([
      '토스뱅크 통장',
    ]);
  });

  it('이름 없는 통장은 그룹 이름으로 부른다', () => {
    expect(accountNameOf({ group: 'cash', label: null })).toBe('예적금·현금');
    expect(accountNameOf(KAKAO)).toBe('카카오뱅크');
  });

  it('같은 이름의 통장이 있으면 새로 만들지 않고 그 통장을 찾는다', () => {
    expect(findSameAccount([KAKAO, TOSS], ' 토스뱅크 통장 ')?.item_key).toBe('t');
    expect(findSameAccount([KAKAO, TOSS], '케이뱅크')).toBeNull();
    expect(findSameAccount([KAKAO, TOSS], '   ')).toBeNull();
  });

  it('고른 것마다 고치기 본문에 싣는 칸이 다르고 넣지 않기는 null 을 보낸다', () => {
    expect(proceedsBodyOf({ type: 'item', itemKey: 'k', name: '카카오뱅크' })).toEqual({
      asset_proceeds_key: 'k',
    });
    expect(proceedsBodyOf({ type: 'new', label: ' 케이뱅크 ' })).toEqual({
      new_proceeds_asset: { label: '케이뱅크' },
    });
    expect(proceedsBodyOf({ type: 'none' })).toEqual({ asset_proceeds_key: null });
  });

  it('줄에 보일 이름과 로그에 남길 결과', () => {
    expect(proceedsNameOf({ type: 'item', itemKey: 'k', name: '카카오뱅크' })).toBe('카카오뱅크');
    expect(proceedsNameOf({ type: 'new', label: ' 케이뱅크 ' })).toBe('케이뱅크');
    expect(proceedsNameOf({ type: 'none' })).toBeNull();
    expect(proceedsResultOf({ type: 'item', itemKey: 'k', name: '카카오뱅크' })).toBe('picked');
    expect(proceedsResultOf({ type: 'new', label: '케이뱅크' })).toBe('created');
    expect(proceedsResultOf({ type: 'none' })).toBe('cleared');
  });
});
