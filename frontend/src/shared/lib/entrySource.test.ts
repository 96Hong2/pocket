import { describe, expect, it } from 'vitest';

import type { KeyValueStore } from '../toss';

import { firstEntrySource, parseEntrySource } from './entrySource';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value);
    },
    remove: async (key) => {
      data.delete(key);
    },
  };
}

describe('parseEntrySource', () => {
  it('토스가 붙인 입구와 우리 표시를 함께 읽는다', () => {
    expect(parseEntrySource('?referrer=external_link&src=threads_bio')).toEqual({
      referrer: 'external_link',
      src: 'threads_bio',
    });
  });

  it('없으면 null 이다', () => {
    expect(parseEntrySource('')).toEqual({ referrer: null, src: null });
  });

  it('영문·숫자·밑줄이 아닌 값은 버린다. 사람이 친 문장이 집계 칸으로 흘러들면 안 된다', () => {
    expect(parseEntrySource('?src=%EC%8A%A4%EB%A0%88%EB%93%9C&referrer=a%20b').src).toBeNull();
    expect(parseEntrySource('?referrer=a%20b').referrer).toBeNull();
    expect(parseEntrySource(`?src=${'x'.repeat(41)}`).src).toBeNull();
  });

  it('대문자는 소문자로 맞춘다. 같은 채널이 두 칸으로 갈리지 않게', () => {
    expect(parseEntrySource('?src=Threads_Bio').src).toBe('threads_bio');
  });
});

describe('firstEntrySource', () => {
  it('첫 실행이면 우리 표시를 먼저 적는다', async () => {
    const store = memoryStore();
    const first = await firstEntrySource(
      store,
      { referrer: 'external_link', src: 'reels_01' },
      true,
    );
    expect(first).toBe('reels_01');
    expect(store.data.get('entry-first-source')).toBe('reels_01');
  });

  it('우리 표시가 없으면 토스 입구를 적는다', async () => {
    const store = memoryStore();
    expect(await firstEntrySource(store, { referrer: 'search', src: null }, true)).toBe('search');
  });

  it('다시 온 날에는 그날 입구가 아니라 처음 적어 둔 것을 준다', async () => {
    const store = memoryStore();
    await firstEntrySource(store, { referrer: null, src: 'threads_bio' }, true);
    const later = await firstEntrySource(store, { referrer: 'inbox', src: null }, false);
    expect(later).toBe('threads_bio');
    expect(store.data.get('entry-first-source')).toBe('threads_bio');
  });

  it('첫 실행에 입구 표시가 없으면 direct 를 적는다. 모르는 null 과 갈라야 한다', async () => {
    const store = memoryStore();
    expect(await firstEntrySource(store, { referrer: null, src: null }, true)).toBe('direct');
    expect(store.data.get('entry-first-source')).toBe('direct');
  });

  it('첫 실행으로 세어져도 적어 둔 것이 있으면 그것을 준다', async () => {
    const store = memoryStore();
    store.data.set('entry-first-source', 'threads_bio');
    expect(await firstEntrySource(store, { referrer: 'search', src: null }, true)).toBe(
      'threads_bio',
    );
    expect(store.data.get('entry-first-source')).toBe('threads_bio');
  });

  it('첫 실행이 아닌데 적어 둔 것이 없으면 null 이다. 이 기능 전부터 쓰던 사람이다', async () => {
    const store = memoryStore();
    expect(await firstEntrySource(store, { referrer: 'inbox', src: null }, false)).toBeNull();
    expect(store.data.has('entry-first-source')).toBe(false);
  });

  it('저장소가 막히면 첫 실행에는 이번 입구를, 다시 온 날에는 null 을 준다', async () => {
    const broken: KeyValueStore = {
      get: async () => {
        throw new Error('blocked');
      },
      set: async () => {
        throw new Error('blocked');
      },
      remove: async () => undefined,
    };
    expect(await firstEntrySource(broken, { referrer: 'search', src: null }, false)).toBeNull();
    expect(await firstEntrySource(broken, { referrer: 'search', src: null }, true)).toBe('search');
  });
});
