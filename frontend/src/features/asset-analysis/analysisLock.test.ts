import { describe, expect, it } from 'vitest';

import type { KeyValueStore } from '../../shared/toss';

import {
  ANALYSIS_LOCK_KEY,
  analysisLockState,
  parseAnalysisLock,
  readAnalysisLock,
  withFingerprint,
  writeAnalysisLock,
} from './analysisLock';

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    get: (key) => Promise.resolve(data[key] ?? null),
    set: (key, value) => {
      data[key] = value;
      return Promise.resolve();
    },
    remove: (key) => {
      delete data[key];
      return Promise.resolve();
    },
  };
}

const blockedStore: KeyValueStore = {
  get: () => Promise.reject(new Error('blocked')),
  set: () => Promise.reject(new Error('blocked')),
  remove: () => Promise.reject(new Error('blocked')),
};

describe('분석 잠금 판정', () => {
  it('본 적 없는 범위는 잠겨 있다', () => {
    expect(analysisLockState({}, 'all', 'a1')).toBe('locked');
  });

  it('본 지문과 같으면 열리고, 다르면 다시 잠긴다', () => {
    const lock = withFingerprint({}, 'all', 'a1');
    expect(analysisLockState(lock, 'all', 'a1')).toBe('open');
    expect(analysisLockState(lock, 'all', 'a2')).toBe('stale');
  });

  it('범위마다 따로 센다', () => {
    const lock = withFingerprint(withFingerprint({}, 'all', 'a1'), 'stock', 's1');
    expect(analysisLockState(lock, 'stock', 's1')).toBe('open');
    expect(analysisLockState(lock, 'cash', 'c1')).toBe('locked');
    expect(withFingerprint(lock, 'stock', 's2')).toEqual({ all: 'a1', stock: 's2' });
  });

  it('저장소나 지문을 모르면 판정하지 않는다', () => {
    expect(analysisLockState(null, 'all', 'a1')).toBe('unknown');
    expect(analysisLockState({ all: 'a1' }, 'all', null)).toBe('unknown');
    expect(analysisLockState({ all: 'a1' }, 'all', '')).toBe('unknown');
  });
});

describe('분석 잠금 저장소', () => {
  it('모양이 틀린 값은 빈 잠금으로 읽는다', () => {
    expect(parseAnalysisLock(null)).toEqual({});
    expect(parseAnalysisLock('')).toEqual({});
    expect(parseAnalysisLock('{깨짐')).toEqual({});
    expect(parseAnalysisLock('["all"]')).toEqual({});
    expect(parseAnalysisLock('{"all":3,"stock":"s1","coin":"x"}')).toEqual({ stock: 's1' });
  });

  it('적은 것을 그대로 다시 읽는다', async () => {
    const store = memoryStore();
    await writeAnalysisLock(store, { all: 'a1', cash: 'c1' });
    expect(JSON.parse(store.data[ANALYSIS_LOCK_KEY])).toEqual({ all: 'a1', cash: 'c1' });
    expect(await readAnalysisLock(store)).toEqual({ all: 'a1', cash: 'c1' });
  });

  it('막힌 저장소에서도 던지지 않는다', async () => {
    await expect(readAnalysisLock(blockedStore)).resolves.toEqual({});
    await expect(writeAnalysisLock(blockedStore, { all: 'a1' })).resolves.toBeUndefined();
  });
});
