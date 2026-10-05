import { describe, expect, it } from 'vitest';

import type { AssetItemOut } from '../../shared/api';
import { isSavingCategoryName, SAVING_HINT_KINDS, savingHintDestinations } from './savingHintRules';

describe('적금 안내 분류 이름', () => {
  it.each(['적금', '청년 적금', '저축', '주식 투자', '개인연금', '주택청약', 'IRP', 'irp 납입'])(
    '%s 는 안내를 세운다',
    (name) => {
      expect(isSavingCategoryName(name)).toBe(true);
    },
  );

  it.each(['식비', '카페', '교통', '', null, undefined])('%s 는 안 세운다', (name) => {
    expect(isSavingCategoryName(name)).toBe(false);
  });
});

describe('적금 안내에서 고를 곳', () => {
  function item(key: string, patch: Partial<AssetItemOut> = {}): AssetItemOut {
    return { group: 'cash', label: key, amount: '0', sort_order: 0, item_key: key, ...patch };
  }

  it('수량 종목은 빼고 통장, 펀드, 연금은 남긴다', () => {
    const list = [
      item('bank'),
      item('stock', { group: 'investment', kind: 'stock' }),
      item('coin', { group: 'investment', kind: 'coin' }),
      item('fund', { group: 'investment', kind: 'fund' }),
      item('irp', { group: 'pension' }),
    ];
    expect(savingHintDestinations(list).map((entry) => entry.item_key)).toEqual([
      'bank',
      'fund',
      'irp',
    ]);
  });

  it('새 항목 폼은 수량을 받을 자리가 없어 주식, ETF, 코인을 빼고 펀드, 채권, 기타만 보인다', () => {
    expect([...SAVING_HINT_KINDS].sort()).toEqual(['bond', 'fund', 'other']);
  });
});
