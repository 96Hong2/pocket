import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DISMISS_FALLBACK_MS,
  FULL_SCREEN_LOAD_TIMEOUT_MS,
  INTERSTITIAL_RELEASE_MS,
  REWARDED_RELEASE_MS,
  STALL_AFTER_MS,
} from './fullScreenAdFlow';
import { runFullScreenAd, type AdSdk } from './fullScreenAdRun';

/**
 * 광고 한 편이 도는 길을 **실기기와 같은 코드로** 잰다.
 *
 * 목 브릿지(`mockBridge`)는 이 배선을 통째로 건너뛴다. 시간 제한도 닫힘 폴백도 여기에만
 * 있어서, 목으로 재면 실기기에서 실제로 나는 일을 하나도 못 잰다. 그래서 SDK 두 함수만
 * 가짜로 넣고 나머지는 그대로 돌린다.
 *
 * 여기서 지키는 것 다섯이다.
 *
 * - 🔴 **덮여 있어도 시계가 돈다.** 15초·35초가 지나면 화면을 풀어 준다
 * - 🔴 **화면을 푼 것과 갇혔다고 세는 것은 다르다.** 90초까지 덮고 있어야 갇힌 것이다
 * - 뜬 적이 없으면 **갇힌 것이 아니다**(못 띄운 것이다)
 * - 한 번도 안 숨었으면 「다시 보인다」 를 **닫힘으로 안 읽는다**
 * - 광고가 뜬 뒤 로드 채널로 오는 신호가 **판을 접지 않는다**
 */

interface Channel {
  onEvent: (event: { type: string }) => void;
  onError: (error: unknown) => void;
  cancelled: boolean;
}

let loads: Channel[] = [];
let shows: Channel[] = [];

const sdk: AdSdk = {
  load: (params) => {
    const entry: Channel = { onEvent: params.onEvent, onError: params.onError, cancelled: false };
    loads.push(entry);
    return () => {
      entry.cancelled = true;
    };
  },
  show: (params) => {
    const entry: Channel = { onEvent: params.onEvent, onError: params.onError, cancelled: false };
    shows.push(entry);
    return () => {
      entry.cancelled = true;
    };
  },
};

/** 화면이 보이나 안 보이나. jsdom 은 `visibilitychange` 를 저절로 쏘지 않는다. */
function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** 아직 답이 안 나왔는지. 나왔으면 그 값. */
async function peek(promise: Promise<unknown>): Promise<unknown> {
  const pending = Symbol('아직');
  return Promise.race([promise, Promise.resolve(pending)]);
}

beforeEach(() => {
  vi.useFakeTimers();
  loads = [];
  shows = [];
  setVisibility('visible');
});

afterEach(() => {
  vi.useRealTimers();
});

/** 광고를 띄우라고 보낸 상태까지 간다. */
function launch(
  hooks?: { onShown?: () => void; onStalled?: () => void },
  releaseMs: number = INTERSTITIAL_RELEASE_MS,
) {
  const promise = runFullScreenAd(sdk, 'group-1', releaseMs, hooks);
  loads[0].onEvent({ type: 'loaded' });
  return promise;
}

describe('정상으로 끝나는 판', () => {
  it('떴다가 닫히면 본 것이다', async () => {
    const promise = launch();
    shows[0].onEvent({ type: 'show' });
    shows[0].onEvent({ type: 'dismissed' });
    await expect(promise).resolves.toBe('watched');
  });

  it('보상까지 오면 받은 것이다', async () => {
    const promise = launch();
    shows[0].onEvent({ type: 'impression' });
    shows[0].onEvent({ type: 'userEarnedReward' });
    // 보상 뒤에도 닫힘을 기다린다. 먼저 답하면 광고가 덮은 채로 다음 화면이 열린다.
    shows[0].onEvent({ type: 'dismissed' });
    await expect(promise).resolves.toBe('earned');
  });

  it('떴다고 한 번만 알린다', async () => {
    const onShown = vi.fn();
    const promise = launch({ onShown });
    shows[0].onEvent({ type: 'show' });
    shows[0].onEvent({ type: 'impression' });
    shows[0].onEvent({ type: 'clicked' });
    expect(onShown).toHaveBeenCalledTimes(1);
    shows[0].onEvent({ type: 'dismissed' });
    await promise;
  });

  it('끝나면 두 구독을 다 끊는다', async () => {
    const promise = launch();
    shows[0].onEvent({ type: 'show' });
    shows[0].onEvent({ type: 'dismissed' });
    await promise;
    expect(loads[0].cancelled).toBe(true);
    expect(shows[0].cancelled).toBe(true);
  });
});

