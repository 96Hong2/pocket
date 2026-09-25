import { describe, expect, it } from 'vitest';

import type { KeyValueStore } from '../toss';

import {
  STUCK_DEATHS_BLOCK,
  addStuckDeath,
  clearAdOnScreen,
  clearStuckDeaths,
  markAdOnScreen,
  markStuckSeen,
  parseMark,
  readStuckState,
  takeStuckMark,
} from './stuckAd';
import {
  adsBlockedByStall,
  ensureStuckMemory,
  getStuckMemory,
  noteStuckDeaths,
  noteStuckSeen,
  rememberAdFinished,
  rememberStuckSeen,
  resetStuckMemory,
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
 * 「15초 지나도 광고 안꺼져서 그냥 앱을 꺼야해.」 15초에 푸는 것은 우리 화면이고 광고는
 * 토스가 띄운 것이라 그대로 덮고 있다. 세션 기억은 앱을 끄면 함께 사라져서 다시 열면
 * 또 걸렸다. 그래서 저장소에 남긴다.
 *
 * 증거 둘을 가른다. **직접 본 것**은 한 번으로 끄고, **덮인 채 죽은 것**은 연달아 두
 * 번일 때만 끈다. 뒤엣것은 고장에만 남는 표가 아니라서다.
 */
describe('갇힘 기록', () => {
  it('적은 적이 없으면 비어 있다', async () => {
    await expect(readStuckState(fakeStore())).resolves.toEqual({ seen: false, deaths: 0 });
  });

  it('망가진 저장소는 막지 않는다. 세는 일 때문에 광고가 꺼지면 안 된다', async () => {
    await expect(readStuckState(broken)).resolves.toEqual({ seen: false, deaths: 0 });
    await expect(addStuckDeath(broken)).resolves.toBe(1);
    await expect(markStuckSeen(broken)).resolves.toBeUndefined();
    await expect(clearStuckDeaths(broken)).resolves.toBeUndefined();
  });

  it('쓰레기 값은 0으로 본다', async () => {
    await expect(readStuckState(fakeStore({ 'ad-stuck-deaths': '어쩌구' }))).resolves.toEqual({
      seen: false,
      deaths: 0,
    });
    await expect(readStuckState(fakeStore({ 'ad-stuck-deaths': '-3' }))).resolves.toEqual({
      seen: false,
      deaths: 0,
    });
  });

  it('🔴 한 번 죽은 것만으로는 안 끈다. 지겨워서 끈 사람까지 걸린다', async () => {
    const store = fakeStore();
    expect(await addStuckDeath(store)).toBeLessThan(STUCK_DEATHS_BLOCK);
  });

  it('연달아 두 번 죽으면 끈다', async () => {
    const store = fakeStore();
    await addStuckDeath(store);
    expect(await addStuckDeath(store)).toBeGreaterThanOrEqual(STUCK_DEATHS_BLOCK);
  });

  it('🔴 광고 한 편이 제대로 걷히면 연속 기록이 끊긴다', async () => {
    /*
      누적으로 세면 오래 쓰는 사람은 거의 전원이 문턱에 닿는다. 사이에 멀쩡한 판이
      하나라도 있으면 그건 연속이 아니다.
    */
    const store = fakeStore();
    await addStuckDeath(store);
    await clearStuckDeaths(store);
    expect(await addStuckDeath(store)).toBe(1);
  });

  it('직접 본 기록은 읽어도 안 지워진다', async () => {
    const store = fakeStore();
    await markStuckSeen(store);
    await readStuckState(store);
    await expect(readStuckState(store)).resolves.toEqual({ seen: true, deaths: 0 });
  });
});

describe('갇힘 기억', () => {
  it('직접 본 한 번으로 닫는다', () => {
    resetStuckMemory();
    expect(adsBlockedByStall()).toBe(false);
    noteStuckSeen();
    expect(adsBlockedByStall()).toBe(true);
    resetStuckMemory();
  });

  it('죽은 횟수는 연달아 두 번부터 닫는다', () => {
    resetStuckMemory();
    noteStuckDeaths(STUCK_DEATHS_BLOCK - 1);
    expect(adsBlockedByStall()).toBe(false);
    noteStuckDeaths(STUCK_DEATHS_BLOCK);
    expect(adsBlockedByStall()).toBe(true);
    // 광고가 제대로 걷히면 되돌아간다.
    noteStuckDeaths(0);
    expect(adsBlockedByStall()).toBe(false);
    resetStuckMemory();
  });

  it('🔴 저장소를 다녀오기를 기다릴 수 있다', async () => {
    /*
      구독은 값이 **온 뒤에** 다시 그리게 할 뿐, 아직 안 온 값을 기다리게 하지 못한다.
      이 약속이 없으면 앱을 열자마자 광고가 뜨는 길에서 갇힌 기기에 광고가 한 편 더 뜬다.
    */
    resetStuckMemory();
    const store = fakeStore({ 'ad-stuck-seen': '1' });
    expect(adsBlockedByStall()).toBe(false);
    await ensureStuckMemory(store);
    expect(adsBlockedByStall()).toBe(true);
    resetStuckMemory();
  });

  it('읽어 오는 사이에 갇힌 것을 봤으면 그쪽이 이긴다', async () => {
    resetStuckMemory();
    const store = fakeStore();
    const reading = ensureStuckMemory(store);
    noteStuckSeen();
    await reading;
    expect(getStuckMemory().seen).toBe(true);
    resetStuckMemory();
  });

  it('🔴 갇힌 것을 본 한 번이 기억과 저장소에 함께 적힌다', async () => {
    /*
      **배선을 한 함수로 묶어 둔 이유가 여기다.** 광고 훅에서 부르는 자리는 90초짜리
      판이라 검사가 못 닿는다. 둘로 나눠 두면 한쪽만 부르는 어긋남을 아무도 못 잡는다.
    */
    resetStuckMemory();
    const store = fakeStore();
    rememberStuckSeen(store);
    expect(adsBlockedByStall()).toBe(true);
    await expect.poll(() => store.data['ad-stuck-seen']).toBe('1');
    resetStuckMemory();
  });

  it('광고가 제대로 걷히면 기억과 저장소에서 함께 끊는다', async () => {
    resetStuckMemory();
    const store = fakeStore({ 'ad-stuck-deaths': '1' });
    await ensureStuckMemory(store);
    expect(getStuckMemory().deaths).toBe(1);

    rememberAdFinished(store);
    expect(getStuckMemory().deaths).toBe(0);
    await expect.poll(() => store.data['ad-stuck-deaths']).toBe(undefined);
    resetStuckMemory();
  });

  it('🔴 바뀌면 듣고 있는 화면에 알린다', () => {
    /*
      갇힘 판정은 광고가 뜬 지 90초 뒤에 온다. 안 알리면 화면은 「광고 보고 받기」 를
      계속 권하는데 누르면 그냥 지나간다.
    */
    resetStuckMemory();
    let calls = 0;
    const stop = subscribeStuckMemory(() => {
      calls += 1;
    });
    noteStuckDeaths(1);
    expect(calls).toBe(1);
    // 같은 값이면 안 알린다. 매번 알리면 그리기가 끝없이 돈다.
    noteStuckDeaths(1);
    expect(calls).toBe(1);
    noteStuckSeen();
    expect(calls).toBe(2);
    stop();
    noteStuckDeaths(9);
    expect(calls).toBe(2);
    resetStuckMemory();
  });
});
