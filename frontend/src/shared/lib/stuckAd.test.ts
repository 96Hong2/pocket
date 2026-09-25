import { describe, expect, it } from 'vitest';

import type { KeyValueStore } from '../toss';

import {
  STUCK_BLOCK_SCORE,
  STUCK_POINTS_DIED,
  STUCK_POINTS_SEEN,
  addStuckScore,
  clearAdOnScreen,
  markAdOnScreen,
  parseMark,
  readStuckScore,
  takeStuckMark,
} from './stuckAd';
import {
  adsBlockedByStall,
  getStuckMemory,
  markStalledNow,
  resetStuckMemory,
  setDeviceStuckScore,
  subscribeStuckMemory,
} from './stuckAdMemory';

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

/**
 * 🔴 **세는 데서 그치면 안 된다**(2026-09-25 밤, 세 번째 신고).
 *
 * 「15초 지나도 광고 안 꺼져서 그냥 앱을 꺼야 해.」 15초에 푸는 것은 우리 화면이고,
 * 광고는 토스가 띄운 것이라 그대로 덮고 있다. 세션 기억은 앱을 끄면 함께 사라져서
 * 다음에 열면 또 걸린다. 그래서 점수를 저장소에 남긴다.
 */
describe('갇힘 점수', () => {
  it('적은 적이 없으면 0이다', async () => {
    await expect(readStuckScore(fakeStore())).resolves.toBe(0);
  });

  it('망가진 저장소도 0으로 읽는다. 세는 일 때문에 광고가 막히면 안 된다', async () => {
    await expect(readStuckScore(broken)).resolves.toBe(0);
    await expect(addStuckScore(broken, STUCK_POINTS_SEEN)).resolves.toBe(STUCK_POINTS_SEEN);
  });

  it('쓰레기 값은 0으로 본다', async () => {
    await expect(readStuckScore(fakeStore({ 'ad-stuck-score': '어쩌구' }))).resolves.toBe(0);
    await expect(readStuckScore(fakeStore({ 'ad-stuck-score': '-3' }))).resolves.toBe(0);
  });

  it('🔴 앱이 죽은 것만으로는 안 끈다. 답답해서 끈 사람까지 걸린다', async () => {
    const store = fakeStore();
    const score = await addStuckScore(store, STUCK_POINTS_DIED);
    expect(score).toBeLessThan(STUCK_BLOCK_SCORE);
  });

  it('두 번 죽으면 끈다', async () => {
    const store = fakeStore();
    await addStuckScore(store, STUCK_POINTS_DIED);
    const score = await addStuckScore(store, STUCK_POINTS_DIED);
    expect(score).toBeGreaterThanOrEqual(STUCK_BLOCK_SCORE);
  });

  it('🔴 90초까지 덮고 있는 것을 직접 봤으면 그 한 번으로 끈다', async () => {
    const store = fakeStore();
    const score = await addStuckScore(store, STUCK_POINTS_SEEN);
    expect(score).toBeGreaterThanOrEqual(STUCK_BLOCK_SCORE);
  });

  it('점수는 읽어도 안 지워진다. 표와 다른 점이다', async () => {
    const store = fakeStore();
    await addStuckScore(store, STUCK_POINTS_SEEN);
    await readStuckScore(store);
    await expect(readStuckScore(store)).resolves.toBe(STUCK_POINTS_SEEN);
  });
});

describe('갇힘 기억', () => {
  it('앱을 열 때 읽어 둔 점수로 그 자리에서 정한다', () => {
    resetStuckMemory();
    expect(adsBlockedByStall()).toBe(false);
    setDeviceStuckScore(STUCK_BLOCK_SCORE - 1);
    expect(adsBlockedByStall()).toBe(false);
    setDeviceStuckScore(STUCK_BLOCK_SCORE);
    expect(getStuckMemory().score).toBe(STUCK_BLOCK_SCORE);
    expect(adsBlockedByStall()).toBe(true);
    resetStuckMemory();
  });

  it('점수가 모자라도 이번에 갇힌 것을 봤으면 닫는다', () => {
    resetStuckMemory();
    markStalledNow(STUCK_POINTS_SEEN);
    expect(getStuckMemory().stalled).toBe(true);
    expect(adsBlockedByStall()).toBe(true);
    resetStuckMemory();
  });

  it('🔴 바뀌면 듣고 있는 화면에 알린다', () => {
    /*
      점수는 저장소를 다녀온 뒤에 얹히고 갇힘 판정은 90초 뒤에 온다. 안 알리면 화면은
      「광고 보고 받기」 를 계속 권하는데 누르면 그냥 지나간다.
    */
    resetStuckMemory();
    let calls = 0;
    const stop = subscribeStuckMemory(() => {
      calls += 1;
    });
    setDeviceStuckScore(1);
    expect(calls).toBe(1);
    // 같은 값이면 안 알린다. 매번 알리면 그리기가 끝없이 돈다.
    setDeviceStuckScore(1);
    expect(calls).toBe(1);
    markStalledNow(1);
    expect(calls).toBe(2);
    stop();
    setDeviceStuckScore(9);
    expect(calls).toBe(2);
    resetStuckMemory();
  });
});
