import { beforeEach, describe, expect, it } from 'vitest';

import type { KeyValueStore } from '../../shared/toss';

import {
  legacyMeansUsed,
  markTrialUsed,
  parseUsed,
  readTrialUsed,
  resetCreditsMemory,
} from './photoCredits';

/**
 * 여기서 지키는 것은 하나다. **이미 쓰던 사람에게 체험 한 장을 새로 주지 않는 것.**
 *
 * 무료분을 「하루 한 장」 에서 「평생 한 장」 으로 옮기면서 저장 칸이 바뀌었다. 옛 칸을
 * 안 보면 쓰던 사람 전부가 새 칸 기준으로 처음 쓰는 사람이 되어, 우리가 원가를 내고
 * 한 장씩 더 읽어 준다.
 */

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

beforeEach(() => {
  resetCreditsMemory();
});

describe('parseUsed', () => {
  it('`used` 만 썼다는 뜻이다', () => {
    expect(parseUsed('used')).toBe(true);
    expect(parseUsed(null)).toBe(false);
    expect(parseUsed('')).toBe(false);
    expect(parseUsed('1')).toBe(false);
  });
});

describe('legacyMeansUsed', () => {
  it('옛 칸에 값이 있으면 이미 사진을 읽어 본 사람이다', () => {
    // 그 칸은 실제로 읽어 낸 뒤에만 쓰였다. 남은 장수가 0이든 1이든 뜻은 같다.
    expect(legacyMeansUsed('2026-09-24:0')).toBe(true);
    expect(legacyMeansUsed('2026-09-24:1')).toBe(true);
  });

  it('없거나 모양이 어긋나면 안 쓴 것으로 친다', () => {
    expect(legacyMeansUsed(null)).toBe(false);
    expect(legacyMeansUsed('')).toBe(false);
    expect(legacyMeansUsed('used')).toBe(false);
    expect(legacyMeansUsed('2026-09-24')).toBe(false);
  });
});

describe('readTrialUsed', () => {
  it('처음 쓰는 사람은 체험이 남아 있다', async () => {
    await expect(readTrialUsed(fakeStore())).resolves.toBe(false);
  });

  it('체험을 쓴 표시가 있으면 끝난 것이다', async () => {
    await expect(readTrialUsed(fakeStore({ 'photo-trial': 'used' }))).resolves.toBe(true);
  });

  it('하루 한 장 시절에 사진을 읽어 본 사람은 체험을 새로 안 받는다', async () => {
    const store = fakeStore({ 'photo-credits': '2026-09-24:0' });
    await expect(readTrialUsed(store)).resolves.toBe(true);
  });

  it('저장소가 막혀도 이 세션에서 쓴 것은 기억한다', async () => {
    const broken = {
      get: () => Promise.reject(new Error('막힘')),
      set: () => Promise.reject(new Error('막힘')),
      remove: () => Promise.resolve(),
    } as unknown as KeyValueStore;

    await expect(readTrialUsed(broken)).resolves.toBe(false);
    await markTrialUsed(broken);
    // 못 썼어도 앱이 떠 있는 동안은 이어 센다. 안 그러면 열 때마다 공짜 한 장이 생긴다.
    await expect(readTrialUsed(broken)).resolves.toBe(true);
  });
});

describe('markTrialUsed', () => {
  it('표시를 남기고, 그다음 읽기부터 체험이 끝난 것으로 읽힌다', async () => {
    const store = fakeStore();
    await markTrialUsed(store);
    expect(store.data['photo-trial']).toBe('used');

    resetCreditsMemory();
    await expect(readTrialUsed(store)).resolves.toBe(true);
  });
});
