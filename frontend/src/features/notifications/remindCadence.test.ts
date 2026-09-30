import { describe, expect, it } from 'vitest';

import {
  REMIND_GAP_DAYS,
  REMIND_RECORDS_BETWEEN,
  afterRemindClose,
  isRemindDue,
  parseRemindNudge,
  readRemindNudge,
} from './remindCadence';

describe('isRemindDue', () => {
  it('한 번도 안 닫았으면 늘 묻는다', () => {
    expect(isRemindDue(null, '2026-09-30', 1)).toBe(true);
  });

  it('닫을수록 간격이 3, 7, 14, 30일로 길어지고 그 뒤로는 30일이다', () => {
    expect(REMIND_GAP_DAYS).toEqual([3, 7, 14, 30]);
    const cases: [number, number][] = [
      [1, 3],
      [2, 7],
      [3, 14],
      [4, 30],
      [9, 30],
    ];
    for (const [closes, gap] of cases) {
      const state = { closes, closedOn: '2026-09-01', recordsAtClose: 10 };
      const before = `2026-09-${String(1 + gap - 1).padStart(2, '0')}`;
      const on = gap === 30 ? '2026-10-01' : `2026-09-${String(1 + gap).padStart(2, '0')}`;
      expect(isRemindDue(state, before, 20)).toBe(false);
      expect(isRemindDue(state, on, 20)).toBe(true);
    }
  });

  it('날이 지나도 그 사이 세 번은 적었어야 묻는다', () => {
    expect(REMIND_RECORDS_BETWEEN).toBe(3);
    const state = { closes: 1, closedOn: '2026-09-01', recordsAtClose: 5 };
    expect(isRemindDue(state, '2026-09-20', 7)).toBe(false);
    expect(isRemindDue(state, '2026-09-20', 8)).toBe(true);
  });

  it('설정에서 끈 사람은 기록 수를 안 보고 날짜만 본다', () => {
    const state = { closes: 4, closedOn: '2026-09-01', recordsAtClose: null };
    expect(isRemindDue(state, '2026-09-30', 0)).toBe(false);
    expect(isRemindDue(state, '2026-10-01', 0)).toBe(true);
  });

  it('달과 해를 넘겨도 날 수를 바로 센다', () => {
    const state = { closes: 1, closedOn: '2026-12-30', recordsAtClose: 0 };
    expect(isRemindDue(state, '2027-01-01', 3)).toBe(false);
    expect(isRemindDue(state, '2027-01-02', 3)).toBe(true);
  });
});

describe('afterRemindClose', () => {
  it('닫을 때마다 하나씩 센다', () => {
    const first = afterRemindClose(null, '2026-09-01', 3);
    expect(first).toEqual({ closes: 1, closedOn: '2026-09-01', recordsAtClose: 3 });
    expect(afterRemindClose(first, '2026-09-05', 7).closes).toBe(2);
  });

  it('설정에서 끄면 가장 긴 간격부터 센다', () => {
    expect(afterRemindClose(null, '2026-09-01', null, true).closes).toBe(REMIND_GAP_DAYS.length);
  });
});

describe('parseRemindNudge', () => {
  it('모양이 틀린 값은 없는 것으로 본다', () => {
    expect(parseRemindNudge(null)).toBeNull();
    expect(parseRemindNudge('')).toBeNull();
    expect(parseRemindNudge('not json')).toBeNull();
    expect(parseRemindNudge('{"closes":0,"closedOn":"2026-09-01","recordsAtClose":1}')).toBeNull();
    expect(parseRemindNudge('{"closes":1,"closedOn":"9/1","recordsAtClose":1}')).toBeNull();
    expect(parseRemindNudge('{"closes":1,"closedOn":"2026-09-01","recordsAtClose":"1"}')).toBeNull();
  });

  it('맞는 값은 그대로 읽는다', () => {
    expect(
      parseRemindNudge('{"closes":2,"closedOn":"2026-09-01","recordsAtClose":null}'),
    ).toEqual({ closes: 2, closedOn: '2026-09-01', recordsAtClose: null });
  });
});

describe('readRemindNudge', () => {
  function store(initial: Record<string, string>) {
    const data = new Map(Object.entries(initial));
    return {
      data,
      get: async (key: string) => data.get(key) ?? null,
      set: async (key: string, value: string) => void data.set(key, value),
      remove: async (key: string) => void data.delete(key),
    };
  }

  it('예전 두 표를 닫은 횟수로 옮기고 오늘을 닫은 날로 적어 둔다', async () => {
    const s = store({ 'card-dismissed-remind': '', 'card-dismissed-remind-again': '' });
    const moved = await readRemindNudge(s, '2026-09-30', 12);
    expect(moved).toEqual({ closes: 2, closedOn: '2026-09-30', recordsAtClose: 12 });
    // 적어 두지 않으면 열 때마다 오늘이 닫은 날이 되어 영영 안 뜬다.
    expect(JSON.parse(s.data.get('remind-nudge') ?? 'null')).toEqual(moved);
    expect(await readRemindNudge(s, '2026-10-09', 30)).toEqual(moved);
  });

  it('닫은 적이 없으면 아무것도 적지 않는다', async () => {
    const s = store({});
    expect(await readRemindNudge(s, '2026-09-30', 1)).toBeNull();
    expect(s.data.has('remind-nudge')).toBe(false);
  });
});
