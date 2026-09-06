import { describe, expect, it } from 'vitest';

import { DEFAULT_RECORD_TAB, recordMethodOf, resolveRecordTab, type RecordTab } from './recordTab';

const ALL_TABS: RecordTab[] = ['keypad', 'nl', 'capture', 'receipt'];

describe('resolveRecordTab', () => {
  it('마지막에 쓴 방식이 그 방식의 탭으로 간다', () => {
    // 캡처 탭만 서버 이름과 다르다. 여기가 어긋나면 캡처로 적은 사람이 키패드를 만난다.
    expect(resolveRecordTab('keypad')).toBe('keypad');
    expect(resolveRecordTab('nl')).toBe('nl');
    expect(resolveRecordTab('screenshot')).toBe('capture');
    expect(resolveRecordTab('receipt')).toBe('receipt');
  });

  it('기록이 한 건도 없으면 키패드로 연다', () => {
    // 서버는 아직 고른 적 없음을 null 로 준다. 조회 중이면 화면에는 undefined 로 온다.
    expect(resolveRecordTab(null)).toBe('keypad');
    expect(resolveRecordTab(undefined)).toBe('keypad');
    expect(DEFAULT_RECORD_TAB).toBe('keypad');
  });

  it('모르는 방식이 와도 시트가 열린다', () => {
    // 서버가 방식을 늘리면 옛 앱은 그 값을 모른다. 그때 빈 시트가 열리면 기록을 못 한다.
    const unknown = 'voice' as Parameters<typeof resolveRecordTab>[0];

    expect(resolveRecordTab(unknown)).toBe('keypad');
  });
});

describe('recordMethodOf', () => {
  it('탭을 방식으로 되돌려도 같은 탭이 나온다', () => {
    for (const tab of ALL_TABS) {
      expect(resolveRecordTab(recordMethodOf(tab)), tab).toBe(tab);
    }
  });
});