describe('갇힌 판', () => {
  it('🔴 광고가 덮고 있어도 15초가 지나면 화면을 풀어 준다', async () => {
    /*
      🔴 **이 판의 핵심이다**(2026-09-25 신고: 「2분 넘게 지나도 아무런 반응 없고 눌러지지도
      않아」). 예전에는 화면이 보이는 동안만 셌는데, 광고가 웹뷰를 덮으면 화면은 hidden 이다.
      그래서 갇힌 바로 그 상황에서 시계가 한 번도 안 돌았다.
    */
    const promise = launch();
    setVisibility('hidden');
    shows[0].onEvent({ type: 'impression' });

    expect(await peek(promise)).toBeTypeOf('symbol');
    await vi.advanceTimersByTimeAsync(INTERSTITIAL_RELEASE_MS + 10);
    await expect(promise).resolves.toBe('watched');
    // 우리에게 닫는 함수는 없다. 구독을 끊는 것이 유일하게 해 볼 수 있는 일이다.
    expect(shows[0].cancelled).toBe(true);
  });

  it('🔴 화면을 풀었다고 바로 갇힌 것으로 세지 않는다', async () => {
    /*
      15초에 안 끝난 광고가 전부 갇힌 것은 아니다. 30초짜리 동영상 전면도 있고, 전화를
      받느라 자리를 뜬 사람도 있다. 그것까지 갇힌 것으로 세면 **세션 광고가 통째로 꺼져**
      멀쩡한 사람에게서 수입이 사라진다. 화면은 먼저 풀고 판정은 뒤로 미룬다.
    */
    const onStalled = vi.fn();
    const promise = launch({ onStalled });
    setVisibility('hidden');
    shows[0].onEvent({ type: 'show' });

    await vi.advanceTimersByTimeAsync(INTERSTITIAL_RELEASE_MS + 10);
    await expect(promise).resolves.toBe('watched');
    expect(onStalled).not.toHaveBeenCalled();

    // 광고가 걷혀 화면이 돌아왔다. 갇힌 것이 아니었다.
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(STALL_AFTER_MS);
    expect(onStalled).not.toHaveBeenCalled();
  });

  it('🔴 90초까지 덮고 있으면 그때 갇혔다고 알린다', async () => {
    const onStalled = vi.fn();
    const promise = launch({ onStalled });
    setVisibility('hidden');
    shows[0].onEvent({ type: 'show' });

    await vi.advanceTimersByTimeAsync(INTERSTITIAL_RELEASE_MS + 10);
    await expect(promise).resolves.toBe('watched');

    await vi.advanceTimersByTimeAsync(STALL_AFTER_MS);
    expect(onStalled).toHaveBeenCalledTimes(1);
  });

  it('🔴 뜬 적이 없으면 갇힌 것이 아니다', async () => {
    /*
      띄우라고 보냈는데 한 번도 안 뜬 판이 있다(렌더 실패·느린 기기). 그것을 갇힌 것으로
      세면 「못 띄웠다」 와 「갇혔다」 가 한 칸에 들어간다. 갇힘을 세는 쪽이 그 세션 광고를
      통째로 끄기 때문에, 멀쩡한 사람의 광고까지 사라진다.
    */
    const onStalled = vi.fn();
    const promise = launch({ onStalled });

    await vi.advanceTimersByTimeAsync(INTERSTITIAL_RELEASE_MS + STALL_AFTER_MS);
    expect(onStalled).not.toHaveBeenCalled();
    await expect(promise).resolves.toBe('failed');
  });

  it('🔴 리워드는 35초까지 기다린다', async () => {
    /*
      리워드는 실측 30초다. 전면과 같은 15초로 끊으면 **끝까지 보던 사람의 보상이 잘린다.**
      사진 한 장을 받으려고 광고를 본 사람에게서 그 장을 빼앗는 셈이다.
    */
    const promise = launch(undefined, REWARDED_RELEASE_MS);
    setVisibility('hidden');
    shows[0].onEvent({ type: 'show' });

    await vi.advanceTimersByTimeAsync(INTERSTITIAL_RELEASE_MS + 10);
    expect(await peek(promise)).toBeTypeOf('symbol');

    shows[0].onEvent({ type: 'userEarnedReward' });
    await vi.advanceTimersByTimeAsync(REWARDED_RELEASE_MS);
    await expect(promise).resolves.toBe('earned');
  });

  it('보상까지 받았는데 닫힘만 안 오면 받은 것으로 끝낸다', async () => {
    // 닫힘을 안 주는 안드로이드 버전이 실재한다. 그 사람의 보상을 버리지 않는다.
    const promise = launch();
    shows[0].onEvent({ type: 'show' });
    shows[0].onEvent({ type: 'userEarnedReward' });

    await vi.advanceTimersByTimeAsync(INTERSTITIAL_RELEASE_MS + 10);
    await expect(promise).resolves.toBe('earned');
  });
});

