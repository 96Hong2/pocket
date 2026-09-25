import { describe, expect, it } from 'vitest';

import type { KeyValueStore } from '../toss';

import { clearAdOnScreen, markAdOnScreen, parseMark, takeStuckMark } from './stuckAd';

function fakeStore(initial: Record<string, string> = {}): KeyValueStore & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    get: (key: string) => Promise.resolve(data[key] ?? null),
    set: (key: string, value: string) => {
      data[key] = value;
      return Promise.resolve();
    },
    remove: (key: string) => {
      delete data[key];
      return Promise.resolve();
    },
  } as KeyValueStore & { data: Record<string, string> };
}

const broken = {
  get: () => Promise.reject(new Error('막힘')),
  set: () => Promise.reject(new Error('막힘')),
  remove: () => Promise.reject(new Error('막힘')),
} as unknown as KeyValueStore;

describe('parseMark', () => {
  it('값이 있으면 그 자리의 광고였다는 뜻이다', () => {
    expect(parseMark('photo')).toEqual({ where: 'photo' });
  });

  it('없으면 갇힌 적이 없다', () => {
    expect(parseMark(null)).toBe(null);
    expect(parseMark('')).toBe(null);
  });
});

describe('표를 적고 지우기', () => {
  it('정상으로 끝나면 표가 안 남는다', async () => {
    const store = fakeStore();
    await markAdOnScreen(store, 'photo');
    await clearAdOnScreen(store);
    await expect(takeStuckMark(store)).resolves.toBe(null);
  });

  it('지우지 않고 끝났으면 다음에 열 때 잡힌다', async () => {
    const store = fakeStore();
    await markAdOnScreen(store, 'goal');
    await expect(takeStuckMark(store)).resolves.toEqual({ where: 'goal' });
  });

  it('한 번 세고 나면 다시 안 센다', async () => {
    // 안 지우면 한 번 갇힌 사람이 앱을 열 때마다 계속 세어진다.
    const store = fakeStore();
    await markAdOnScreen(store, 'photo');
    await takeStuckMark(store);
    await expect(takeStuckMark(store)).resolves.toBe(null);
  });

  it('저장소가 막혀도 던지지 않는다', async () => {
    // 세는 일 때문에 광고가 막히면 안 된다. 그 한 판을 못 셀 뿐이다.
    await expect(markAdOnScreen(broken, 'photo')).resolves.toBeUndefined();
    await expect(clearAdOnScreen(broken)).resolves.toBeUndefined();
    await expect(takeStuckMark(broken)).resolves.toBe(null);
  });
});