describe('닫힘 폴백', () => {
  it('숨었다 돌아오면 닫힌 것으로 본다', async () => {
    const promise = launch();
    shows[0].onEvent({ type: 'show' });

    setVisibility('hidden');
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(DISMISS_FALLBACK_MS + 10);
    await expect(promise).resolves.toBe('watched');
  });

  it('🔴 한 번도 안 숨었으면 다시 보인다고 접지 않는다', async () => {
    /*
      광고가 우리 웹뷰를 안 가리는 조합에서 다른 이유로 visible 이 한 번 오면, 그것을
      닫힘으로 읽어 **광고가 떠 있는데 다음 화면이 열린다.**
    */
    const promise = launch();
    shows[0].onEvent({ type: 'show' });

    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(DISMISS_FALLBACK_MS + 10);
    expect(await peek(promise)).toBeTypeOf('symbol');

    shows[0].onEvent({ type: 'dismissed' });
    await expect(promise).resolves.toBe('watched');
  });

  it('돌아왔다 다시 숨으면 접지 않는다', async () => {
    // 광고를 눌러 광고주 페이지로 나갔다 오는 길에 화면이 잠깐 보인다. 그 사람이 가장 값지다.
    const promise = launch();
    shows[0].onEvent({ type: 'show' });

    setVisibility('hidden');
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(DISMISS_FALLBACK_MS / 2);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(DISMISS_FALLBACK_MS * 2);
    expect(await peek(promise)).toBeTypeOf('symbol');

    setVisibility('visible');
    shows[0].onEvent({ type: 'userEarnedReward' });
    shows[0].onEvent({ type: 'dismissed' });
    await expect(promise).resolves.toBe('earned');
  });
});

describe('로드 채널', () => {
  it('🔴 광고가 뜬 뒤에 오는 로드 오류가 판을 접지 않는다', async () => {
    /*
      로드 구독을 안 끊어 두면 그 채널로 오는 에러 하나가 판을 실패로 접는다. 광고는
      화면을 덮고 있는데 부르는 쪽은 다음 화면을 연다. 이 판이 막으려던 그 장면이다.
    */
    const promise = launch();
    shows[0].onEvent({ type: 'show' });
    loads[0].onError(new Error('늦게 온 로드 오류'));

    expect(await peek(promise)).toBeTypeOf('symbol');
    shows[0].onEvent({ type: 'dismissed' });
    await expect(promise).resolves.toBe('watched');
  });

  it('두 번째 loaded 로 광고를 또 띄우지 않는다', async () => {
    const promise = launch();
    loads[0].onEvent({ type: 'loaded' });
    expect(shows).toHaveLength(1);

    shows[0].onEvent({ type: 'show' });
    shows[0].onEvent({ type: 'dismissed' });
    await promise;
  });

  it('제때 못 불러오면 광고 없이 지나간다', async () => {
    const promise = runFullScreenAd(sdk, 'group-1', INTERSTITIAL_RELEASE_MS);
    await vi.advanceTimersByTimeAsync(FULL_SCREEN_LOAD_TIMEOUT_MS + 10);
    await expect(promise).resolves.toBe('failed');
    expect(shows).toHaveLength(0);
  });

  it('시간이 다 된 뒤에 오는 loaded 로는 안 띄운다', async () => {
    const promise = runFullScreenAd(sdk, 'group-1', INTERSTITIAL_RELEASE_MS);
    await vi.advanceTimersByTimeAsync(FULL_SCREEN_LOAD_TIMEOUT_MS + 10);
    loads[0].onEvent({ type: 'loaded' });
    expect(shows).toHaveLength(0);
    await expect(promise).resolves.toBe('failed');
  });
});
